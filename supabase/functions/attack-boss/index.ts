/**
 * attack-boss Edge Function
 *
 * Responsibilities:
 *   1. Spawn a new boss raid when no active one exists (dev users only)
 *   2. Process player's Normal Attack against the active boss
 *   3. Handle ability use (/guard, /mend, /volley, /backstab, /cast)
 *   4. Fill the player's Ability Bank after an eligible attack
 *      Eligibility: text ≥5 chars OR image, not soft-blocked, not exact
 *      repeat of sender's previous message in this crew.
 *   5. Sync ability_bank to crew_members (persistent across raids) on every
 *      earn/spend — crew_combat_members is the live HUD source, crew_members
 *      is the persistent store seeded into new raid rows via init_combat_members.
 *   6. Handle Rogue momentum, Warrior Last Stand, Healer self-heal, Arcane Ward
 *   7. Broadcast combat events on the messages:{crewId} channel
 *
 * Ability Bank: all abilities cost 2 charges; eligible messages earn 1 charge.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ─── Stat formulas (mirrored from src/lib/game/combat.ts) ────────────────────

const CLASS_BASE_STATS: Record<string, { hp: number; atk: number; spd: number; dex: number; def: number; int: number }> = {
  warrior: { hp: 42, atk: 18, spd: 12, dex: 10, def: 24, int:  8 },
  healer:  { hp: 32, atk:  8, spd: 14, dex: 10, def: 15, int: 26 },
  archer:  { hp: 28, atk: 16, spd: 16, dex: 22, def: 12, int:  5 },
  rogue:   { hp: 24, atk: 20, spd: 22, dex: 16, def: 10, int:  5 },
  mage:    { hp: 24, atk: 22, spd: 13, dex:  8, def:  8, int: 24 },
}

function statsAtLevel(cls: string, level: number) {
  const base = CLASS_BASE_STATS[cls] ?? CLASS_BASE_STATS.warrior
  const scale = (v: number) => Math.round(v * (1 + 0.018 * (level - 1)))
  return { hp: scale(base.hp), atk: scale(base.atk), dex: scale(base.dex), def: scale(base.def), int: scale(base.int) }
}

function critChance(dex: number) { return Math.min(0.05 + dex * 0.006, 0.50) }
function rollCrit(dex: number)   { return Math.random() < critChance(dex) }

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
  return {
    hp:  Math.round(tier.baseHP  * (1 + 0.03 * levelInTier)),
    dmg: Math.round(tier.baseDMG * (1 + 0.02 * levelInTier)),
  }
}

const BANK_COST = 2   // charges spent per ability use (all classes)
const BANK_FILL = 1   // charges earned per eligible message
const ROGUE_DECAY_MS = 60 * 60 * 1000
const GUARD_DURATION_MS  = 60_000
const VOLLEY_DURATION_MS = 30_000

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function attackCopy(cls: string, dmg: number, isCrit: boolean): string {
  if (isCrit) {
    const c: Record<string, string> = {
      warrior: `CRITICAL STRIKE — ${dmg} DMG`, healer: `DIVINE SMITE — ${dmg} DMG`,
      archer:  `PRECISION SHOT — ${dmg} DMG`,  rogue:  `BACKSTAB — ${dmg} DMG`,
      mage:    `ARCANE BURST — ${dmg} DMG`,
    }
    return c[cls] ?? `CRIT — ${dmg} DMG`
  }
  return `${dmg} DMG`
}

// Persist bank to crew_members (authoritative store across raids)
function persistBank(supabase: ReturnType<typeof createClient>, crew_id: string, user_id: string, bank: number) {
  return supabase.from('crew_members')
    .update({ ability_bank: bank })
    .eq('crew_id', crew_id)
    .eq('user_id', user_id)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const {
      crew_id, user_id, username,
      message_type,
      soft_blocked,
      is_ability,
      ability_type,
    } = await req.json() as {
      crew_id: string; user_id: string; username: string
      message_type: string; soft_blocked: boolean
      is_ability?: boolean; ability_type?: string
    }

    if (!crew_id || !user_id) return json({ error: 'Missing crew_id or user_id' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── DEV GATE ────────────────────────────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_dev')
      .eq('id', user_id)
      .single()

    if (!profile?.is_dev) return json({ skipped: true, reason: 'not_dev' })

    // ── Fetch active raid for this crew ──────────────────────────────────────
    const { data: raid } = await supabase
      .from('active_raids')
      .select('*')
      .eq('crew_id', crew_id)
      .is('defeated_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    // ── No active raid — try to spawn one ────────────────────────────────────
    if (!raid) {
      const { data: crew } = await supabase
        .from('crews')
        .select('total_xp, level')
        .eq('id', crew_id)
        .single()

      if (!crew) return json({ skipped: true, reason: 'no_crew' })

      const bossStats = bossStatsForLevel(crew.level ?? 1)
      const now = new Date()
      const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000)

      const { data: boss } = await supabase
        .from('bosses')
        .select('id, name')
        .eq('type', 'void')
        .limit(1)
        .maybeSingle()

      if (!boss) return json({ skipped: true, reason: 'no_boss_template' })

      const { data: newRaid, error: raidErr } = await supabase
        .from('active_raids')
        .insert({
          crew_id,
          boss_id:    boss.id,
          current_hp: bossStats.hp,
          max_hp:     bossStats.hp,
          phase:      1,
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single()

      if (raidErr || !newRaid) return json({ skipped: true, reason: 'spawn_failed', detail: raidErr?.message })

      await supabase.rpc('init_combat_members', {
        p_raid_id:    newRaid.id,
        p_crew_id:    crew_id,
        p_crew_level: crew.level ?? 1,
      })

      await supabase.from('messages').insert({
        crew_id, user_id,
        content:      `BOSS_SPAWN:${boss.name}:${bossStats.hp}`,
        message_type: 'system', element_type: null, xp_awarded: 0,
      })

      return json({ spawned: true, raid_id: newRaid.id, boss_hp: bossStats.hp })
    }

    // ── Active raid exists — fetch caller's combat row ───────────────────────
    const { data: member } = await supabase
      .from('crew_combat_members')
      .select('*')
      .eq('raid_id', raid.id)
      .eq('user_id', user_id)
      .maybeSingle()

    if (!member) return json({ skipped: true, reason: 'no_combat_row' })

    if (member.is_downed) {
      return json({ downed: true, message: "You're down. Someone needs to revive you." })
    }

    const crewLevel = (await supabase.from('crews').select('level').eq('id', crew_id).single()).data?.level ?? 1
    const stats = statsAtLevel(member.class, crewLevel)

    // ── ABILITY USE ──────────────────────────────────────────────────────────
    if (is_ability && ability_type) {
      if (member.ability_bank < BANK_COST) {
        return json({ ability_blocked: true, reason: 'insufficient_bank', current_bank: member.ability_bank, cost: BANK_COST })
      }

      const newBank = member.ability_bank - BANK_COST
      const now     = new Date()

      switch (ability_type) {
        case 'guard': {
          const expiresAt = new Date(now.getTime() + GUARD_DURATION_MS).toISOString()
          await Promise.all([
            supabase.from('crew_combat_members').update({ ability_bank: newBank, guard_expires_at: expiresAt }).eq('id', member.id),
            supabase.from('active_raids').update({ guard_user_id: user_id, guard_expires_at: expiresAt }).eq('id', raid.id),
            persistBank(supabase, crew_id, user_id, newBank),
          ])
          await supabase.from('messages').insert({
            crew_id, user_id,
            content: `COMBAT:guard:${username}:${newBank}`,
            message_type: 'system', element_type: null, xp_awarded: 0,
          })
          return json({ ability: 'guard', bank_remaining: newBank, guard_expires_at: expiresAt })
        }

        case 'mend': {
          const healAmount = Math.max(5, Math.round(stats.int * 1.5 * 1.15))
          const { data: aliveMembers } = await supabase
            .from('crew_combat_members')
            .select('id, user_id, current_hp, max_hp')
            .eq('raid_id', raid.id)
            .eq('is_downed', false)

          const updates = (aliveMembers ?? []).map((m: { id: string; current_hp: number; max_hp: number }) =>
            supabase.from('crew_combat_members')
              .update({ current_hp: Math.min(m.max_hp, m.current_hp + healAmount) })
              .eq('id', m.id)
          )
          await Promise.all([
            ...updates,
            supabase.from('crew_combat_members').update({ ability_bank: newBank }).eq('id', member.id),
            persistBank(supabase, crew_id, user_id, newBank),
          ])
          await supabase.from('messages').insert({
            crew_id, user_id,
            content: `COMBAT:mend:${username}:${healAmount}:${newBank}`,
            message_type: 'system', element_type: null, xp_awarded: 0,
          })
          return json({ ability: 'mend', heal_amount: healAmount, bank_remaining: newBank })
        }

        case 'volley': {
          const expiresAt = new Date(now.getTime() + VOLLEY_DURATION_MS).toISOString()
          await Promise.all([
            supabase.from('crew_combat_members').update({ ability_bank: newBank }).eq('id', member.id),
            supabase.from('active_raids').update({ volley_expires_at: expiresAt }).eq('id', raid.id),
            persistBank(supabase, crew_id, user_id, newBank),
          ])
          const volleyActive = true
          const isCrit       = rollCrit(stats.dex)
          let dmg            = stats.atk
          if (isCrit) dmg    = Math.round(dmg * 1.5)
          if (volleyActive)  dmg = Math.round(dmg * 1.2)
          dmg                = Math.max(1, dmg)

          const { data: raidResult } = await supabase.rpc('damage_raid', {
            p_raid_id: raid.id, p_damage: dmg, p_user_id: user_id,
          })
          const newBossHP = Math.round(raidResult?.[0]?.current_hp ?? raid.current_hp - dmg)

          await supabase.from('messages').insert({
            crew_id, user_id,
            content: `COMBAT:volley:${username}:${dmg}:${Math.max(0, newBossHP)}:${newBank}`,
            message_type: 'system', element_type: null, xp_awarded: 0,
          })
          return json({ ability: 'volley', dmg, new_boss_hp: newBossHP, volley_expires_at: expiresAt, bank_remaining: newBank })
        }

        case 'backstab': {
          const bossHPPct = raid.current_hp / raid.max_hp
          const critMult  = bossHPPct > 0.5 ? 2.5 : 1.5
          const volleyActive = raid.volley_expires_at != null && new Date(raid.volley_expires_at as string) > now
          let dmg = Math.round(stats.atk * critMult)
          if (volleyActive) dmg = Math.round(dmg * 1.2)
          dmg = Math.max(1, dmg)

          await Promise.all([
            supabase.from('crew_combat_members').update({ ability_bank: newBank, momentum_stack: 0 }).eq('id', member.id),
            persistBank(supabase, crew_id, user_id, newBank),
          ])
          const { data: raidResult } = await supabase.rpc('damage_raid', {
            p_raid_id: raid.id, p_damage: dmg, p_user_id: user_id,
          })
          const newBossHP  = Math.round(raidResult?.[0]?.current_hp ?? 0)
          const defeated   = newBossHP === 0

          await supabase.from('messages').insert({
            crew_id, user_id,
            content: `COMBAT:backstab:${username}:${dmg}:${Math.max(0, newBossHP)}:${newBank}`,
            message_type: 'system', element_type: null, xp_awarded: 0,
          })

          if (defeated) await handleVictory(supabase, raid.id, crew_id, user_id, username)
          return json({ ability: 'backstab', dmg, is_crit: true, new_boss_hp: newBossHP, defeated, bank_remaining: newBank })
        }

        case 'cast': {
          const volleyActive = raid.volley_expires_at != null && new Date(raid.volley_expires_at as string) > now
          const isCrit       = rollCrit(stats.dex)
          let dmg            = stats.atk * 3
          if (isCrit)        dmg = Math.round(dmg * 1.5)
          if (volleyActive)  dmg = Math.round(dmg * 1.2)
          dmg                = Math.max(1, Math.round(dmg))

          await Promise.all([
            supabase.from('crew_combat_members').update({ ability_bank: newBank }).eq('id', member.id),
            persistBank(supabase, crew_id, user_id, newBank),
          ])
          const { data: raidResult } = await supabase.rpc('damage_raid', {
            p_raid_id: raid.id, p_damage: dmg, p_user_id: user_id,
          })
          const newBossHP = Math.round(raidResult?.[0]?.current_hp ?? 0)
          const defeated  = newBossHP === 0

          await supabase.from('messages').insert({
            crew_id, user_id,
            content: `COMBAT:cast:${username}:${dmg}:${Math.max(0, newBossHP)}:${newBank}`,
            message_type: 'system', element_type: null, xp_awarded: 0,
          })

          if (defeated) await handleVictory(supabase, raid.id, crew_id, user_id, username)
          return json({ ability: 'cast', dmg, is_crit: isCrit, new_boss_hp: newBossHP, defeated, bank_remaining: newBank })
        }

        default:
          return json({ skipped: true, reason: 'unknown_ability' })
      }
    }

    // ── NORMAL ATTACK ────────────────────────────────────────────────────────

    if (!['text', 'image'].includes(message_type)) return json({ skipped: true, reason: 'message_type' })
    if (soft_blocked) return json({ skipped: true, reason: 'soft_blocked' })

    const now         = new Date()
    const volleyActive = raid.volley_expires_at != null && new Date(raid.volley_expires_at as string) > now
    const isCrit      = rollCrit(stats.dex)

    let dmg       = stats.atk
    let selfHeal  = 0

    const hpPct = member.current_hp / member.max_hp
    if (member.class === 'warrior' && hpPct < 0.30) dmg = Math.round(dmg * 1.2)

    let newMomentumStack = member.momentum_stack
    if (member.class === 'rogue') {
      const lastMsgAt = member.last_msg_at ? new Date(member.last_msg_at as string).getTime() : 0
      if (lastMsgAt > 0 && now.getTime() - lastMsgAt > ROGUE_DECAY_MS) {
        newMomentumStack = 0
      }
      const momentumBonus = Math.min(newMomentumStack * 0.05, 0.25)
      if (momentumBonus > 0) dmg = Math.round(dmg * (1 + momentumBonus))
      newMomentumStack = Math.min(newMomentumStack + 1, 5)
    }

    if (member.class === 'healer') {
      if (isCrit) dmg = Math.round(dmg * 1.5)
      if (volleyActive) dmg = Math.round(dmg * 1.2)
      dmg = Math.max(1, dmg)
      selfHeal = Math.max(1, Math.round(dmg * 0.0575))
    } else {
      if (isCrit) dmg = Math.round(dmg * 1.5)
      if (volleyActive) dmg = Math.round(dmg * 1.2)
      dmg = Math.max(1, dmg)
    }

    const { data: raidResult } = await supabase.rpc('damage_raid', {
      p_raid_id: raid.id, p_damage: dmg, p_user_id: user_id,
    })
    const newBossHP  = Math.round(raidResult?.[0]?.current_hp ?? Math.max(0, raid.current_hp - dmg))
    const newPhase   = raidResult?.[0]?.phase ?? raid.phase
    const defeated   = newBossHP === 0

    // ── Bank eligibility: server-authoritative ───────────────────────────────
    const { data: recentMsgs } = await supabase
      .from('messages')
      .select('content, message_type')
      .eq('crew_id', crew_id)
      .eq('user_id', user_id)
      .in('message_type', ['text', 'image'])
      .order('created_at', { ascending: false })
      .limit(2)

    const latestMsg  = recentMsgs?.[0]
    const prevMsg    = recentMsgs?.[1]
    const tooShort   = message_type === 'text' && (latestMsg?.content?.length ?? 0) < 5
    const isRepeat   = latestMsg && prevMsg && latestMsg.content === prevMsg.content
    const bankFill   = (!tooShort && !isRepeat) ? BANK_FILL : 0
    const newBank    = member.ability_bank + bankFill

    // ── Update combat member + persist bank ──────────────────────────────────
    const memberUpdates: Record<string, unknown> = { ability_bank: newBank, last_msg_at: now.toISOString() }
    if (member.class === 'rogue') memberUpdates.momentum_stack = newMomentumStack
    if (selfHeal > 0) memberUpdates.current_hp = Math.min(member.max_hp, member.current_hp + selfHeal)

    await Promise.all([
      supabase.from('crew_combat_members').update(memberUpdates).eq('id', member.id),
      persistBank(supabase, crew_id, user_id, newBank),
    ])

    await supabase.from('messages').insert({
      crew_id, user_id,
      content:      `COMBAT:attack:${username}:${dmg}:${Math.max(0, newBossHP)}:${isCrit ? '1' : '0'}`,
      message_type: 'system', element_type: null, xp_awarded: 0,
    })

    if (newPhase > raid.phase) {
      await supabase.from('messages').insert({
        crew_id, user_id,
        content:      `COMBAT:phase:${newPhase}`,
        message_type: 'system', element_type: null, xp_awarded: 0,
      })
    }

    if (defeated) await handleVictory(supabase, raid.id, crew_id, user_id, username)

    return json({
      dmg, is_crit: isCrit,
      new_boss_hp:  Math.max(0, newBossHP),
      new_phase:    newPhase,
      bank_fill:    bankFill,
      new_bank:     newBank,
      self_heal:    selfHeal,
      momentum:     newMomentumStack,
      copy:         attackCopy(member.class, dmg, isCrit),
      defeated,
    })

  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})

// ─── Victory handler ──────────────────────────────────────────────────────────

async function handleVictory(
  supabase: ReturnType<typeof createClient>,
  raidId: string,
  crewId: string,
  mvpUserId: string,
  mvpUsername: string,
) {
  const { data: raid } = await supabase
    .from('active_raids')
    .select('boss_id, max_hp')
    .eq('id', raidId)
    .single()

  if (!raid) return

  const roll      = Math.random()
  const rarity    = roll < 0.05 ? 'legendary' : roll < 0.20 ? 'epic' : roll < 0.50 ? 'rare' : 'common'
  const rarities  = ['⚔️ Common Shard', '💠 Rare Crystal', '🌑 Epic Fragment', '🌟 Legendary Core']
  const rarityIdx = ['common', 'rare', 'epic', 'legendary'].indexOf(rarity)
  const name      = rarities[rarityIdx] ?? rarities[0]

  await Promise.all([
    supabase.from('artifacts').insert({
      crew_id:        crewId,
      name,
      rarity,
      source_boss_id: raid.boss_id,
      mvp_user_id:    mvpUserId,
      asset_type:     'sprite',
      metadata:       { mvp: mvpUsername },
    }),
    supabase.from('messages').insert({
      crew_id:      crewId,
      user_id:      mvpUserId,
      content:      `COMBAT:victory:${mvpUsername}:${rarity}:${name}`,
      message_type: 'system', element_type: null, xp_awarded: 0,
    }),
  ])
}
