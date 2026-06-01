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
      .select('*, bosses(weak_element)')
      .eq('crew_id', crew_id)
      .is('defeated_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (!raid) {
      return new Response(JSON.stringify({ no_raid: true }), { headers: JSON_HEADERS })
    }

    // Calculate damage
    const base      = DAMAGE_BASE[message_type] ?? 10
    const weakEl    = (raid.bosses as { weak_element: string | null })?.weak_element
    const isWeak    = element_type && weakEl && element_type === weakEl
    let   damage    = isWeak ? base * 2 : base

    // Combo bonus — last message within 60s
    const sixtyAgo = new Date(Date.now() - 60_000).toISOString()
    const { count: recentCount } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('crew_id', crew_id)
      .neq('user_id', user_id)
      .gte('created_at', sixtyAgo)

    if ((recentCount ?? 0) > 0) damage += 5

    // Cap at current HP
    const newHP     = Math.max(0, raid.current_hp - damage)
    const prevPhase = getPhase(raid.current_hp, raid.max_hp)
    const newPhase  = getPhase(newHP, raid.max_hp)

    // Update raid HP
    const updatePayload: Record<string, unknown> = {
      current_hp: newHP,
      phase:      newPhase,
    }

    const isDefeated = newHP <= 0
    if (isDefeated) {
      updatePayload.defeated_at  = new Date().toISOString()
      updatePayload.mvp_user_id  = user_id
    }

    await supabase.from('active_raids').update(updatePayload).eq('id', raid.id)

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

    // Victory
    if (isDefeated) {
      await supabase.from('messages').insert({
        crew_id,
        user_id,
        content:      '💀 THE VOID HAS FALLEN. Your crew defeated the darkness. Artifact incoming...',
        message_type: 'system',
        element_type: 'arcane',
        xp_awarded:   0,
      })
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
