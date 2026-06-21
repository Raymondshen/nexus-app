import type { MessageType, ElementType, TierName } from '@/types'
import { LEVEL_XP_BASE, LEVEL_XP_GROWTH_RATE, LEVEL_CAP } from '@/lib/config'

export const XP_VALUES: Record<MessageType, number> = {
  text:     10,
  voice:    25,
  image:    20,
  reaction:  5,
  system:    0,
  poll:      0,
  event:     0,
}

export const XP_BONUS_FIRST_TODAY = 20
export const XP_BONUS_COMBO       = 5
export const BOSS_XP_THRESHOLD    = 500

export function getElementType(content: string, messageType: MessageType): ElementType {
  if (messageType === 'voice')    return 'lightning'
  if (messageType === 'image')    return 'nature'
  if (messageType === 'reaction') return 'shadow'
  if (messageType === 'system')   return 'arcane'
  if (content.length < 20)        return 'fire'
  if (content.length > 150)       return 'water'
  return 'fire'
}

export function calculateXP(messageType: MessageType): number {
  return XP_VALUES[messageType] ?? 0
}

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

/** Tier name for a given level (20 levels per tier). */
export function tierForLevel(level: number): TierName {
  if (level <= 20) return 'Rookie'
  if (level <= 40) return 'Adventurer'
  if (level <= 60) return 'Veteran'
  if (level <= 80) return 'Elite'
  return 'Mythic'
}

/** True when a level is the first level of a new tier (21, 41, 61, 81). */
export function isTierBoundary(level: number): boolean {
  return level === 21 || level === 41 || level === 61 || level === 81
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
