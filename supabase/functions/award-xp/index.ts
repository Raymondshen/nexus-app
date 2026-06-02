import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const XP_VALUES: Record<string, number> = {
  text:     10,
  voice:    25,
  image:    20,
  reaction:  5,
  system:    0,
}

const XP_BONUS_FIRST_TODAY  = 20
const XP_BONUS_COMBO        = 5
const BOSS_XP_THRESHOLD     = 500
const XP_PER_LEVEL          = 500

function getElementType(content: string, messageType: string): string {
  if (messageType === 'voice')    return 'lightning'
  if (messageType === 'image')    return 'nature'
  if (messageType === 'reaction') return 'shadow'
  if (messageType === 'system')   return 'arcane'
  if (content.length < 20)        return 'fire'
  if (content.length > 150)       return 'water'
  return 'fire'
}

function getLevelFromXP(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const { message_id, crew_id, user_id, username, message_type, content } = await req.json()

    if (!message_id || !crew_id || !user_id || !message_type) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let xpAwarded = XP_VALUES[message_type] ?? 0

    // First message today bonus
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { count: todayCount } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('crew_id', crew_id)
      .eq('user_id', user_id)
      .gte('created_at', todayStart.toISOString())
      .neq('id', message_id)

    if (todayCount === 0) {
      xpAwarded += XP_BONUS_FIRST_TODAY
    }

    // Combo bonus (reply within 60s of someone else)
    const sixtySecondsAgo = new Date(Date.now() - 60_000).toISOString()
    const { count: recentCount } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('crew_id', crew_id)
      .neq('user_id', user_id)
      .gte('created_at', sixtySecondsAgo)

    if ((recentCount ?? 0) > 0) {
      xpAwarded += XP_BONUS_COMBO
    }

    if (xpAwarded === 0) {
      return new Response(
        JSON.stringify({ xp_awarded: 0 }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    // Log XP
    await supabase.from('crew_xp_log').insert({
      crew_id,
      user_id,
      xp_amount: xpAwarded,
      source:    message_type,
    })

    // Read current crew XP + level
    const { data: crewBefore } = await supabase
      .from('crews')
      .select('total_xp, level, name')
      .eq('id', crew_id)
      .single()

    const oldXP    = crewBefore?.total_xp ?? 0
    const newXP    = oldXP + xpAwarded
    const oldLevel = getLevelFromXP(oldXP)
    const newLevel = getLevelFromXP(newXP)

    // Update crew total_xp and level
    await supabase
      .from('crews')
      .update({ total_xp: newXP, level: newLevel })
      .eq('id', crew_id)

    // Update message xp_awarded + element_type
    await supabase
      .from('messages')
      .update({
        xp_awarded:   xpAwarded,
        element_type: getElementType(content ?? '', message_type),
      })
      .eq('id', message_id)

    // Level up notification
    if (newLevel > oldLevel) {
      await supabase.from('messages').insert({
        crew_id,
        user_id,
        content:      `LEVEL_UP:${newLevel}`,
        message_type: 'system',
        element_type: 'arcane',
        xp_awarded:   0,
      })
    }

    // Boss spawn — check if XP crossed a threshold
    const oldThreshold = Math.floor(oldXP / BOSS_XP_THRESHOLD)
    const newThreshold = Math.floor(newXP  / BOSS_XP_THRESHOLD)

    if (newThreshold > oldThreshold) {
      const { data: existingRaid } = await supabase
        .from('active_raids')
        .select('id')
        .eq('crew_id', crew_id)
        .is('defeated_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()

      if (!existingRaid) {
        const { data: voidBoss } = await supabase
          .from('bosses')
          .select('id, max_hp, name')
          .eq('type', 'void')
          .limit(1)
          .single()

        if (voidBoss) {
          const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

          const { data: newRaid } = await supabase
            .from('active_raids')
            .insert({
              crew_id,
              boss_id:    voidBoss.id,
              current_hp: voidBoss.max_hp,
              max_hp:     voidBoss.max_hp,
              expires_at: expiresAt,
            })
            .select('id')
            .single()

          if (newRaid) {
            // BOSS_SPAWN: prefix is parsed by MessageList → renders BossCard
            await supabase.from('messages').insert({
              crew_id,
              user_id,
              content:      `BOSS_SPAWN:${newRaid.id}`,
              message_type: 'system',
              element_type: 'arcane',
              xp_awarded:   0,
            })

            // Notify all crew members (fire-and-forget)
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!
            const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

            const { data: crewMembers } = await supabase
              .from('crew_members')
              .select('user_id')
              .eq('crew_id', crew_id)

            for (const member of crewMembers ?? []) {
              fetch(`${supabaseUrl}/functions/v1/send-notification`, {
                method:  'POST',
                headers: {
                  'Content-Type':  'application/json',
                  'Authorization': `Bearer ${serviceKey}`,
                },
                body: JSON.stringify({
                  user_id: member.user_id,
                  type:    'boss_spawned',
                  payload: {
                    boss_name: voidBoss.name ?? 'The Void',
                    crew_name: crewBefore?.name ?? '',
                    crew_id,
                  },
                }),
              }).catch(() => {})
            }
          }
        }
      }
    }

    // Notify other crew members of the new message (skip reactions — not worth a push)
    if (message_type !== 'reaction') {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

      const { data: otherMembers } = await supabase
        .from('crew_members')
        .select('user_id')
        .eq('crew_id', crew_id)
        .neq('user_id', user_id)

      for (const member of otherMembers ?? []) {
        fetch(`${supabaseUrl}/functions/v1/send-notification`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            user_id: member.user_id,
            type:    'message_received',
            payload: {
              sender_name:     username ?? 'Someone',
              content_preview: (content ?? '').slice(0, 80),
              crew_name:       crewBefore?.name ?? '',
              crew_id,
            },
          }),
        }).catch(() => {})
      }
    }

    return new Response(
      JSON.stringify({ xp_awarded: xpAwarded, new_level: newLevel }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }
})
