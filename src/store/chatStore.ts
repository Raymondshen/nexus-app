import { create } from 'zustand'
import type { Message, MessageWithProfile } from '@/types'
import { getLevelFromXP } from '@/lib/game/xp'

interface ChatStore {
  messages:            Message[]
  crewXP:              number
  crewLevel:           number
  xpFloats:            { id: number; amount: number }[]
  onlineUserIds:       Set<string>
  lastActiveMap:       Record<string, number>
  userCoins:           number
  gemBalance:          number
  crewName:            string
  replyTo:             MessageWithProfile | null
  friendshipXPByPair:  Record<string, number>

  setMessages:         (messages: Message[]) => void
  prependMessages:     (messages: Message[]) => void
  addMessage:          (message: Message) => void
  removeMessage:       (id: string) => void
  updateMessage:       (id: string, patch: Partial<Message>) => void
  setCrewXP:           (xp: number) => void
  addXP:               (amount: number) => void
  receiveXP:           (earned: number, newTotal: number) => void
  dismissXPFloat:      (id: number) => void
  setOnlineUserIds:    (ids: Set<string>) => void
  setLastActive:       (userId: string, ts: number) => void
  sweepOnlineUserIds:  (thresholdMs: number) => void
  setUserCoins:        (coins: number) => void
  addUserCoins:        (amount: number) => void
  setGemBalance:       (gems: number) => void
  addGemBalance:       (amount: number) => void
  setCrewName:         (name: string) => void
  setReplyTo:              (msg: MessageWithProfile | null) => void
  setFriendshipXP:         (pairKey: string, totalXP: number) => void
  pinnedScrollTargetId:    string | null
  setPinnedScrollTargetId: (id: string | null) => void

  squadDetailsOpen:        boolean
  setSquadDetailsOpen:     (open: boolean) => void
}

let floatCounter = 0

export const useChatStore = create<ChatStore>((set) => ({
  messages:           [],
  crewXP:             0,
  crewLevel:          1,
  xpFloats:           [],
  onlineUserIds:      new Set<string>(),
  lastActiveMap:      {},
  userCoins:          0,
  gemBalance:         0,
  crewName:           '',
  replyTo:                null,
  friendshipXPByPair:     {},
  pinnedScrollTargetId:   null,
  squadDetailsOpen:       false,

  setMessages: (messages) => set({ messages }),

  prependMessages: (messages) =>
    set((s) => {
      const existingIds = new Set(s.messages.map((m) => m.id))
      const newOnes = messages.filter((m) => !existingIds.has(m.id))
      if (newOnes.length === 0) return {}
      return { messages: [...newOnes, ...s.messages] }
    }),

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

  dismissXPFloat: (id) =>
    set((s) => ({ xpFloats: s.xpFloats.filter((f) => f.id !== id) })),

  setOnlineUserIds: (ids) => set({ onlineUserIds: ids }),

  setLastActive: (userId, ts) =>
    set((s) => ({ lastActiveMap: { ...s.lastActiveMap, [userId]: ts } })),

  sweepOnlineUserIds: (thresholdMs) =>
    set((s) => {
      const now = Date.now()
      const ids = new Set(
        Object.entries(s.lastActiveMap)
          .filter(([, ts]) => now - ts < thresholdMs)
          .map(([id]) => id)
      )
      return { onlineUserIds: ids }
    }),

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

  setSquadDetailsOpen: (open) => set({ squadDetailsOpen: open }),
}))

export function selectActivePins(messages: Message[]): Message[] {
  const now = Date.now()
  return messages.filter((m) =>
    m.pinned === true &&
    (m.pin_expires_at == null || new Date(m.pin_expires_at as string).getTime() > now)
  )
}
