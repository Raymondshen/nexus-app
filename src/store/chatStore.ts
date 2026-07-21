import { create } from 'zustand'
import type { Message, MessageWithProfile } from '@/types'
import { getLevelFromXP } from '@/shared/utils/xp'
import { computeOnlineIds, setsEqual } from '@/shared/utils/presence'

interface ChatStore {
  messages:            Message[]
  crewXP:              number
  crewLevel:           number
  onlineUserIds:       Set<string>
  lastActiveMap:       Record<string, number>
  // Usernames currently typing in the active crew, sorted for stable equality checks.
  // Lives here (not ChatInput local state) so a presence sync only re-renders the small
  // typing-indicator component that selects this slice, not all of ChatInput.
  typingUsernames:     string[]
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
  // Message ids with a reaction toggle currently in flight. Consulted by MessageList's
  // realtime + background-fetch merges so a slower-arriving snapshot never clobbers a
  // fresher optimistic reaction update — replaces guessing staleness from emptiness.
  pendingReactionIds:  Set<string>
  markReactionPending:  (id: string) => void
  clearReactionPending: (id: string) => void
  setCrewXP:           (xp: number) => void
  bumpCrewXP:          () => void
  receiveXP:           (earned: number, newTotal: number) => void
  setOnlineUserIds:    (ids: Set<string>) => void
  setTypingUsernames:  (names: string[]) => void
  setLastActive:       (userId: string, ts: number) => void
  sweepOnlineUserIds:  (thresholdMs: number) => void
  markSelfOnline:      (selfId: string) => void
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

  // Retry dispatcher for a failed outbox send — owned/registered by ChatInput (which
  // holds the closures needed to redo XP/broadcast side effects on success), invoked
  // by MessageBubble when the user taps a "failed — tap to retry" message.
  requestRetrySend:        ((tempId: string) => void) | null
  setRequestRetrySend:     (fn: ((tempId: string) => void) | null) => void

  // Catch-up dispatcher — owned/registered by MessageList (which owns the message
  // fetch + profile-resolution + cache logic), invoked by ChatInput's channel
  // lifecycle whenever the realtime socket (re)connects or the app returns to the
  // foreground. Backfills messages that landed while the socket was down, since
  // broadcast + Postgres Changes are live-only and never replay a missed window.
  requestResync:           (() => void) | null
  setRequestResync:        (fn: (() => void) | null) => void

  // Incremented when the active crew's realtime channel must be rebuilt from
  // scratch (a CLOSED status is terminal in realtime-js — the channel is removed
  // from the socket and never rejoined, and phoenix's join() throws if called
  // twice on the same instance). ChatInput's channel effect and MessageList's
  // postgres_changes-listener effect both depend on this, so a bump makes both
  // re-acquire a fresh channel and re-attach their listeners.
  channelEpoch:            number
  bumpChannelEpoch:        () => void
}

export const useChatStore = create<ChatStore>((set) => ({
  messages:           [],
  crewXP:             0,
  crewLevel:          1,
  onlineUserIds:      new Set<string>(),
  lastActiveMap:      {},
  typingUsernames:    [],
  userCoins:          0,
  gemBalance:         0,
  crewName:           '',
  replyTo:                null,
  replyGroupId:           null,
  editTo:                 null,
  friendshipXPByPair:     {},
  pinnedScrollTargetId:   null,
  requestRetrySend:       null,
  requestResync:          null,
  channelEpoch:           0,

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
      const msgs = s.messages
      const last = msgs[msgs.length - 1]
      // Fast path: newest message appends (the overwhelmingly common case).
      // Otherwise insert in created_at order — a resynced/backfilled row can be
      // older than an optimistic send whose client clock sits ahead of the
      // server, and the display order comes straight from array order.
      if (!last || message.created_at >= last.created_at) {
        return { messages: [...msgs, message] }
      }
      let i = msgs.length - 1
      while (i >= 0 && msgs[i].created_at > message.created_at) i--
      return { messages: [...msgs.slice(0, i + 1), message, ...msgs.slice(i + 1)] }
    }),

  removeMessage: (id) =>
    set((s) => ({ messages: s.messages.filter((m) => m.id !== id) })),

  updateMessage: (id, patch) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),

  pendingReactionIds: new Set<string>(),

  markReactionPending: (id) =>
    set((s) => {
      if (s.pendingReactionIds.has(id)) return {}
      const next = new Set(s.pendingReactionIds)
      next.add(id)
      return { pendingReactionIds: next }
    }),

  clearReactionPending: (id) =>
    set((s) => {
      if (!s.pendingReactionIds.has(id)) return {}
      const next = new Set(s.pendingReactionIds)
      next.delete(id)
      return { pendingReactionIds: next }
    }),

  setCrewXP: (xp) =>
    set({ crewXP: xp, crewLevel: getLevelFromXP(xp) }),

  // Optimistically increments the bar by 1 — use at send time; setCrewXP reconciles after server responds.
  bumpCrewXP: () =>
    set((s) => { const n = s.crewXP + 1; return { crewXP: n, crewLevel: getLevelFromXP(n) } }),

  // Sets the authoritative XP total — use for remote XP events received via broadcast.
  receiveXP: (_, newTotal) =>
    set({ crewXP: newTotal, crewLevel: getLevelFromXP(newTotal) }),

  setOnlineUserIds: (ids) => set({ onlineUserIds: ids }),

  // Presence 'sync' fires on every join/leave/track change on the channel, not just
  // typing edges — bail out (return {}) when the sorted name list is unchanged so a
  // sync that didn't actually alter who's typing doesn't force a re-render of every
  // subscriber (mirrors sweepOnlineUserIds's setsEqual bail-out below).
  setTypingUsernames: (names) =>
    set((s) => {
      const sorted = [...names].sort()
      const prev = s.typingUsernames
      if (sorted.length === prev.length && sorted.every((n, i) => n === prev[i])) return {}
      return { typingUsernames: sorted }
    }),

  setLastActive: (userId, ts) =>
    set((s) => ({ lastActiveMap: { ...s.lastActiveMap, [userId]: ts } })),

  // Bails out (returns {}) when the recomputed set is identical to the current
  // one — this runs on a 15s timer plus on every peer heartbeat broadcast, and
  // without the equality check it allocated a new Set (forcing every
  // subscriber, e.g. SquadMemberRow's member sort, to re-render) even when
  // nobody's online/offline status actually changed.
  sweepOnlineUserIds: (thresholdMs) =>
    set((s) => {
      const ids = computeOnlineIds(s.lastActiveMap, thresholdMs)
      return setsEqual(ids, s.onlineUserIds) ? {} : { onlineUserIds: ids }
    }),

  // Marks self online without discarding already-known peer presence. This
  // store is app-global but the only mount point that calls it is per-crew
  // chat screens — clearing the whole map here (as the old resetPresence did)
  // meant every crew switch flashed all online dots to empty before the peer
  // DB fetch + broadcasts repopulated them.
  markSelfOnline: (selfId) =>
    set((s) => {
      const lastActiveMap = { ...s.lastActiveMap, [selfId]: Date.now() }
      const onlineUserIds = new Set(s.onlineUserIds)
      onlineUserIds.add(selfId)
      return { lastActiveMap, onlineUserIds }
    }),

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

  setRequestRetrySend: (fn) => set({ requestRetrySend: fn }),

  setRequestResync: (fn) => set({ requestResync: fn }),

  bumpChannelEpoch: () => set((s) => ({ channelEpoch: s.channelEpoch + 1 })),
}))

export function selectActivePins(messages: Message[]): Message[] {
  const now = Date.now()
  return messages.filter((m) =>
    m.pinned === true &&
    (m.pin_expires_at == null || new Date(m.pin_expires_at as string).getTime() > now)
  )
}
