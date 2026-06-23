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

  // init combat members
  await service.rpc('init_combat_members', {
    p_raid_id:    raid.id,
    p_crew_id:    crewId,
    p_crew_level: crewLevel,
  })

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
