import type { CombatClass } from '@/types'

// Flavor-only base stats shown on the class-select screens (onboarding +
// HomeClient's join-crew class picker). No combat system consumes these —
// classes are cosmetic since the boss-fight feature was removed.

export interface ClassStats {
  hp:  number; atk: number
  spd: number; dex: number; def: number; int: number
}

export const CLASS_BASE_STATS: Record<CombatClass, ClassStats> = {
  warrior: { hp: 42, atk: 18, spd: 12, dex: 10, def: 24, int:  8 },
  healer:  { hp: 32, atk:  8, spd: 14, dex: 10, def: 15, int: 26 },
  archer:  { hp: 28, atk: 16, spd: 16, dex: 22, def: 12, int:  5 },
  rogue:   { hp: 24, atk: 20, spd: 22, dex: 16, def: 10, int:  5 },
  mage:    { hp: 24, atk: 22, spd: 13, dex:  8, def:  8, int: 24 },
}
