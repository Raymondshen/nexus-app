/**
 * boss-attack Edge Function
 *
 * Called on a schedule (Vercel cron → /api/cron/boss-attack → here).
 * Runs every 30 minutes; checks each active raid to see if the boss's
 * attack interval has elapsed, then attacks the target member.
 *
 * Dev-gated: only attacks members who have a crew_combat_members row
 * (those rows are only created for is_dev=true users by init_combat_members).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ATTACK_INTERVAL_MS = 2 * 60 * 60 * 1000  // 2 hours, fixed
const PHASE_MULT         = 1.3                  // flat damage multiplier
const DOWNED_REGEN_MS = 8 * 60 * 60 * 1000  // 8 hours

// CLASS_BASE_STATS and bossStatsForLevel mirrored from combat.ts
const CLASS_BASE_DEF: Record<string, number> = {
  warrior: 24, healer: 15, archer: 12, rogue: 10, mage: 8,
}

function defAtLevel(cls: string, level: number): number {
  const base = CLASS_BASE_DEF[cls] ?? 12
  return Math.round(base * (1 + 0.018 * (level - 1)))
}

function damageTaken(bossDmg: number, phaseMult: number, def: number): number {
  return Math.round(bossDmg * phaseMult * (1 - def / (def + 100)))
}

function bossStatsForLevel(crewLevel: number) {
  const tiers = [
    { minLevel: 1,  baseDMG: 10  },
    { minLevel: 21, baseDMG: 25  },
    { minLevel: 41, baseDMG: 50  },
    { minLevel: 61, baseDMG: 90  },
    { minLevel: 81, baseDMG: 150 },
  ]
  const tier = [...tiers].reverse().find(t => crewLevel >= t.minLevel) ?? tiers[0]
  const levelInTier = crewLevel - tier.minLevel
  return { dmg: Math.round(tier.baseDMG * (1 + 0.02 * levelInTier)) }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url   = new URL(req.url)
  const force = url.searchParams.get('force') === 'true'

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const now = new Date()
  const results: unknown[] = []

  try {
    // Fetch all active, non-defeated raids that haven't expired
    const { data: raids } = await supabase
      .from('active_raids')
      .select('id, crew_id, boss_id, current_hp, max_hp, phase, expires_at, last_boss_attack_at, guard_user_id, guard_expires_at, volley_expires_at')
      .is('defeated_at', null)
      .gt('expires_at', now.toISOString())

    for (const raid of raids ?? []) {
      // Natural regen check — revive downed members whose 8hr window has passed
      const { data: downedMembers } = await supabase
        .from('crew_combat_members')
        .select('id, user_id, max_hp')
        .eq('raid_id', raid.id)
        .eq('is_downed', true)
        .lt('downed_at', new Date(now.getTime() - DOWNED_REGEN_MS).toISOString())

      for (const dm of downedMembers ?? []) {
        await supabase.from('crew_combat_members')
          .update({ current_hp: dm.max_hp, is_downed: false, downed_at: null })
          .eq('id', dm.id)
        results.push({ type: 'natural_revive', user_id: dm.user_id, raid_id: raid.id })
      }

      // Boss attack interval check
      const lastAttackAt = raid.last_boss_attack_at ? new Date(raid.last_boss_attack_at as string).getTime() : 0
      const timeSinceLast = now.getTime() - lastAttackAt

      if (!force && timeSinceLast < ATTACK_INTERVAL_MS) continue  // not yet time

      // Fetch all living members for this raid
      const { data: allMembers } = await supabase
        .from('crew_combat_members')
        .select('id, user_id, class, current_hp, max_hp, guard_expires_at, is_downed')
        .eq('raid_id', raid.id)
        .eq('is_downed', false)

      const livingMembers = (allMembers ?? []).filter((m: { is_downed: boolean }) => !m.is_downed)
      if (livingMembers.length === 0) continue

      // Target selection
      let target: typeof livingMembers[number]

      const guardUserId    = raid.guard_user_id
      const guardExpiresAt = raid.guard_expires_at ? new Date(raid.guard_expires_at as string) : null
      const guardActive    = !!guardUserId && !!guardExpiresAt && guardExpiresAt > now

      if (guardActive) {
        // Warrior taunt: attack guard_user_id if they're alive
        const guardMember = livingMembers.find((m: { user_id: string }) => m.user_id === guardUserId)
        target = guardMember ?? livingMembers[Math.floor(Math.random() * livingMembers.length)]
      } else {
        target = livingMembers[Math.floor(Math.random() * livingMembers.length)]
      }

      // Compute damage
      const { data: crew } = await supabase.from('crews').select('level').eq('id', raid.crew_id).single()
      const crewLevel = crew?.level ?? 1
      const { dmg: baseDmg } = bossStatsForLevel(crewLevel)
      const phaseMult = PHASE_MULT

      // DEF calculation — check Mage Arcane Ward and Warrior guard bonus
      let def = defAtLevel(target.class, crewLevel)

      // Mage Arcane Ward: HP < 40% → DEF × 1.3
      if (target.class === 'mage' && target.current_hp / target.max_hp < 0.40) {
        def = Math.round(def * 1.3)
      }
      // Warrior guard: DEF + 40%
      const memberGuardActive = target.guard_expires_at
        ? new Date(target.guard_expires_at as string) > now
        : false
      if (memberGuardActive) def = Math.round(def * 1.4)

      const finalDmg = Math.max(1, damageTaken(baseDmg, phaseMult, def))

      // Apply damage atomically
      const { data: hitResult } = await supabase.rpc('apply_boss_damage', {
        p_raid_id:   raid.id,
        p_member_id: target.user_id,
        p_final_dmg: finalDmg,
      })

      const hitRow    = (hitResult ?? [{ new_hp: 0, is_downed: false }])[0]
      const isDowned  = hitRow?.is_downed ?? false

      // Update last_boss_attack_at; expire guard if it was used
      const raidPatch: Record<string, unknown> = { last_boss_attack_at: now.toISOString() }
      if (guardActive && target.user_id === guardUserId) {
        raidPatch.guard_user_id    = null
        raidPatch.guard_expires_at = null
      }
      await supabase.from('active_raids').update(raidPatch).eq('id', raid.id)

      // Get target username for message copy
      const { data: tp } = await supabase.from('profiles').select('username').eq('id', target.user_id).single()
      const targetUsername = tp?.username ?? '???'

      // Insert combat event message
      const eventContent = isDowned
        ? `COMBAT:downed:${targetUsername}:${finalDmg}`
        : `COMBAT:boss_attack:${targetUsername}:${finalDmg}:${hitRow?.new_hp ?? 0}`

      const { data: anyMember } = await supabase
        .from('crew_members')
        .select('user_id')
        .eq('crew_id', raid.crew_id)
        .limit(1)
        .single()

      await supabase.from('messages').insert({
        crew_id:      raid.crew_id,
        user_id:      anyMember?.user_id ?? target.user_id,
        content:      eventContent,
        message_type: 'system',
        element_type: null,
        xp_awarded:   0,
      })

      results.push({ type: 'boss_attack', raid_id: raid.id, target: target.user_id, dmg: finalDmg, downed: isDowned })
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
