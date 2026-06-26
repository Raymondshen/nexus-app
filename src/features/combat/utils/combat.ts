import { BOSS_TIERS } from '@/shared/constants/config'
import type { CombatClass } from '@/types'

// ─── Class base stats (Level 1) ──────────────────────────────────────────────

export interface ClassStats {
  hp: number; atk: number
  spd: number; dex: number; def: number; int: number
}

export const CLASS_BASE_STATS: Record<CombatClass, ClassStats> = {
  warrior: { hp: 42, atk: 18, spd: 12, dex: 10, def: 24, int:  8 },
  healer:  { hp: 32, atk:  8, spd: 14, dex: 10, def: 15, int: 26 },
  archer:  { hp: 28, atk: 16, spd: 16, dex: 22, def: 12, int:  5 },
  rogue:   { hp: 24, atk: 20, spd: 22, dex: 16, def: 10, int:  5 },
  mage:    { hp: 24, atk: 22, spd: 13, dex:  8, def:  8, int: 24 },
}

/** All 7 stats scaled to the given level. */
export function statsAtLevel(cls: CombatClass, level: number): ClassStats {
  const base = CLASS_BASE_STATS[cls]
  const scale = (v: number) => Math.round(v * (1 + 0.018 * (level - 1)))
  return {
    hp:  scale(base.hp),
    atk: scale(base.atk),
    spd: scale(base.spd),
    dex: scale(base.dex),
    def: scale(base.def),
    int: scale(base.int),
  }
}

// ─── Crit ────────────────────────────────────────────────────────────────────

/** Crit chance 0–0.50, based on DEX stat. */
export function critChance(dex: number): number {
  return Math.min(0.05 + dex * 0.006, 0.50)
}

/** Roll a crit given the computed chance. */
export function rollCrit(dex: number): boolean {
  return Math.random() < critChance(dex)
}

// ─── DEF reduction ───────────────────────────────────────────────────────────

/** Boss damage after phase multiplier and DEF mitigation. */
export function damageTaken(bossDmg: number, phaseMult: number, def: number): number {
  return Math.round(bossDmg * phaseMult * (1 - def / (def + 100)))
}

// ─── Player attack damage ────────────────────────────────────────────────────

interface AttackOpts {
  cls:             CombatClass
  level:           number
  isCrit?:         boolean
  isLastStand?:    boolean   // Warrior passive: HP < 30%
  isArcaneWard?:   boolean   // Mage passive (DEF override handled at hit-receive time)
  momentumBonus?:  number    // Rogue: 0.05 per stack, max 0.25
  volleyActive?:   boolean   // Archer volley debuff on boss → +20% player dmg received by boss
}

/** Final player damage to boss. */
export function playerDamage(opts: AttackOpts): number {
  const stats = statsAtLevel(opts.cls, opts.level)
  let dmg = stats.atk

  // Crit: 1.5× (or 2.5× for Rogue @backstab above 50% boss HP, handled separately)
  if (opts.isCrit) dmg = Math.round(dmg * 1.5)

  // Warrior Last Stand passive
  if (opts.isLastStand) dmg = Math.round(dmg * 1.2)

  // Rogue Momentum bonus (stacks of 5%, cap 25%)
  if (opts.momentumBonus && opts.momentumBonus > 0) {
    dmg = Math.round(dmg * (1 + opts.momentumBonus))
  }

  // Volley debuff on boss: boss takes 20% more damage
  if (opts.volleyActive) dmg = Math.round(dmg * 1.2)

  return Math.max(1, dmg)
}

/** Healer normal attack (weak ATK). Returns {dmg, selfHeal}. */
export function healerAttack(level: number, isCrit: boolean, volleyActive: boolean) {
  const stats = statsAtLevel('healer', level)
  let dmg = stats.atk
  if (isCrit) dmg = Math.round(dmg * 1.5)
  if (volleyActive) dmg = Math.round(dmg * 1.2)
  const selfHeal = Math.max(1, Math.round(dmg * 0.05))
  return { dmg: Math.max(1, dmg), selfHeal }
}

// ─── Boss stat scaling ────────────────────────────────────────────────────────

export function bossStatsForLevel(crewLevel: number): { hp: number; dmg: number; tierName: string } {
  const tier = BOSS_TIERS.find(t => crewLevel >= t.minLevel && crewLevel <= t.maxLevel)
    ?? BOSS_TIERS[0]
  const levelInTier = crewLevel - tier.minLevel
  return {
    hp:       Math.round(tier.baseHP  * (1 + 0.03 * levelInTier)),
    dmg:      Math.round(tier.baseDMG * (1 + 0.02 * levelInTier)),
    tierName: tier.name,
  }
}

// ─── Combat copy (game-voice) ─────────────────────────────────────────────────

export function attackCopy(cls: CombatClass, dmg: number, isCrit: boolean): string {
  if (isCrit) {
    const crits: Record<CombatClass, string> = {
      warrior: `CRITICAL STRIKE — ${dmg} DMG`,
      healer:  `DIVINE SMITE — ${dmg} DMG`,
      archer:  `PRECISION SHOT — ${dmg} DMG`,
      rogue:   `BACKSTAB — ${dmg} DMG`,
      mage:    `ARCANE BURST — ${dmg} DMG`,
    }
    return crits[cls]
  }
  return `${dmg} DMG`
}

export function downcopy(username: string): string {
  return `${username} falls. The void closes in.`
}

export function reviveCopy(username: string): string {
  return `${username} rises from the darkness.`
}

export function phaseTransitionCopy(phase: number): string {
  const lines: Record<number, string> = {
    2: 'The void shudders. Phase II — it hungers now.',
    3: 'PHASE III — THE VOID RAGES. Strike true or fall.',
  }
  return lines[phase] ?? `Phase ${phase} begins.`
}

export function victoryCopy(bossName: string): string {
  return `${bossName} collapses into silence. The crew endures.`
}

export function escapeCopy(bossName: string): string {
  return `${bossName} slips back into the dark. The rift seals.`
}
