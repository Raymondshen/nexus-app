'use client'

import { useEffect, useLayoutEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useVirtualizer } from '@tanstack/react-virtual'
import { get as idbGet, set as idbSet } from 'idb-keyval'

// Fires synchronously before the browser paints on the client; falls back to
// useEffect on the server (SSR) where useLayoutEffect is not available.
const useBrowserLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect
import { motion, AnimatePresence } from 'framer-motion'
import { format, isToday, isYesterday, isSameDay } from 'date-fns'
import { createClient } from '@/shared/supabase/client'
import { acquireCrewMessageChannel, releaseCrewMessageChannel } from '@/shared/supabase/crewMessageChannel'
import { useChatStore } from '@/store/chatStore'
import { MessageBubble } from './MessageBubble'
import { ChatMessageStampDivider } from './ChatMessageStampDivider'
import { ArrowBarDown } from 'pixelarticons/react/ArrowBarDown'
import { InviteCodeCard } from '@/shared/components/ui/InviteCodeCard'
import type { MessageWithProfile, Message, Profile, AvatarClass, SquadDefinition, SquadDefinitionWithCreator } from '@/types'

interface MessageListProps {
  crewId:               string
  crewName:             string
  currentUserId:        string
  memberProfiles:       Record<string, Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url' | 'status'>>
  creatorId?:           string | null
  memberPinnedVinyls?:  Record<string, { imageUrl: string | null; title: string | null }>
  /** Squad invite code — shown on the empty state's invite-code card while nobody else has joined yet. Undefined for DMs. */
  inviteCode?:          string
  /** [oldUsername.toLowerCase(), userId][] — past usernames of current members, so
   *  @mentions of a member's old name resolve to their current one. See username_history. */
  initialMentionAliases?: [string, string][]
}

function dayLabel(date: Date): string {
  if (isToday(date))     return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'MMM d, yyyy')
}

// ─── Empty state — Figma 426:1996 ────────────────────────────────────────────
// Two conditions:
//  - justCreated (crew has no other members yet): ghost + "share the invite code" copy + invite-code card
//  - otherwise (members present, nobody has sent a message yet): ghost + "send the first message" copy
function EmptyState({ inviteCode, justCreated }: { inviteCode?: string; justCreated: boolean }) {
  const showInvite = justCreated && !!inviteCode

  return (
    <div className="flex flex-col items-center w-full" style={{ gap: 'var(--x5)', paddingLeft: 'var(--md)', paddingRight: 'var(--md)' }}>
      <div className="flex flex-col items-center w-full" style={{ gap: 'var(--x2)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/sprites/ghost/south-flip.gif"
          alt=""
          width={100}
          height={100}
          style={{ imageRendering: 'pixelated', width: 100, height: 100, flexShrink: 0 }}
        />
        <p
          className="font-body font-normal leading-[1.5] text-center text-muted w-full"
          style={{ fontSize: 'var(--sm)', fontVariationSettings: '"opsz" 14' }}
        >
          {showInvite
            ? "Seems like nobody's in here yet. Share the code with your buddies to start the group chat!"
            : 'No messages yet. Send the first message to start the adventure!'}
        </p>
      </div>

      {showInvite && inviteCode && <InviteCodeCard inviteCode={inviteCode} />}
    </div>
  )
}

// ─── Display item types ───────────────────────────────────────────────────────
type DisplayItem =
  | { kind: 'spacer';   key: string }
  | { kind: 'divider';  label: string; key: string }
  | { kind: 'message';  message: MessageWithProfile; isOwn: boolean; showHeader: boolean; groupId: string; xpOverride?: number; coinOverride?: number }

function estimateItemSize(item: DisplayItem): number {
  switch (item.kind) {
    case 'spacer':  return 134
    case 'divider': return 36
    case 'message': return 72
    default:        return 72
  }
}

const LOAD_OLDER_BATCH = 50
const EMPTY_ALIAS_ENTRIES: [string, string][] = []

// Envelope stored in both sessionStorage (sync, fast) and IDB (persistent across iOS PWA kills)
type MsgCache = { messages: MessageWithProfile[]; savedAt: number }

// Content equality for the definitions list — covers every field MessageBubble
// actually renders (inline highlight matching, the preview sheet, text effects).
// Used to keep the previous array's identity when a re-fetch returns identical
// content, so MessageBubble's memo comparator (which checks `definitions` by
// reference) doesn't re-render every visible bubble for a no-op fetch.
function definitionsEqual(a: SquadDefinitionWithCreator[], b: SquadDefinitionWithCreator[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (
      x.id !== y.id ||
      x.word !== y.word ||
      x.definition !== y.definition ||
      x.text_effect !== y.text_effect ||
      x.creator_username !== y.creator_username
    ) return false
  }
  return true
}

export function MessageList({
  crewId,
  crewName,
  currentUserId,
  memberProfiles,
  creatorId,
  memberPinnedVinyls,
  inviteCode,
  initialMentionAliases = EMPTY_ALIAS_ENTRIES,
}: MessageListProps) {
  const router = useRouter()
  const onAvatarTap = useMemo(
    () => (userId: string) => {
      sessionStorage.setItem('nexus_chat_from', 'chat')
      router.push(`/chat/${crewId}/member/${userId}`)
    },
    [crewId, router],
  )

  // Individual selectors — prevents MessageList from re-rendering when unrelated store slices
  // change (userCoins, gemBalance, onlineUserIds, replyTo, etc.). Actions are stable
  // references so their selectors always return the same value and never cause re-renders.
  const messages               = useChatStore((s) => s.messages)
  const pinnedScrollTargetId   = useChatStore((s) => s.pinnedScrollTargetId)
  const channelEpoch           = useChatStore((s) => s.channelEpoch)
  const setMessages            = useChatStore((s) => s.setMessages)
  const prependMessages        = useChatStore((s) => s.prependMessages)
  const addMessage             = useChatStore((s) => s.addMessage)
  const updateMessage          = useChatStore((s) => s.updateMessage)
  const setPinnedScrollTargetId = useChatStore((s) => s.setPinnedScrollTargetId)
  const [localProfiles, setLocalProfiles] = useState<Record<string, Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url' | 'status'>>>(memberProfiles)
  const [historyLoaded, setHistoryLoaded] = useState(false)

  // Pagination state
  const [hasMore, setHasMore]     = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const isFetchingOlderRef  = useRef(false)
  const oldestCursorRef     = useRef<string | null>(null)
  // Scroll-position restoration after prepend
  const prevScrollTopRef   = useRef(0)
  const prevTotalSizeRef   = useRef(0)
  const anchorPendingRef        = useRef(false)
  const skipAutoScrollRef       = useRef(false)
  // When true, every getTotalSize() change re-pins scrollTop to the bottom.
  // Set on initial load and on every own/near-bottom new message; cleared once
  // we're actually ≤2px from the bottom, or the user manually scrolls up.
  const needsBottomCorrection   = useRef(false)

  const [definitions, setDefinitions] = useState<SquadDefinitionWithCreator[]>([])

  // Stable ref — only emits a new Set reference when the set of usernames actually changes.
  // Avatar-only profile updates won't re-render MessageBubble via memberUsernames prop.
  const memberUsernamesRef = useRef<Set<string>>(new Set())
  const memberUsernames = useMemo(() => {
    const next = Object.values(localProfiles).map((p) => p.username.toLowerCase())
    const prev = memberUsernamesRef.current
    if (next.length === prev.size && next.every((u) => prev.has(u))) return prev
    const set = new Set(next)
    memberUsernamesRef.current = set
    return set
  }, [localProfiles])

  // O(1) username → profile lookup used in renderItem to pre-compute each bubble's replyProfile.
  const usernameToProfile = useMemo(() => {
    const map: Record<string, Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url'>> = {}
    for (const p of Object.values(localProfiles)) map[p.username.toLowerCase()] = p
    return map
  }, [localProfiles])

  // Every past username (lowercased) any current member has ever had, mapped to their user id.
  // Seeded from username_history at load; the profiles-UPDATE realtime handler below adds an
  // entry the instant a member renames while this chat is open. Values never go stale even
  // through multiple renames — resolution always re-reads the CURRENT username out of
  // localProfiles at render time (see mentionAliases below), never out of this map itself.
  const [oldUsernameToUserId, setOldUsernameToUserId] = useState<Map<string, string>>(
    () => new Map(initialMentionAliases)
  )
  // @mention resolution map passed to MessageBubble: old username (lowercased) → CURRENT username.
  const mentionAliases = useMemo(() => {
    const map = new Map<string, string>()
    for (const [oldUsername, userId] of oldUsernameToUserId) {
      const current = localProfiles[userId]?.username
      if (current) map.set(oldUsername, current)
    }
    return map
  }, [oldUsernameToUserId, localProfiles])

  const scrollRef    = useRef<HTMLDivElement>(null)
  const profilesRef  = useRef(memberProfiles)
  profilesRef.current = memberProfiles

  const isNearBottomRef        = useRef(true)
  const hasInitialScrolled     = useRef(false)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)

  // ─── Cache load + initial DB fetch ───────────────────────────────────────────

  useBrowserLayoutEffect(() => {
    setMessages([])
    setHasMore(true)
    oldestCursorRef.current       = null
    hasInitialScrolled.current    = false
    needsBottomCorrection.current = false

    const cacheKey = `nexus-msgs-${crewId}`
    try {
      const raw = sessionStorage.getItem(cacheKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        // Support old format (plain array) and new format ({ messages, savedAt })
        const msgs = (Array.isArray(parsed) ? parsed : parsed?.messages) as MessageWithProfile[] | undefined
        if (Array.isArray(msgs) && msgs.length > 0) {
          setMessages(msgs)
          // Seed the pagination cursor so fetchOlderMessages can load history
          // even before the background DB fetch sets it. Without this, the
          // auto-fill effect fires but oldestCursorRef is null and bails.
          if (msgs.length > 0) oldestCursorRef.current = msgs[0].created_at
          setHistoryLoaded(true)
          return
        }
      }
    } catch { }
    setHistoryLoaded(false)
  }, [crewId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const cacheKey = `nexus-msgs-${crewId}`
    let cancelled = false

    const fallbackTimer = setTimeout(() => {
      if (!cancelled) setHistoryLoaded(true)
    }, 8000)

    ;(async () => {
      try {
        // ── Freshness fast-path ────────────────────────────────────────────────
        // Cache written within the last 30s is still fresh — the Realtime channel
        // will deliver any messages that arrived since the snapshot. Skipping the
        // DB fetch eliminates a Supabase round-trip on quick back-and-forth navigation.
        const rawSync = sessionStorage.getItem(cacheKey)
        if (rawSync) {
          try {
            const parsed = JSON.parse(rawSync)
            if (!Array.isArray(parsed) && typeof parsed.savedAt === 'number' && Date.now() - parsed.savedAt < 30_000) {
              clearTimeout(fallbackTimer)
              if (!cancelled) setHistoryLoaded(true)
              return
            }
          } catch {}
        } else {
          // ── IDB cold-start path ──────────────────────────────────────────────
          // sessionStorage is empty — either a new tab, app kill (iOS Safari clears
          // sessionStorage on PWA suspend/resume), or first visit. Check IDB for a
          // snapshot from the previous session so the chat feels instant on reopen.
          const idbEntry = await idbGet<MsgCache>(cacheKey).catch(() => null)
          if (idbEntry?.messages && Array.isArray(idbEntry.messages) && idbEntry.messages.length > 0 && !cancelled) {
            setMessages(idbEntry.messages)
            setHistoryLoaded(true)
            if (idbEntry.messages.length > 0) oldestCursorRef.current = idbEntry.messages[0].created_at
            // Populate sessionStorage so the next navigation uses the fast sync path
            try { sessionStorage.setItem(cacheKey, JSON.stringify(idbEntry)) } catch {}
          }
          // Always proceed with the DB fetch to merge messages posted since the IDB snapshot
        }

        // ── Full DB fetch ──────────────────────────────────────────────────────
        const supabase = createClient()
        const { data } = await supabase
          .from('messages')
          .select('*')
          .eq('crew_id', crewId)
          .order('created_at', { ascending: false })
          .limit(LOAD_OLDER_BATCH)

        const rows = ((data ?? []) as Message[]).reverse()
        const fetched: MessageWithProfile[] = rows
          .filter((m) => typeof m.content === 'string')
          .map((m) => ({
            ...m,
            profile: profilesRef.current[m.user_id] ?? {
              id: m.user_id, username: '???', avatar_class: null, avatar_url: null, status: null,
            },
          }))

        const cacheEntry: MsgCache = { messages: fetched.slice(-LOAD_OLDER_BATCH), savedAt: Date.now() }
        if (cancelled) {
          // Component unmounted before we could apply — still update the cache so
          // the next mount benefits from the freshly fetched data.
          try { sessionStorage.setItem(cacheKey, JSON.stringify(cacheEntry)) } catch {}
          idbSet(cacheKey, cacheEntry).catch(() => {})
          return
        }

        const existing = useChatStore.getState().messages
        const pendingReactionIds = useChatStore.getState().pendingReactionIds
        const existingMap = new Map(existing.map((m) => [m.id, m]))
        const fetchedIds = new Set(fetched.map((m) => m.id))
        // This background fetch can straddle a reaction toggle — its snapshot may predate
        // (or land mid-way through) an in-flight local mutation. Guessing staleness from
        // "fetched reactions happen to be empty" only protects an add, never a remove, so
        // trust the pending-set signal from the actual toggle instead of the row's shape.
        const fetchedWithLocalReactions = fetched.map((fetchedMsg) => {
          const existingMsg = existingMap.get(fetchedMsg.id)
          if (!existingMsg) return fetchedMsg
          if (pendingReactionIds.has(fetchedMsg.id)) {
            return { ...fetchedMsg, reactions: existingMsg.reactions }
          }
          return fetchedMsg
        })
        const merged = [
          ...fetchedWithLocalReactions,
          ...existing.filter((m) => !fetchedIds.has(m.id)),
        ].sort((a, b) => a.created_at.localeCompare(b.created_at))

        setMessages(merged)

        // Record the oldest message as the pagination cursor
        if (merged.length > 0) {
          oldestCursorRef.current = merged[0].created_at
        }
        // If the server returned fewer than LOAD_OLDER_BATCH, we're at the beginning
        if (rows.length < LOAD_OLDER_BATCH) setHasMore(false)

        // Write to sessionStorage (sync, fast) and IDB (persists across iOS PWA kills)
        const mergedEntry: MsgCache = { messages: merged.slice(-LOAD_OLDER_BATCH) as MessageWithProfile[], savedAt: Date.now() }
        try { sessionStorage.setItem(cacheKey, JSON.stringify(mergedEntry)) } catch {}
        idbSet(cacheKey, mergedEntry).catch(() => {})
      } catch {
        // Realtime still delivers live messages
      } finally {
        clearTimeout(fallbackTimer)
        if (!cancelled) setHistoryLoaded(true)
      }
    })()

    return () => {
      cancelled = true
      clearTimeout(fallbackTimer)
    }
  }, [crewId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Build display items ──────────────────────────────────────────────────────

  // Pre-pass: accumulate XP and coins per message group in a single pass.
  // A "group" is a run of messages from the same user within 60s on the same day
  // (or any message that starts a new group). The group leader's map entry holds
  // the total for the whole group so the header bubble can display the aggregate.
  const { groupXPMap, groupCoinMap } = useMemo(() => {
    const xpMap   = new Map<string, number>()
    const coinMap = new Map<string, number>()
    let preLastDate: Date | null = null
    let preLastUserId: string | null = null
    let preLastMsgTime = 0
    let preGroupLeaderId: string | null = null

    for (const msg of messages) {
      if (!msg.id || typeof msg.content !== 'string') continue
      const msgDate = new Date(msg.created_at)
      const msgTime = msgDate.getTime()

      if (!preLastDate || !isSameDay(preLastDate, msgDate)) {
        preLastUserId = null; preLastMsgTime = 0; preGroupLeaderId = null
      }
      preLastDate = msgDate

      if (msg.message_type === 'system' || msg.message_type === 'poll') {
        preLastUserId = null; preLastMsgTime = 0; preGroupLeaderId = null
        continue
      }

      const sameUser     = msg.user_id === preLastUserId
      const withinMinute = sameUser && (msgTime - preLastMsgTime) < 60_000
      const msgXP        = msg.xp_awarded ?? 0
      const msgCoins     = msgXP > 0 ? 1 : 0

      if (!withinMinute || !!msg.reply_to_id) {
        preGroupLeaderId = msg.id
        xpMap.set(msg.id, msgXP)
        coinMap.set(msg.id, msgCoins)
      } else if (preGroupLeaderId) {
        xpMap.set(preGroupLeaderId,   (xpMap.get(preGroupLeaderId)   ?? 0) + msgXP)
        coinMap.set(preGroupLeaderId, (coinMap.get(preGroupLeaderId) ?? 0) + msgCoins)
      }

      preLastUserId  = msg.user_id
      preLastMsgTime = msgTime
    }
    return { groupXPMap: xpMap, groupCoinMap: coinMap }
  }, [messages])

  const items: DisplayItem[] = useMemo(() => {
    const list: DisplayItem[] = []

    if (messages.length === 0) return list

    // Top spacer so messages start below the floating navbar
    list.push({ kind: 'spacer', key: 'top-spacer' })

    let lastDate:      Date | null   = null
    let lastUserId:    string | null = null
    let lastMsgTime:   number        = 0
    let groupLeaderId: string | null = null

    for (const msg of messages) {
      if (!msg.id || typeof msg.content !== 'string') continue

      // Historical combat system messages (from the now-removed boss-fight feature)
      // stay hidden rather than rendering as raw text.
      if (msg.message_type === 'system' &&
          (msg.content.startsWith('COMBAT:') || msg.content.startsWith('BOSS_SPAWN:'))) {
        continue
      }

      const msgDate = new Date(msg.created_at)
      const msgTime = msgDate.getTime()

      if (!lastDate || !isSameDay(lastDate, msgDate)) {
        list.push({ kind: 'divider', label: dayLabel(msgDate), key: `divider-${msg.id}` })
        lastUserId    = null
        lastMsgTime   = 0
        groupLeaderId = null
      }

      if (msg.message_type === 'poll') {
        list.push({ kind: 'message', message: msg as MessageWithProfile, isOwn: msg.user_id === currentUserId, showHeader: true, groupId: msg.id })
        lastUserId    = null
        lastMsgTime   = 0
        groupLeaderId = null
      } else if (msg.message_type === 'system') {
        list.push({ kind: 'message', message: msg as MessageWithProfile, isOwn: false, showHeader: false, groupId: msg.id })
        lastUserId    = null
        lastMsgTime   = 0
        groupLeaderId = null
      } else {
        const sameUser     = msg.user_id === lastUserId
        const withinMinute = sameUser && (msgTime - lastMsgTime) < 60_000
        const showHeader   = !withinMinute || !!msg.reply_to_id
        if (showHeader) groupLeaderId = msg.id
        const xpOverride   = showHeader ? groupXPMap.get(msg.id)   : undefined
        const coinOverride = showHeader ? groupCoinMap.get(msg.id) : undefined
        list.push({ kind: 'message', message: msg as MessageWithProfile, isOwn: msg.user_id === currentUserId, showHeader, groupId: groupLeaderId!, xpOverride, coinOverride })
        lastUserId  = msg.user_id
        lastMsgTime = msgTime
      }

      lastDate = msgDate
    }

    return list
  }, [messages, currentUserId, groupXPMap, groupCoinMap])

  // ─── TanStack Virtual ─────────────────────────────────────────────────────────

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimateItemSize(items[index] ?? { kind: 'message' } as DisplayItem),
    getItemKey: (index) => {
      const item = items[index]
      if (!item) return index
      if (item.kind === 'message') return item.message.tempId ?? item.message.id
      return item.key
    },
    overscan: 5,
  })

  // ─── Scroll-to-bottom helpers ─────────────────────────────────────────────────
  //
  // The virtualizer starts with estimated item sizes. As items render and
  // measureElement fires, getTotalSize() grows — but scrollTop doesn't auto-adjust,
  // leaving the user mid-list. needsBottomCorrection keeps pinToBottom active after
  // every getTotalSize() change until we're actually ≤2px from the bottom.

  const pinToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 2) {
      needsBottomCorrection.current = false
    }
  }, [])

  // Initial scroll — arms correction pass
  useBrowserLayoutEffect(() => {
    if (!historyLoaded || hasInitialScrolled.current || items.length === 0) return
    hasInitialScrolled.current    = true
    needsBottomCorrection.current = true
    pinToBottom()
  }, [historyLoaded, items.length, pinToBottom]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-pin after every measurement batch that expands the virtual canvas
  const totalVirtualSize = virtualizer.getTotalSize()
  useBrowserLayoutEffect(() => {
    if (needsBottomCorrection.current) pinToBottom()
  }, [totalVirtualSize, pinToBottom]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Auto-scroll on new message (append) ─────────────────────────────────────

  useEffect(() => {
    if (!hasInitialScrolled.current) return
    // Skip when a prepend is in progress — anchor restoration handles scroll instead
    if (skipAutoScrollRef.current) { skipAutoScrollRef.current = false; return }
    const lastMsg = messages[messages.length - 1]
    // Historical combat system messages stay hidden — see the filter above.
    if (
      lastMsg?.message_type === 'system' &&
      typeof lastMsg.content === 'string' &&
      (lastMsg.content.startsWith('COMBAT:') || lastMsg.content.startsWith('BOSS_SPAWN:'))
    ) return
    const ownSend = !!lastMsg && lastMsg.user_id === currentUserId
    if (ownSend || isNearBottomRef.current) {
      needsBottomCorrection.current = true
      pinToBottom()
    }
  }, [messages.length, pinToBottom]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Scroll restoration after prepend (fires before paint) ──────────────────
  // Delta strategy: new items are inserted above the viewport. Their combined
  // estimated height = getTotalSize() delta. Adding that delta to the old
  // scrollTop keeps every currently-visible item at the same pixel position.

  useBrowserLayoutEffect(() => {
    if (!anchorPendingRef.current) return
    anchorPendingRef.current = false
    const el = scrollRef.current
    if (!el) return
    const delta = virtualizer.getTotalSize() - prevTotalSizeRef.current
    if (delta > 0) el.scrollTop = prevScrollTopRef.current + delta
    // Depend on `messages.length` (raw fetched count), NOT `items.length` (filtered
    // display count) — a prepended batch that's entirely COMBAT/BOSS_SPAWN leaves
    // `items.length` unchanged, so this effect would never re-fire and
    // `anchorPendingRef` would stay stuck `true` forever, permanently blocking both
    // the auto-fill effect and manual scroll-up pagination (both gate on it). Same
    // reasoning as the auto-fill effect's dependency choice below.
  }, [messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Pinned message scroll ────────────────────────────────────────────────────

  useEffect(() => {
    if (!pinnedScrollTargetId) return
    const idx = items.findIndex(
      (item) => item.kind === 'message' && item.message.id === pinnedScrollTargetId
    )
    if (idx !== -1) {
      virtualizer.scrollToIndex(idx, { align: 'center', behavior: 'smooth' })
    }
    setPinnedScrollTargetId(null)
  }, [pinnedScrollTargetId, setPinnedScrollTargetId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Scroll handler: near-bottom detection + pagination trigger ───────────────

  const fetchOlderMessages = useCallback(async () => {
    if (isFetchingOlderRef.current || !hasMore || !oldestCursorRef.current) return
    isFetchingOlderRef.current = true
    setLoadingOlder(true)

    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('crew_id', crewId)
        .lt('created_at', oldestCursorRef.current)
        .order('created_at', { ascending: false })
        .limit(LOAD_OLDER_BATCH)

      const rows = ((data ?? []) as Message[]).reverse()
      if (rows.length < LOAD_OLDER_BATCH) setHasMore(false)
      if (rows.length === 0) return

      const older: MessageWithProfile[] = rows
        .filter((m) => typeof m.content === 'string')
        .map((m) => ({
          ...m,
          profile: profilesRef.current[m.user_id] ?? {
            id: m.user_id, username: '???', avatar_class: null, avatar_url: null,
          },
        }))

      // Snapshot scroll position and total virtual height before the state
      // update so useLayoutEffect can compensate by the exact size delta.
      prevScrollTopRef.current  = scrollRef.current?.scrollTop ?? 0
      prevTotalSizeRef.current  = virtualizer.getTotalSize()
      anchorPendingRef.current  = true
      skipAutoScrollRef.current = true

      // Advance cursor to the oldest of the newly loaded batch
      oldestCursorRef.current = rows[0].created_at

      prependMessages(older as Message[])
    } catch {
      // Silently ignore — user can scroll up again to retry
      anchorPendingRef.current  = false
      skipAutoScrollRef.current = false
    } finally {
      isFetchingOlderRef.current = false
      setLoadingOlder(false)
    }
  }, [crewId, hasMore, prependMessages]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill: when the visible items don't overflow the scroll container (because the
  // initial batch of 50 messages is dominated by COMBAT/BOSS_SPAWN system messages that
  // are filtered from the chat display), the user can never scroll up and handleScroll
  // never fires — pagination is stuck. Keep fetching older batches until the viewport
  // has enough real chat messages to scroll through.
  //
  // Retriggers on `messages.length` (the raw fetched count), NOT `items.length` (the
  // filtered display count) — a combat-heavy crew can have a whole 50-message page that's
  // entirely COMBAT/BOSS_SPAWN, which leaves `items.length` unchanged after the prepend.
  // Depending on `items.length` would silently stop the retry chain right there, even
  // though `hasMore` is still true and real messages exist further back.
  useEffect(() => {
    if (!historyLoaded || !hasMore) return
    const raf = requestAnimationFrame(() => {
      const el = scrollRef.current
      if (!el || isFetchingOlderRef.current || anchorPendingRef.current) return
      if (el.scrollHeight <= el.clientHeight) {
        fetchOlderMessages()
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [historyLoaded, messages.length, hasMore]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return

    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isNearBottomRef.current = distFromBottom < 150
    setShowScrollToBottom(distFromBottom > 300)
    // User scrolled up manually — stop the correction pass so we don't snap back
    if (!isNearBottomRef.current) needsBottomCorrection.current = false

    if (el.scrollTop < 120 && hasMore && !isFetchingOlderRef.current && !anchorPendingRef.current && historyLoaded) {
      fetchOlderMessages()
    }
  }

  const resolveProfile = useCallback(
    (userId: string): Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url' | 'status'> =>
      profilesRef.current[userId] ?? { id: userId, username: '???', avatar_class: null, avatar_url: null, status: null },
    []
  )

  // ─── Reconnect / foreground catch-up ──────────────────────────────────────────
  // Broadcast + Postgres Changes are live-only: a message that lands while the
  // socket is down (backgrounded, screen locked, network blip, or a failed join)
  // is never replayed when the socket resumes. Before this, the only backfill was
  // a full remount's DB fetch — which is why a missed message needed exit+rejoin.
  //
  // ChatInput's channel lifecycle calls this whenever the socket reaches SUBSCRIBED
  // (initial join, the 30s cache fast-path, or an auto-rejoin after an error), on
  // foreground, and on the browser `online` event. It fetches everything at/after
  // our newest CONFIRMED message and merges via addMessage — which dedups by id, so
  // rows realtime already delivered are ignored and only the gap is filled.
  const isResyncingRef = useRef(false)
  const resyncMessages = useCallback(async (attempt = 0): Promise<void> => {
    if (isResyncingRef.current) return
    const store = useChatStore.getState()
    // Anchor on the newest PERSISTED message (a tempId optimistic send has a
    // client-side created_at that could sit ahead of a peer's real timestamp and
    // make us skip it). If we have no persisted messages yet, the mount fetch owns
    // the cold start — nothing to catch up against.
    let cursor: string | null = null
    for (const m of store.messages) {
      if (!m.tempId && (cursor === null || m.created_at > cursor)) cursor = m.created_at
    }
    if (cursor === null) return

    isResyncingRef.current = true
    try {
      const supabase = createClient()
      // Newest-first + reverse (same shape as the initial load), filtered to
      // at/after our cursor. >= (not >) so same-timestamp siblings aren't skipped;
      // addMessage dedups the boundary row we already have. Ordering by newest
      // guarantees the tail (the message the user is missing) is always fetched —
      // a >50-message outage gap keeps the latest and leaves only a rare middle
      // hole that upward pagination can't fill.
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('crew_id', crewId)
        .gte('created_at', cursor)
        .order('created_at', { ascending: false })
        .limit(LOAD_OLDER_BATCH)
      if (error) throw error
      // Bail if this crew's dispatcher was replaced or cleared while the fetch
      // was in flight (crew switch / unmount) — the store now belongs to a
      // different chat, and these rows would bleed into it.
      if (useChatStore.getState().requestResync !== resyncMessages) return
      const rows = ((data ?? []) as Message[]).reverse()
      const add = useChatStore.getState().addMessage
      for (const raw of rows) {
        if (typeof raw.content !== 'string') continue
        add({ ...raw, profile: resolveProfile(raw.user_id) } as MessageWithProfile)
      }
    } catch {
      // A failed catch-up isn't only "best-effort" — right after a foreground it
      // may be the ONLY trigger before the next reconnect, so give it one delayed
      // retry (guarded against crew switch/unmount) instead of silently dropping.
      if (attempt === 0) {
        setTimeout(() => {
          if (useChatStore.getState().requestResync === resyncMessages) void resyncMessages(1)
        }, 2000)
      }
    } finally {
      isResyncingRef.current = false
    }
    // Self-reference is intentional: the closure compares itself against the store's
    // registered dispatcher as a staleness guard — it must NOT be its own dep.
  }, [crewId, resolveProfile]) // eslint-disable-line react-hooks/exhaustive-deps

  // Register the catch-up dispatcher for ChatInput's channel lifecycle to invoke.
  // Same store-callback pattern as requestRetrySend.
  useEffect(() => {
    useChatStore.getState().setRequestResync(resyncMessages)
    return () => {
      if (useChatStore.getState().requestResync === resyncMessages) {
        useChatStore.getState().setRequestResync(null)
      }
    }
  }, [resyncMessages])

  // ─── Realtime: Postgres Changes (INSERT backup + UPDATE) + profile changes ────

  useEffect(() => {
    // Scope the profiles listener to this crew's members — without a filter, every
    // profile UPDATE in the entire database is pushed down this channel and discarded
    // client-side on every open chat screen.
    const memberIds = Object.keys(profilesRef.current)
    const profileFilter = memberIds.length > 0
      ? `id=in.(${memberIds.join(',')})`
      : 'id=eq.00000000-0000-0000-0000-000000000000'
    // Shared with ChatInput's broadcast/presence channel — see crewMessageChannel.ts.
    // ChatInput owns the single .subscribe() call for this topic (deferred to a
    // microtask so it always runs after these postgres_changes listeners attach,
    // regardless of mount order); this effect only ever attaches listeners.
    acquireCrewMessageChannel(crewId, currentUserId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `crew_id=eq.${crewId}` },
        (payload) => {
          const raw = payload.new as Message
          if (!raw?.id || typeof raw.content !== 'string') return
          addMessage({ ...raw, profile: resolveProfile(raw.user_id) } as MessageWithProfile)
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `crew_id=eq.${crewId}` },
        (payload) => {
          const raw = payload.new as Message
          if (!raw?.id) return

          // A reaction toggle for this message is currently in flight on this client —
          // its own round trip (useMessageReactions) owns reconciling `reactions` once
          // the edge function responds. Applying this event's snapshot here as well
          // risks clobbering a fresher local add/remove with an older DB read.
          const reactionPending = useChatStore.getState().pendingReactionIds.has(raw.id)
          const dbReactions     = (raw.reactions ?? {}) as Record<string, string[]>

          const patch: Partial<Message> = {
            content:         raw.content,
            xp_awarded:      raw.xp_awarded,
            element_type:    raw.element_type,
            pinned:          raw.pinned,
            pinned_by:       raw.pinned_by,
            pinned_at:       raw.pinned_at,
            pin_expires_at:  raw.pin_expires_at,
          }
          if (!reactionPending) patch.reactions = dbReactions

          updateMessage(raw.id, patch)

          if (patch.reactions !== undefined || reactionPending) {
            try {
              const cacheKey = `nexus-msgs-${crewId}`
              const cached = sessionStorage.getItem(cacheKey)
              if (cached) {
                const parsedCache = JSON.parse(cached)
                // Support old format (plain array) and new format ({ messages, savedAt })
                const msgs = (Array.isArray(parsedCache) ? parsedCache : parsedCache?.messages) as { id: string; [k: string]: unknown }[] | undefined
                if (Array.isArray(msgs)) {
                  const idx = msgs.findIndex((m) => m.id === raw.id)
                  // Mirror whatever the store currently considers authoritative for this
                  // message's reactions — the optimistic value while pending, else dbReactions.
                  const currentReactions = useChatStore.getState().messages.find((m) => m.id === raw.id)?.reactions
                  if (idx !== -1 && currentReactions !== undefined) {
                    msgs[idx] = { ...msgs[idx], reactions: currentReactions }
                    const updated = Array.isArray(parsedCache) ? msgs : { ...parsedCache, messages: msgs }
                    const str = JSON.stringify(updated)
                    sessionStorage.setItem(cacheKey, str)
                    // Mirror to IDB so reactions survive iOS PWA kill/relaunch.
                    idbSet(cacheKey, JSON.parse(str)).catch(() => {})
                  }
                }
              }
            } catch {}
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: profileFilter },
        (payload) => {
          const p = payload.new as { id: string; username: string; avatar_url: string | null; avatar_class: string | null; status: string | null }
          const previous = profilesRef.current[p.id]
          if (!previous) return
          const updated: Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url' | 'status'> = {
            id: p.id,
            username: p.username,
            avatar_url: p.avatar_url,
            avatar_class: p.avatar_class as AvatarClass | null,
            status: p.status,
          }
          profilesRef.current[p.id] = updated
          setLocalProfiles((prev) => ({ ...prev, [p.id]: updated }))
          // Renamed while this chat is open — let @mentions of the old name resolve
          // immediately, without waiting for a reload to re-fetch username_history.
          if (previous.username.toLowerCase() !== p.username.toLowerCase()) {
            setOldUsernameToUserId((prev) => {
              const next = new Map(prev)
              next.set(previous.username.toLowerCase(), p.id)
              return next
            })
          }
        }
      )

    return () => { releaseCrewMessageChannel(crewId) }
    // channelEpoch is deliberately a dep — when ChatInput evicts a CLOSED (dead)
    // channel and bumps the epoch, this effect must re-run to attach its
    // postgres_changes listeners to the replacement channel before ChatInput's
    // deferred subscribe() fires on it.
  }, [crewId, currentUserId, addMessage, updateMessage, resolveProfile, channelEpoch])

  // ─── Squad definitions ────────────────────────────────────────────────────────

  useEffect(() => {
    const supabase = createClient()
    let cancelled  = false

    async function fetchDefs() {
      const { data } = await supabase
        .from('squad_definitions')
        .select('*')
        .eq('crew_id', crewId)
        .order('created_at', { ascending: false })
      if (cancelled) return

      const defs = (data ?? []) as SquadDefinition[]
      const creatorMap: Record<string, string> = {}
      const unknownIds: string[] = []

      // Resolve creator usernames from already-loaded member profiles first.
      // Only falls back to a DB query for creators who have left the crew.
      for (const d of defs) {
        const cached = profilesRef.current[d.creator_id]
        if (cached) {
          creatorMap[d.creator_id] = cached.username
        } else if (!creatorMap[d.creator_id]) {
          unknownIds.push(d.creator_id)
        }
      }

      if (unknownIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', [...new Set(unknownIds)])
        for (const p of (profiles ?? []) as { id: string; username: string }[]) {
          creatorMap[p.id] = p.username
        }
      }

      if (!cancelled) {
        const next = defs.map((d) => ({ ...d, creator_username: creatorMap[d.creator_id] }))
        // Preserve the previous array's identity when content is unchanged — the
        // common case on remount (including the empty→empty case) — so this fetch
        // doesn't invalidate every MessageBubble's memo for nothing. Realtime
        // INSERT/DELETE handlers below still produce fresh arrays when content
        // genuinely changes.
        setDefinitions((prev) => (definitionsEqual(prev, next) ? prev : next))
      }
    }

    fetchDefs()

    const defChannel = supabase
      .channel(`ml-defs:${crewId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'squad_definitions', filter: `crew_id=eq.${crewId}` },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            const incoming = payload.new as SquadDefinition
            let creator_username: string | undefined = profilesRef.current[incoming.creator_id]?.username
            if (!creator_username) {
              const { data } = await supabase
                .from('profiles')
                .select('username')
                .eq('id', incoming.creator_id)
                .maybeSingle()
              creator_username = (data as { username: string } | null)?.username ?? undefined
            }
            setDefinitions((prev) =>
              prev.some((d) => d.id === incoming.id)
                ? prev
                : [{ ...incoming, creator_username }, ...prev]
            )
          } else if (payload.eventType === 'DELETE') {
            const gone = payload.old as { id: string }
            setDefinitions((prev) => prev.filter((d) => d.id !== gone.id))
          }
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(defChannel)
    }
  }, [crewId])

  // ─── Skeleton while fetching ──────────────────────────────────────────────────

  if (!historyLoaded) {
    return (
      <div className="flex-1 min-h-0 overflow-hidden px-4 pb-3 flex flex-col gap-3">
        <div className="shrink-0 h-[134px]" aria-hidden="true" />
        {[80, 55, 100, 65, 90, 45, 75].map((w, i) => (
          <div key={i} className={`flex items-end gap-2 ${i % 3 === 0 ? 'flex-row-reverse' : ''}`}>
            <div className="w-7 h-7 bg-[#1a1a2e] animate-pulse flex-shrink-0" />
            <div
              className="h-9 bg-[#1a1a2e] animate-pulse"
              style={{ width: `${w}%`, maxWidth: 260, animationDelay: `${i * 80}ms` }}
            />
          </div>
        ))}
      </div>
    )
  }

  // ─── Item renderer ────────────────────────────────────────────────────────────

  function renderItem(item: DisplayItem) {
    if (item.kind === 'spacer') {
      return <div style={{ height: 134 }} aria-hidden="true" />
    }

    if (item.kind === 'divider') {
      return <ChatMessageStampDivider label={item.label} />
    }

    // item.kind === 'message'
    const liveProfile  = localProfiles[item.message.user_id] ?? item.message.profile
    // Pre-compute reply author profile here (O(1) map lookup) instead of doing an O(n)
    // Object.values(...).find() scan inside every MessageBubble render.
    const replyProfile = item.message.reply_username
      ? (usernameToProfile[item.message.reply_username.toLowerCase()] ?? null)
      : null
    return (
      <div id={`msg-${item.message.id}`}>
        <MessageBubble
          message={{ ...item.message, profile: liveProfile }}
          isOwn={item.isOwn}
          showHeader={item.showHeader}
          groupId={item.groupId}
          currentUserId={currentUserId}
          crewId={crewId}
          xpOverride={item.xpOverride}
          coinOverride={item.coinOverride}
          onAvatarTap={onAvatarTap}
          definitions={definitions}
          memberUsernames={memberUsernames}
          mentionAliases={mentionAliases}
          memberProfiles={localProfiles}
          replyProfile={replyProfile}
          isCreator={creatorId != null && item.message.user_id === creatorId}
          pinnedVinyl={memberPinnedVinyls?.[item.message.user_id] ?? null}
        />
      </div>
    )
  }

  // ─── Virtual list ─────────────────────────────────────────────────────────────

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div className="relative flex-1 min-h-0">
      {/* Top fade overlay */}
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 z-10 h-1/4"
        style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.25) 46.158%, rgba(0,0,0,0) 100%)',
        }}
      />

      {/* Load-older indicator */}
      {loadingOlder && (
        <div className="absolute top-[134px] left-0 right-0 z-20 flex justify-center pointer-events-none">
          <span className="font-pixel text-[7px] text-[#2a1545] bg-black/80 px-2 py-1">LOADING...</span>
        </div>
      )}

      {/* Scroll-to-bottom button */}
      <AnimatePresence>
        {showScrollToBottom && (
          <motion.button
            key="scroll-to-bottom"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            onClick={() => {
              virtualizer.scrollToIndex(items.length - 1, { align: 'end', behavior: 'smooth' })
            }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 inline-flex items-center justify-center border border-border rounded-full"
            style={{
              padding: 'var(--x3)',
              background: 'rgba(0,0,0,0)',
              backdropFilter: 'blur(7px)',
              WebkitBackdropFilter: 'blur(7px)',
              boxShadow: '0px 0px 20px 12px rgba(0,0,0,0.1)',
            }}
            aria-label="Scroll to latest messages"
          >
            <ArrowBarDown style={{ width: 24, height: 24, color: 'var(--color-primary)' }} />
          </motion.button>
        )}
      </AnimatePresence>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 h-full overflow-y-auto px-[var(--x5)] pb-[var(--x5)] nexus-scroll chat-no-select"
        style={{ contain: 'strict' }}
      >
        {messages.length === 0 ? (
          // No virtualizer math for the empty state — a plain bottom-aligned box fills
          // the actual scroll viewport, so the ghost/text/invite-card sit flush with
          // the composer regardless of viewport height (unlike sizing a virtual row to
          // a fixed estimate).
          <div className="flex flex-col items-center justify-end w-full h-full">
            <EmptyState inviteCode={inviteCode} justCreated={Object.keys(memberProfiles).length <= 1} />
          </div>
        ) : (
          /* Total scroll height governed by the virtualizer */
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
            {virtualItems.map((virtualItem) => {
              const item = items[virtualItem.index]
              if (!item) return null
              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position:  'absolute',
                    top:       0,
                    left:      0,
                    width:     '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {renderItem(item)}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
