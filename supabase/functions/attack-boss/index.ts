import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' }

const DAMAGE_BASE: Record<string, number> = {
  text: 10, voice: 25, image: 20, reaction: 5, system: 50,
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { crew_id, user_id, message_type, element_type, content } = await req.json()
    if (!crew_id || !user_id) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: JSON_HEADERS })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Find active raid for this crew
    const { data: raid } = await supabase
      .from('active_raids')
      .select('*, bosses(weak_element, name)')
      .eq('crew_id', crew_id)
      .is('defeated_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (!raid) {
      return new Response(JSON.stringify({ no_raid: true }), { headers: JSON_HEADERS })
    }

    // Calculate damage
    const base   = DAMAGE_BASE[message_type] ?? 10
    const bossInfo = raid.bosses as { weak_element: string | null; name: string | null } | null
    const weakEl   = bossInfo?.weak_element
    const bossName = bossInfo?.name ?? 'The Void'
    const isWeak = element_type && weakEl && element_type === weakEl
    let damage   = isWeak ? base * 2 : base

    // Combo bonus — last message within 60s from another user
    const sixtyAgo = new Date(Date.now() - 60_000).toISOString()
    const { count: recentCount } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('crew_id', crew_id)
      .neq('user_id', user_id)
      .gte('created_at', sixtyAgo)

    if ((recentCount ?? 0) > 0) damage += 5

    // Atomic HP update — prevents race conditions from concurrent attacks
    const { data: updatedRaid, error: updateErr } = await supabase
      .rpc('damage_raid', {
        p_raid_id:  raid.id,
        p_damage:   damage,
        p_user_id:  user_id,
      })
      .single()

    // Fall back to non-atomic update if the RPC doesn't exist yet
    let newHP:      number
    let newPhase:   number
    let isDefeated: boolean

    if (updateErr || !updatedRaid) {
      newHP     = Math.max(0, raid.current_hp - damage)
      newPhase  = getPhase(newHP, raid.max_hp)
      isDefeated = newHP <= 0

      const updatePayload: Record<string, unknown> = {
        current_hp: newHP,
        phase:      newPhase,
      }
      if (isDefeated) {
        updatePayload.defeated_at = new Date().toISOString()
        updatePayload.mvp_user_id = user_id
      }
      await supabase.from('active_raids').update(updatePayload).eq('id', raid.id)
    } else {
      const row   = updatedRaid as { current_hp: number; phase: number; defeated_at: string | null }
      newHP      = row.current_hp
      newPhase   = row.phase
      isDefeated = !!row.defeated_at
    }

    const prevPhase = getPhase(raid.current_hp, raid.max_hp)

    // Phase transition system messages
    if (newPhase > prevPhase) {
      const phaseContent = newPhase === 2
        ? '⚠ THE VOID AWAKENS — Phase 2. It grows stronger. Keep fighting.'
        : '☠ ENRAGE — Phase 3. Feed the chat or The Void heals.'

      await supabase.from('messages').insert({
        crew_id,
        user_id,
        content:      phaseContent,
        message_type: 'system',
        element_type: 'arcane',
        xp_awarded:   0,
      })
    }

    // Victory — call generate-artifact
    if (isDefeated) {
      const { data: participantRows } = await supabase
        .from('messages')
        .select('user_id')
        .eq('crew_id', crew_id)
        .gte('created_at', raid.started_at)
        .neq('message_type', 'system')

      const participantIds = [...new Set(
        (participantRows ?? []).map((r: { user_id: string }) => r.user_id)
      )]

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

      fetch(`${supabaseUrl}/functions/v1/generate-artifact`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          crew_id,
          boss_id:              raid.boss_id,
          mvp_user_id:          user_id,
          participant_user_ids: participantIds,
        }),
      }).catch(() => {})

      // Notify all crew members of the victory (fire-and-forget)
      const { data: crew } = await supabase
        .from('crews')
        .select('name')
        .eq('id', crew_id)
        .single()

      const { data: allMembers } = await supabase
        .from('crew_members')
        .select('user_id')
        .eq('crew_id', crew_id)

      for (const member of (allMembers ?? [])) {
        fetch(`${supabaseUrl}/functions/v1/send-notification`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            user_id: member.user_id,
            type:    'boss_defeated',
            payload: {
              boss_name: bossName,
              crew_name: crew?.name ?? '',
              crew_id,
            },
          }),
        }).catch(() => {})
      }
    }

    return new Response(
      JSON.stringify({ damage, new_hp: newHP, phase: newPhase, is_defeated: isDefeated }),
      { headers: JSON_HEADERS }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: JSON_HEADERS })
  }
})

function getPhase(hp: number, max: number): number {
  const pct = hp / max
  if (pct <= 0.30) return 3
  if (pct <= 0.60) return 2
  return 1
}
