import { create } from 'zustand'
import type { Message, MessageWithProfile } from '@/types'
import { getLevelFromXP } from '@/shared/utils/xp'

interface ChatStore {
  messages:            Message[]
  crewXP:              number
  crewLevel:           number
  onlineUserIds:       Set<string>
  lastActiveMap:       Record<string, number>
  userCoins:           number
  gemBalance:          number
  crewName:            string
  replyTo:             MessageWithProfile | null
  replyGroupId:        string | null
  editTo:              MessageWithProfile | null
  friendshipXPByPair:  Record<string, number>

  setMessages:         (messages: Message[]) => void
  prependMessages:     (messages: Message[]) => void
  addMessage:          (message: Message) => void
  removeMessage:       (id: string) => void
  updateMessage:       (id: string, patch: Partial<Message>) => void
  setCrewXP:           (xp: number) => void
  bumpCrewXP:          () => void
  receiveXP:           (earned: number, newTotal: number) => void
  setOnlineUserIds:    (ids: Set<string>) => void
  setLastActive:       (userId: string, ts: number) => void
  sweepOnlineUserIds:  (thresholdMs: number) => void
  resetPresence:       (selfId: string) => void
  setUserCoins:        (coins: number) => void
  addUserCoins:        (amount: number) => void
  setGemBalance:       (gems: number) => void
  addGemBalance:       (amount: number) => void
  setCrewName:         (name: string) => void
  setReplyTo:              (msg: MessageWithProfile | null, groupId?: string) => void
  setEditTo:               (msg: MessageWithProfile | null) => void
  setFriendshipXP:         (pairKey: string, totalXP: number) => void
  pinnedScrollTargetId:    string | null
  setPinnedScrollTargetId: (id: string | null) => void

  squadDetailsOpen:        boolean
  setSquadDetailsOpen:     (open: boolean) => void
}

export const useChatStore = create<ChatStore>((set) => ({
  messages:           [],
  crewXP:             0,
  crewLevel:          1,
  onlineUserIds:      new Set<string>(),
  lastActiveMap:      {},
  userCoins:          0,
  gemBalance:         0,
  crewName:           '',
  replyTo:                null,
  replyGroupId:           null,
  editTo:                 null,
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

  // Optimistically increments the bar by 1 — use at send time; setCrewXP reconciles after server responds.
  bumpCrewXP: () =>
    set((s) => { const n = s.crewXP + 1; return { crewXP: n, crewLevel: getLevelFromXP(n) } }),

  // Sets the authoritative XP total — use for remote XP events received via broadcast.
  receiveXP: (_, newTotal) =>
    set({ crewXP: newTotal, crewLevel: getLevelFromXP(newTotal) }),

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

  resetPresence: (selfId) => {
    const now = Date.now()
    set({ lastActiveMap: { [selfId]: now }, onlineUserIds: new Set([selfId]) })
  },

  setUserCoins: (coins) => set({ userCoins: coins }),

  addUserCoins: (amount) =>
    set((s) => ({ userCoins: s.userCoins + amount })),

  setGemBalance: (gems) => set({ gemBalance: gems }),

  addGemBalance: (amount) =>
    set((s) => ({ gemBalance: s.gemBalance + amount })),

  setCrewName: (name) => set({ crewName: name }),

  setReplyTo: (msg, groupId) => set({ replyTo: msg, replyGroupId: msg ? (groupId ?? null) : null }),

  setEditTo: (msg) => set({ editTo: msg }),

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
