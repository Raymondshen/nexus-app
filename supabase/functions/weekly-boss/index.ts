/**
 * weekly-boss Edge Function
 *
 * Called every Sunday at 00:00 UTC via Vercel cron → /api/cron/weekly-boss.
 *
 * Execution order per spec:
 *   1. Soft-fail any active raids whose expires_at has passed (boss escaped).
 *   2. Spawn a new boss for every qualifying crew with no current active raid.
 *
 * "Qualifying crew": has at least one crew_members row with a combat class
 * (warrior|healer|archer|rogue|mage) and is not a DM crew (crews.is_dm = false).
 *
 * expires_at for each new raid = next Sunday 00:00 UTC (7 days from now).
 * Timezone assumption: UTC throughout (no crew-local timezone concept exists).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const COMBAT_CLASSES = ['warrior', 'healer', 'archer', 'rogue', 'mage']

function bossStatsForLevel(crewLevel: number) {
  const tiers = [
    { minLevel: 1,  baseHP: 500,   baseDMG: 10  },
    { minLevel: 21, baseHP: 2000,  baseDMG: 25  },
    { minLevel: 41, baseHP: 6000,  baseDMG: 50  },
    { minLevel: 61, baseHP: 15000, baseDMG: 90  },
    { minLevel: 81, baseHP: 35000, baseDMG: 150 },
  ]
  const tier = [...tiers].reverse().find(t => crewLevel >= t.minLevel) ?? tiers[0]
  const levelInTier = crewLevel - tier.minLevel
  return { hp: Math.round(tier.baseHP * (1 + 0.03 * levelInTier)) }
}

/** Returns the next Sunday 00:00 UTC (always 7 days ahead when called on Sunday) */
function nextSundayMidnightUTC(from: Date): Date {
  const d = new Date(from)
  const daysUntilNextSunday = d.getUTCDay() === 0 ? 7 : 7 - d.getUTCDay()
  d.setUTCDate(d.getUTCDate() + daysUntilNextSunday)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const now     = new Date()
  const results: unknown[] = []

  try {
    // ── STEP 1: Soft-fail expired raids (boss escaped without being defeated) ─

    const { data: expiredRaids } = await supabase
      .from('active_raids')
      .select('id, crew_id, boss_id')
      .is('defeated_at', null)
      .lte('expires_at', now.toISOString())

    for (const raid of expiredRaids ?? []) {
      await supabase.from('active_raids')
        .update({ defeated_at: now.toISOString() })
        .eq('id', raid.id)

      const [{ data: anyMember }, { data: crewInfo }] = await Promise.all([
        supabase.from('crew_members').select('user_id').eq('crew_id', raid.crew_id).limit(1).single(),
        supabase.from('crews').select('name').eq('id', raid.crew_id).single(),
      ])

      await Promise.all([
        supabase.from('artifacts').insert({
          crew_id:        raid.crew_id,
          name:           '⚔️ Common Shard',
          rarity:         'common',
          source_boss_id: raid.boss_id,
          mvp_user_id:    anyMember?.user_id ?? '',
          asset_type:     'sprite',
          metadata:       { consolation: true },
        }),
        supabase.from('messages').insert({
          crew_id:      raid.crew_id,
          user_id:      anyMember?.user_id ?? '',
          content:      `COMBAT:escaped:${crewInfo?.name ?? 'The Void'}`,
          message_type: 'system',
          element_type: null,
          xp_awarded:   0,
        }),
      ])

      results.push({ type: 'expired', raid_id: raid.id, crew_id: raid.crew_id })
    }

    // ── STEP 2: Spawn new raids for qualifying crews ─────────────────────────

    // Find all non-DM crews that have at least one member with a combat class
    const { data: combatMembers } = await supabase
      .from('crew_members')
      .select('crew_id')
      .in('class', COMBAT_CLASSES)

    const allCandidateIds = [...new Set(
      ((combatMembers ?? []) as Array<{ crew_id: string }>).map(r => r.crew_id)
    )]

    if (allCandidateIds.length === 0) {
      return new Response(JSON.stringify({ processed: results.length, results }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Filter out DM crews
    const { data: dmCrews } = await supabase
      .from('crews')
      .select('id')
      .eq('is_dm', true)
      .in('id', allCandidateIds)

    const dmCrewIds       = new Set(((dmCrews ?? []) as Array<{ id: string }>).map(c => c.id))
    const qualifyingCrewIds = allCandidateIds.filter(id => !dmCrewIds.has(id))

    // Skip crews that already have an active raid
    const { data: existingRaids } = await supabase
      .from('active_raids')
      .select('crew_id')
      .is('defeated_at', null)
      .in('crew_id', qualifyingCrewIds)

    const crewsWithRaid = new Set(
      ((existingRaids ?? []) as Array<{ crew_id: string }>).map(r => r.crew_id)
    )
    const crewsToSpawn = qualifyingCrewIds.filter(id => !crewsWithRaid.has(id))

    if (crewsToSpawn.length === 0) {
      return new Response(JSON.stringify({ processed: results.length, results }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Fetch void boss template
    const { data: boss } = await supabase
      .from('bosses')
      .select('id, name')
      .eq('type', 'void')
      .limit(1)
      .maybeSingle()

    if (!boss) {
      return new Response(JSON.stringify({ error: 'No void boss template found' }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const expiresAt = nextSundayMidnightUTC(now).toISOString()

    for (const crewId of crewsToSpawn) {
      const { data: crew } = await supabase
        .from('crews')
        .select('level')
        .eq('id', crewId)
        .single()

      const crewLevel = (crew as { level: number } | null)?.level ?? 1
      const bossStats = bossStatsForLevel(crewLevel)

      const { data: newRaid, error: raidErr } = await supabase
        .from('active_raids')
        .insert({
          crew_id:    crewId,
          boss_id:    boss.id,
          current_hp: bossStats.hp,
          max_hp:     bossStats.hp,
          phase:      1,
          expires_at: expiresAt,
        })
        .select('id')
        .single()

      if (raidErr || !newRaid) {
        results.push({ type: 'spawn_failed', crew_id: crewId, error: raidErr?.message })
        continue
      }

      const { data: anyMember } = await supabase
        .from('crew_members')
        .select('user_id')
        .eq('crew_id', crewId)
        .limit(1)
        .single()

      await Promise.all([
        supabase.rpc('init_combat_members', {
          p_raid_id:    newRaid.id,
          p_crew_id:    crewId,
          p_crew_level: crewLevel,
        }),
        supabase.from('messages').insert({
          crew_id:      crewId,
          user_id:      anyMember?.user_id ?? '',
          content:      `BOSS_SPAWN:${boss.name}:${bossStats.hp}`,
          message_type: 'system',
          element_type: null,
          xp_awarded:   0,
        }),
      ])

      results.push({ type: 'spawned', crew_id: crewId, raid_id: newRaid.id, boss_hp: bossStats.hp })
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
