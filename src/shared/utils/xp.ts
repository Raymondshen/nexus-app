import { LEVEL_XP_BASE, LEVEL_XP_GROWTH_RATE, LEVEL_CAP } from '@/shared/constants/config'

// ─── Leveling ────────────────────────────────────────────────────────────────

/** XP cost to advance from level N to level N+1. */
export function xpForLevel(level: number): number {
  return Math.round(LEVEL_XP_BASE * Math.pow(LEVEL_XP_GROWTH_RATE, level - 1))
}

/** Cumulative XP needed to reach a given level (sum of xpForLevel for all prior levels). */
export function cumulativeXpForLevel(level: number): number {
  if (level <= 1) return 0
  let total = 0
  for (let n = 1; n < level; n++) {
    total += xpForLevel(n)
  }
  return total
}

/** Current level for a given total XP, capped at LEVEL_CAP. */
export function levelFromTotalXp(totalXp: number): number {
  let level = 1
  let cumXP = 0
  while (level < LEVEL_CAP) {
    const nextCumXP = cumXP + xpForLevel(level)
    if (nextCumXP > totalXp) break
    cumXP = nextCumXP
    level++
  }
  return level
}

/** XP accumulated within the current level (for display). */
export function getXPInCurrentLevel(totalXp: number): number {
  const level = levelFromTotalXp(totalXp)
  return totalXp - cumulativeXpForLevel(level)
}

/** XP cost of the current level (0 when at cap). */
export function getXPForCurrentLevel(totalXp: number): number {
  const level = levelFromTotalXp(totalXp)
  if (level >= LEVEL_CAP) return 0
  return xpForLevel(level)
}

/** Progress through the current level as 0–100%. */
export function getXPProgress(totalXP: number): number {
  const level = levelFromTotalXp(totalXP)
  if (level >= LEVEL_CAP) return 100
  const inLevel = getXPInCurrentLevel(totalXP)
  const needed  = xpForLevel(level)
  return Math.round((inLevel / needed) * 100)
}

/** Backward-compatible alias used by chatStore. */
export const getLevelFromXP = levelFromTotalXp
