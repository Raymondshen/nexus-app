import { create } from 'zustand'
import type { Message, ActiveRaid, ElementType } from '@/types'
import { getLevelFromXP, XP_PER_LEVEL } from '@/lib/game/xp'

export interface DamageFloatItem {
  id: number
  damage: number
  elementType: ElementType | null
}

interface ChatStore {
  messages:   Message[]
  crewXP:     number
  crewLevel:  number
  xpFloats:   { id: number; amount: number }[]
  activeRaid: ActiveRaid | null
  damageFloats: DamageFloatItem[]

  setMessages:      (messages: Message[]) => void
  addMessage:       (message: Message) => void
  setCrewXP:        (xp: number) => void
  addXP:            (amount: number) => void
  setActiveRaid:    (raid: ActiveRaid | null) => void
  dismissXPFloat:   (id: number) => void
  addDamageFloat:   (damage: number, elementType: ElementType | null) => void
  dismissDamageFloat: (id: number) => void
}

let floatCounter = 0

export const useChatStore = create<ChatStore>((set) => ({
  messages:     [],
  crewXP:       0,
  crewLevel:    1,
  xpFloats:     [],
  activeRaid:   null,
  damageFloats: [],

  setMessages: (messages) => set({ messages }),

  addMessage: (message) =>
    set((s) => {
      if (s.messages.some((m) => m.id === message.id)) return {}
      return { messages: [...s.messages, message] }
    }),

  setCrewXP: (xp) =>
    set({ crewXP: xp, crewLevel: getLevelFromXP(xp) }),

  addXP: (amount) =>
    set((s) => {
      const newXP   = s.crewXP + amount
      const floatId = ++floatCounter
      return {
        crewXP:    newXP,
        crewLevel: getLevelFromXP(newXP),
        xpFloats:  [...s.xpFloats, { id: floatId, amount }],
      }
    }),

  setActiveRaid: (raid) => set({ activeRaid: raid }),

  dismissXPFloat: (id) =>
    set((s) => ({ xpFloats: s.xpFloats.filter((f) => f.id !== id) })),

  addDamageFloat: (damage, elementType) =>
    set((s) => ({
      damageFloats: [...s.damageFloats, { id: ++floatCounter, damage, elementType }],
    })),

  dismissDamageFloat: (id) =>
    set((s) => ({ damageFloats: s.damageFloats.filter((f) => f.id !== id) })),
}))

export { XP_PER_LEVEL }
