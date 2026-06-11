import type { MessageType, ElementType } from '@/types'

export const XP_VALUES: Record<MessageType, number> = {
  text:     10,
  voice:    25,
  image:    20,
  reaction:  5,
  system:    0,
  poll:      0,
}

export const XP_BONUS_FIRST_TODAY = 20
export const XP_BONUS_COMBO       = 5
export const XP_PER_LEVEL         = 500
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

export function getLevelFromXP(totalXP: number): number {
  return Math.floor(totalXP / XP_PER_LEVEL) + 1
}

export function getXPProgress(totalXP: number): number {
  const xpInCurrentLevel = totalXP % XP_PER_LEVEL
  return Math.round((xpInCurrentLevel / XP_PER_LEVEL) * 100)
}
