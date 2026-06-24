'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'

async function requireDev() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated' as const }
  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('is_dev').eq('id', session.user.id).single()
  if (!(profile as { is_dev?: boolean } | null)?.is_dev) return { error: 'Unauthorized' as const }
  return { session, service }
}

// ── Combat test actions ────────────────────────────────────────────────────────

export async function spawnBossAction(crewId: string): Promise<{ ok?: boolean; raidId?: string; error?: string }> {
  const auth = await requireDev()
  if ('error' in auth) return { error: auth.error }
  const { session, service } = auth

  // reject if already an active raid
  const { data: existing } = await service
    .from('active_raids')
    .select('id')
    .eq('crew_id', crewId)
    .is('defeated_at', null)
    .maybeSingle()
  if (existing) return { error: 'A raid is already active for this crew.' }

  // pick a random boss
  const { data: bosses } = await service.from('bosses').select('id, name, max_hp')
  if (!bosses || bosses.length === 0) return { error: 'No bosses found.' }
  type BossRow = { id: string; name: string; max_hp: number }
  const boss = (bosses as BossRow[])[Math.floor(Math.random() * bosses.length)]

  const now    = new Date()
  const expiry = new Date(now.getTime() + 48 * 60 * 60 * 1000)

  // insert active raid
  const { data: raid, error: raidErr } = await service
    .from('active_raids')
    .insert({
      crew_id:    crewId,
      boss_id:    boss.id,
      current_hp: boss.max_hp,
      max_hp:     boss.max_hp,
      phase:      1,
      started_at: now.toISOString(),
      expires_at: expiry.toISOString(),
    })
    .select('id')
    .single()
  if (raidErr || !raid) return { error: raidErr?.message ?? 'Failed to create raid.' }

  // get crew level
  const { data: crew } = await service.from('crews').select('level').eq('id', crewId).single()
  const crewLevel = (crew as { level?: number } | null)?.level ?? 1

  // system message so the chat shows the boss spawn banner
  await service.from('messages').insert({
    crew_id:      crewId,
    user_id:      session.user.id,
    content:      `BOSS_SPAWN:${boss.name}:${boss.max_hp}`,
    message_type: 'system',
  })

  return { ok: true, raidId: raid.id }
}

export async function forceRaidPhaseAction(crewId: string, phase: 2 | 3): Promise<{ ok?: boolean; error?: string }> {
  const auth = await requireDev()
  if ('error' in auth) return { error: auth.error }
  const { service } = auth

  const { error } = await service
    .from('active_raids')
    .update({ phase })
    .eq('crew_id', crewId)
    .is('defeated_at', null)
  if (error) return { error: error.message }
  return { ok: true }
}

export async function endRaidAction(crewId: string): Promise<{ ok?: boolean; error?: string }> {
  const auth = await requireDev()
  if ('error' in auth) return { error: auth.error }
  const { service } = auth

  const { error } = await service
    .from('active_raids')
    .update({ defeated_at: new Date().toISOString(), current_hp: 0 })
    .eq('crew_id', crewId)
    .is('defeated_at', null)
  if (error) return { error: error.message }
  return { ok: true }
}

export async function selfDownAction(crewId: string): Promise<{ ok?: boolean; error?: string }> {
  const auth = await requireDev()
  if ('error' in auth) return { error: auth.error }
  const { session, service } = auth

  const { data: raid } = await service
    .from('active_raids')
    .select('id')
    .eq('crew_id', crewId)
    .is('defeated_at', null)
    .maybeSingle()
  if (!raid) return { error: 'No active raid for this crew.' }

  const { error } = await service
    .from('crew_combat_members')
    .update({ is_downed: true, downed_at: new Date().toISOString() })
    .eq('raid_id', (raid as { id: string }).id)
    .eq('user_id', session.user.id)
  if (error) return { error: error.message }
  return { ok: true }
}

export async function addReviveTokenAction(crewId: string): Promise<{ ok?: boolean; error?: string }> {
  const auth = await requireDev()
  if ('error' in auth) return { error: auth.error }
  const { service } = auth

  const { data: existing } = await service
    .from('revive_tokens')
    .select('count')
    .eq('crew_id', crewId)
    .maybeSingle()

  if (existing) {
    const { error } = await service
      .from('revive_tokens')
      .update({ count: (existing as { count: number }).count + 1 })
      .eq('crew_id', crewId)
    if (error) return { error: error.message }
  } else {
    const { error } = await service
      .from('revive_tokens')
      .insert({ crew_id: crewId, count: 1 })
    if (error) return { error: error.message }
  }
  return { ok: true }
}

export async function resetCombatAction(crewId: string): Promise<{ ok?: boolean; error?: string }> {
  const auth = await requireDev()
  if ('error' in auth) return { error: auth.error }
  const { service } = auth

  // delete revive tokens first, then active raid (cascade kills combat members)
  await service.from('revive_tokens').delete().eq('crew_id', crewId)
  const { error } = await service.from('active_raids').delete().eq('crew_id', crewId)
  if (error) return { error: error.message }
  return { ok: true }
}

export async function joinRaidAction(crewId: string): Promise<{ ok?: boolean; error?: string }> {
  const auth = await requireDev()
  if ('error' in auth) return { error: auth.error }
  const { session, service } = auth
  const userId = session.user.id

  const { data: raid } = await service
    .from('active_raids')
    .select('id')
    .eq('crew_id', crewId)
    .is('defeated_at', null)
    .maybeSingle()
  if (!raid) return { error: 'No active raid for this crew.' }
  const raidId = (raid as { id: string }).id

  // Already joined — idempotent
  const { data: existing } = await service
    .from('crew_combat_members')
    .select('id')
    .eq('raid_id', raidId)
    .eq('user_id', userId)
    .maybeSingle()
  if (existing) return { ok: true }

  const { data: memberRow } = await service
    .from('crew_members')
    .select('class')
    .eq('crew_id', crewId)
    .eq('user_id', userId)
    .single()
  const cls = (memberRow as { class: string } | null)?.class
  const COMBAT_CLASSES = ['warrior', 'healer', 'archer', 'rogue', 'mage']
  if (!cls || !COMBAT_CLASSES.includes(cls)) return { error: 'No combat class assigned.' }

  const { data: crew } = await service.from('crews').select('level').eq('id', crewId).single()
  const crewLevel = (crew as { level: number } | null)?.level ?? 1

  const BASE: Record<string, { hp: number; mp: number }> = {
    warrior: { hp: 42, mp: 60 }, healer: { hp: 32, mp: 80 },
    archer:  { hp: 28, mp: 65 }, rogue:  { hp: 24, mp: 55 },
    mage:    { hp: 24, mp: 85 },
  }
  const { hp: baseHp, mp: baseMp } = BASE[cls] ?? { hp: 30, mp: 60 }
  const maxHp = Math.round(baseHp * (1 + 0.018 * (crewLevel - 1)))
  const maxMp = Math.round(baseMp * (1 + 0.018 * (crewLevel - 1)))

  const { error } = await service.from('crew_combat_members').insert({
    raid_id: raidId, user_id: userId, class: cls,
    current_hp: maxHp, max_hp: maxHp, current_mp: 0, max_mp: maxMp,
  })
  if (error) return { error: error.message }
  return { ok: true }
}

export async function triggerBossAttackAction(crewId: string): Promise<{ ok?: boolean; error?: string }> {
  const auth = await requireDev()
  if ('error' in auth) return { error: auth.error }
  const { service } = auth

  const { data: raid } = await service
    .from('active_raids')
    .select('id')
    .eq('crew_id', crewId)
    .is('defeated_at', null)
    .maybeSingle()
  if (!raid) return { error: 'No active raid for this crew.' }

  const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/boss-attack?force=true`
  const res = await fetch(fnUrl, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  })

  if (!res.ok) return { error: `boss-attack returned ${res.status}` }
  const data = await res.json() as { error?: string }
  if (data.error) return { error: data.error }
  return { ok: true }
}

export async function resetFriendshipXPAction(): Promise<{ ok?: boolean; error?: string }> {
  const auth = await requireDev()
  if ('error' in auth) return { error: auth.error }
  const { session, service } = auth

  const userId = session.user.id
  const [{ error: xpError }, { error: logError }] = await Promise.all([
    service.from('friendship_xp').delete().or(`user_a.eq.${userId},user_b.eq.${userId}`),
    service.from('friendship_xp_log').delete().eq('sender_id', userId),
  ])

  if (xpError) return { error: xpError.message }
  if (logError) return { error: logError.message }
  return { ok: true }
}

export async function resetGemCooldownAction(): Promise<{ ok?: boolean; error?: string }> {
  const auth = await requireDev()
  if ('error' in auth) return { error: auth.error }
  const { session, service } = auth

  const { error } = await service.from('profiles').update({ last_gem_claim: null }).eq('id', session.user.id)
  if (error) return { error: error.message }
  return { ok: true }
}
