import { create } from 'zustand'
import type { Message, MessageWithProfile, ActiveRaid, ElementType } from '@/types'
import { getLevelFromXP, XP_PER_LEVEL } from '@/lib/game/xp'

export interface DamageFloatItem {
  id: number
  damage: number
  elementType: ElementType | null
}

interface ChatStore {
  messages:            Message[]
  crewXP:              number
  crewLevel:           number
  xpFloats:            { id: number; amount: number }[]
  activeRaid:          ActiveRaid | null
  damageFloats:        DamageFloatItem[]
  onlineUserIds:       Set<string>
  userCoins:           number
  gemBalance:          number
  crewName:            string
  replyTo:             MessageWithProfile | null
  friendshipXPByPair:  Record<string, number>

  setMessages:         (messages: Message[]) => void
  addMessage:          (message: Message) => void
  removeMessage:       (id: string) => void
  updateMessage:       (id: string, patch: Partial<Message>) => void
  setCrewXP:           (xp: number) => void
  addXP:               (amount: number) => void
  receiveXP:           (earned: number, newTotal: number) => void
  setActiveRaid:       (raid: ActiveRaid | null) => void
  dismissXPFloat:      (id: number) => void
  addDamageFloat:      (damage: number, elementType: ElementType | null) => void
  dismissDamageFloat:  (id: number) => void
  setOnlineUserIds:    (ids: Set<string>) => void
  setUserCoins:        (coins: number) => void
  addUserCoins:        (amount: number) => void
  setGemBalance:       (gems: number) => void
  addGemBalance:       (amount: number) => void
  setCrewName:         (name: string) => void
  setReplyTo:              (msg: MessageWithProfile | null) => void
  setFriendshipXP:         (pairKey: string, totalXP: number) => void
  pinnedScrollTargetId:    string | null
  setPinnedScrollTargetId: (id: string | null) => void
}

let floatCounter = 0

export const useChatStore = create<ChatStore>((set) => ({
  messages:           [],
  crewXP:             0,
  crewLevel:          1,
  xpFloats:           [],
  activeRaid:         null,
  damageFloats:       [],
  onlineUserIds:      new Set<string>(),
  userCoins:          0,
  gemBalance:         0,
  crewName:           '',
  replyTo:                null,
  friendshipXPByPair:     {},
  pinnedScrollTargetId:   null,

  setMessages: (messages) => set({ messages }),

  addMessage: (message) =>
    set((s) => {
      if (s.messages.some((m) => m.id === message.id)) return {}
      return { messages: [...s.messages, message] }
    }),

  removeMessage: (id) =>
    set((s) => ({ messages: s.messages.filter((m) => m.id !== id) })),

  updateMessage: (id, patch) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),

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

  // Sets the authoritative XP total and shows a float — use for remote XP events.
  receiveXP: (earned, newTotal) =>
    set((s) => ({
      crewXP:    newTotal,
      crewLevel: getLevelFromXP(newTotal),
      xpFloats:  [...s.xpFloats, { id: ++floatCounter, amount: earned }],
    })),

  setActiveRaid: (raid) => set({ activeRaid: raid }),

  dismissXPFloat: (id) =>
    set((s) => ({ xpFloats: s.xpFloats.filter((f) => f.id !== id) })),

  addDamageFloat: (damage, elementType) =>
    set((s) => ({
      damageFloats: [...s.damageFloats, { id: ++floatCounter, damage, elementType }],
    })),

  dismissDamageFloat: (id) =>
    set((s) => ({ damageFloats: s.damageFloats.filter((f) => f.id !== id) })),

  setOnlineUserIds: (ids) => set({ onlineUserIds: ids }),

  setUserCoins: (coins) => set({ userCoins: coins }),

  addUserCoins: (amount) =>
    set((s) => ({ userCoins: s.userCoins + amount })),

  setGemBalance: (gems) => set({ gemBalance: gems }),

  addGemBalance: (amount) =>
    set((s) => ({ gemBalance: s.gemBalance + amount })),

  setCrewName: (name) => set({ crewName: name }),

  setReplyTo: (msg) => set({ replyTo: msg }),

  setFriendshipXP: (pairKey, totalXP) =>
    set((s) => ({ friendshipXPByPair: { ...s.friendshipXPByPair, [pairKey]: totalXP } })),

  setPinnedScrollTargetId: (id) => set({ pinnedScrollTargetId: id }),
}))

export { XP_PER_LEVEL }

export function selectActivePins(messages: Message[]): Message[] {
  const now = Date.now()
  return messages.filter((m) =>
    m.pinned === true &&
    (m.pin_expires_at == null || new Date(m.pin_expires_at as string).getTime() > now)
  )
}
