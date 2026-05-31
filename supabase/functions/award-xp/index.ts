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

const XP_BONUS_FIRST_TODAY = 20
const XP_BONUS_COMBO       = 5
const BOSS_XP_THRESHOLD    = 500

function getElementType(content: string, messageType: string): string {
  if (messageType === 'voice')    return 'lightning'
  if (messageType === 'image')    return 'nature'
  if (messageType === 'reaction') return 'shadow'
  if (messageType === 'system')   return 'arcane'
  if (content.length < 20)        return 'fire'
  if (content.length > 150)       return 'water'
  return 'fire'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const { message_id, crew_id, user_id, message_type, content } = await req.json()

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

    // Check first message today bonus
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

    // Check combo bonus (reply within 60s of last message in crew)
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

    // Update crew total_xp and capture old value for threshold check
    const { data: crewBefore } = await supabase
      .from('crews')
      .select('total_xp')
      .eq('id', crew_id)
      .single()

    const oldXP = crewBefore?.total_xp ?? 0

    await supabase
      .from('crews')
      .update({ total_xp: oldXP + xpAwarded })
      .eq('id', crew_id)

    // Update message xp_awarded
    await supabase
      .from('messages')
      .update({
        xp_awarded:   xpAwarded,
        element_type: getElementType(content ?? '', message_type),
      })
      .eq('id', message_id)

    // Check if XP crossed a boss threshold (every BOSS_XP_THRESHOLD XP)
    const oldThreshold = Math.floor(oldXP / BOSS_XP_THRESHOLD)
    const newThreshold = Math.floor((oldXP + xpAwarded) / BOSS_XP_THRESHOLD)

    if (newThreshold > oldThreshold) {
      // Check no active raid already
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
          .select('id, max_hp')
          .eq('type', 'void')
          .limit(1)
          .single()

        if (voidBoss) {
          const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

          await supabase.from('active_raids').insert({
            crew_id,
            boss_id:    voidBoss.id,
            current_hp: voidBoss.max_hp,
            max_hp:     voidBoss.max_hp,
            expires_at: expiresAt,
          })

          // System message announcing the boss
          await supabase.from('messages').insert({
            crew_id,
            user_id,
            content:      '💀 THE VOID HAS AWAKENED. Your crew has 48 hours to defeat it. Fight together.',
            message_type: 'system',
            element_type: 'arcane',
            xp_awarded:   0,
          })
        }
      }
    }

    return new Response(
      JSON.stringify({ xp_awarded: xpAwarded }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }
})
