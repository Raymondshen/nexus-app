import type { ElementType, MessageType } from '@/types'

export const BOSS_SPAWN_PREFIX  = 'BOSS_SPAWN:'
export const VOID_BOSS_MAX_HP   = 1000
export const PHASE_2_PCT        = 0.60
export const PHASE_3_PCT        = 0.30
export const RAID_WINDOW_HOURS  = 48
export const SILENCE_HOURS      = 24

export const DAMAGE_VALUES: Partial<Record<MessageType, number>> = {
  text:     10,
  voice:    25,
  image:    20,
  reaction:  5,
  system:   50, // daily drop / arcane
}

export function calculateDamage(
  messageType: MessageType,
  elementType: ElementType | null,
  bossWeakElement: ElementType | null
): number {
  const base = DAMAGE_VALUES[messageType] ?? 10
  const isWeak = elementType && bossWeakElement && elementType === bossWeakElement
  return isWeak ? base * 2 : base
}

export function getBossPhase(currentHP: number, maxHP: number): 1 | 2 | 3 {
  const pct = currentHP / maxHP
  if (pct <= PHASE_3_PCT) return 3
  if (pct <= PHASE_2_PCT) return 2
  return 1
}

export function isRaidExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date()
}

export function parseBossSpawnRaidId(content: string): string | null {
  if (!content.startsWith(BOSS_SPAWN_PREFIX)) return null
  return content.slice(BOSS_SPAWN_PREFIX.length).trim() || null
}

export function formatTimeRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return '00:00:00'
  const h  = Math.floor(ms / 3_600_000)
  const m  = Math.floor((ms % 3_600_000) / 60_000)
  const s  = Math.floor((ms % 60_000) / 1_000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
