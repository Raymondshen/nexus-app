import { create } from 'zustand'
import type { ActiveRaid, CombatMember, CombatEvent } from '@/types'

interface CombatStore {
  activeRaid:        ActiveRaid | null
  memberStats:       Record<string, CombatMember>  // keyed by user_id
  combatEvents:      CombatEvent[]
  reviveTokens:      number
  damageFloats:      DamageFloat[]

  setActiveRaid:     (raid: ActiveRaid | null) => void
  patchRaid:         (patch: Partial<ActiveRaid>) => void
  setMemberStats:    (userId: string, stats: CombatMember) => void
  patchMemberHP:     (userId: string, hp: number, downed: boolean, downedAt: string | null) => void
  patchMemberMP:     (userId: string, mp: number) => void
  patchMemberMomentum: (userId: string, stack: number) => void
  setAllMembers:     (members: CombatMember[]) => void
  addCombatEvent:    (event: CombatEvent) => void
  clearCombatEvents: () => void
  setReviveTokens:   (count: number) => void
  spawnDamageFloat:  (float: DamageFloat) => void
  removeDamageFloat: (id: string) => void
}

export interface DamageFloat {
  id:     string
  value:  number
  isCrit: boolean
  x:      number
  y:      number
}

export const useCombatStore = create<CombatStore>((set) => ({
  activeRaid:   null,
  memberStats:  {},
  combatEvents: [],
  reviveTokens: 5,
  damageFloats: [],

  setActiveRaid: (raid) => set({ activeRaid: raid }),

  patchRaid: (patch) =>
    set((s) => s.activeRaid ? { activeRaid: { ...s.activeRaid, ...patch } } : {}),

  setMemberStats: (userId, stats) =>
    set((s) => ({ memberStats: { ...s.memberStats, [userId]: stats } })),

  patchMemberHP: (userId, hp, downed, downedAt) =>
    set((s) => {
      const m = s.memberStats[userId]
      if (!m) return {}
      return { memberStats: { ...s.memberStats, [userId]: { ...m, current_hp: hp, is_downed: downed, downed_at: downedAt } } }
    }),

  patchMemberMP: (userId, mp) =>
    set((s) => {
      const m = s.memberStats[userId]
      if (!m) return {}
      return { memberStats: { ...s.memberStats, [userId]: { ...m, current_mp: mp } } }
    }),

  patchMemberMomentum: (userId, stack) =>
    set((s) => {
      const m = s.memberStats[userId]
      if (!m) return {}
      return { memberStats: { ...s.memberStats, [userId]: { ...m, momentum_stack: stack } } }
    }),

  setAllMembers: (members) =>
    set({ memberStats: Object.fromEntries(members.map((m) => [m.user_id, m])) }),

  addCombatEvent: (event) =>
    set((s) => ({
      combatEvents: [...s.combatEvents.slice(-199), event],  // cap at 200
    })),

  clearCombatEvents: () => set({ combatEvents: [] }),

  setReviveTokens: (count) => set({ reviveTokens: count }),

  spawnDamageFloat: (float) =>
    set((s) => ({ damageFloats: [...s.damageFloats, float] })),

  removeDamageFloat: (id) =>
    set((s) => ({ damageFloats: s.damageFloats.filter((f) => f.id !== id) })),
}))
