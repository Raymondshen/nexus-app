import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Manual trigger for a specific crew (for testing)
  let targetCrewId: string | null = null
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      targetCrewId = body.crew_id ?? null
    } catch { /* ignore */ }
  }

  try {
    // Get The Void boss
    const { data: voidBoss } = await supabase
      .from('bosses')
      .select('id, max_hp')
      .eq('type', 'void')
      .limit(1)
      .single()

    if (!voidBoss) {
      return new Response(JSON.stringify({ error: 'Void boss not seeded' }), { status: 500, headers: JSON_HEADERS })
    }

    const silenceCutoff  = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const spawned: string[] = []

    if (targetCrewId) {
      // Single crew manual trigger
      await spawnForCrew(supabase, targetCrewId, voidBoss, true)
      spawned.push(targetCrewId)
    } else {
      // Find all crews with no messages in 24h and no active raid
      const { data: crews } = await supabase
        .from('crews')
        .select('id')

      for (const crew of crews ?? []) {
        const { count: recentMessages } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('crew_id', crew.id)
          .gte('created_at', silenceCutoff)

        if ((recentMessages ?? 0) > 0) continue

        const { data: existingRaid } = await supabase
          .from('active_raids')
          .select('id')
          .eq('crew_id', crew.id)
          .is('defeated_at', null)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle()

        if (existingRaid) continue

        await spawnForCrew(supabase, crew.id, voidBoss, false)
        spawned.push(crew.id)
      }
    }

    return new Response(
      JSON.stringify({ spawned, count: spawned.length }),
      { headers: JSON_HEADERS }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: JSON_HEADERS })
  }
})

async function spawnForCrew(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  crewId: string,
  voidBoss: { id: string; max_hp: number },
  force: boolean
) {
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

  const { data: raid, error } = await supabase
    .from('active_raids')
    .insert({
      crew_id:    crewId,
      boss_id:    voidBoss.id,
      current_hp: voidBoss.max_hp,
      max_hp:     voidBoss.max_hp,
      expires_at: expiresAt,
    })
    .select()
    .single()

  if (error || !raid) return

  // Get any crew member to be the system message sender
  const { data: member } = await supabase
    .from('crew_members')
    .select('user_id')
    .eq('crew_id', crewId)
    .limit(1)
    .single()

  if (!member) return

  // System message — encodes raid ID for BossCard detection
  await supabase.from('messages').insert({
    crew_id:      crewId,
    user_id:      member.user_id,
    content:      `BOSS_SPAWN:${raid.id}`,
    message_type: 'system',
    element_type: 'arcane',
    xp_awarded:   0,
  })
}
