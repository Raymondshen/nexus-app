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
import { useChatStore } from '@/store/chatStore'
import { useCombatStore } from '@/store/combatStore'
import { MessageBubble } from './MessageBubble'
import { ArrowBarDown } from 'pixelarticons/react/ArrowBarDown'
import type { MessageWithProfile, Message, Profile, AvatarClass, SquadDefinition, SquadDefinitionWithCreator, CombatEvent, CombatEventKind } from '@/types'

interface MessageListProps {
  crewId:               string
  crewName:             string
  currentUserId:        string
  memberProfiles:       Record<string, Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url' | 'status'>>
  creatorId?:           string | null
  memberPinnedVinyls?:  Record<string, { imageUrl: string | null; title: string | null }>
}

function dayLabel(date: Date): string {
  if (isToday(date))     return 'TODAY'
  if (isYesterday(date)) return 'YESTERDAY'
  return format(date, 'MMM d, yyyy').toUpperCase()
}

// ─── Campfire pixel art for empty state ─────────────────────────────────────
const CAMPFIRE_GRID = [
  '0000000000000000',
  '0000000400000000',
  '0000003440000000',
  '0000034344000000',
  '0000344443000000',
  '0003444444300000',
  '0033444443330000',
  '0001122211000000',
  '0011222211100000',
  '0111222221110000',
  '0001122221100000',
  '0000011100000000',
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
  '0000000000000000',
]
const CAMPFIRE_COLORS: Record<string, string> = {
  '0': 'transparent',
  '1': '#4a3520',
  '2': '#6b4e2e',
  '3': '#ff4400',
  '4': '#ffaa00',
  '5': '#ff6600',
}

function CampfireSprite() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(16, 4px)', width: 64, height: 64, imageRendering: 'pixelated', opacity: 0.5 }}>
      {CAMPFIRE_GRID.flatMap((row, r) =>
        row.split('').map((ch, c) => (
          <div key={`${r}-${c}`} style={{ backgroundColor: CAMPFIRE_COLORS[ch] ?? 'transparent' }} />
        ))
      )}
    </div>
  )
}

// ─── Display item types ───────────────────────────────────────────────────────
type DisplayItem =
  | { kind: 'spacer';   key: string }
  | { kind: 'empty';    key: string }
  | { kind: 'divider';  label: string; key: string }
  | { kind: 'message';  message: MessageWithProfile; isOwn: boolean; showHeader: boolean; groupId: string; xpOverride?: number; coinOverride?: number }

function estimateItemSize(item: DisplayItem): number {
  switch (item.kind) {
    case 'spacer':  return 134
    case 'empty':   return 200
    case 'divider': return 36
    case 'message': return 72
    default:        return 72
  }
}

const LOAD_OLDER_BATCH = 50

// Envelope stored in both sessionStorage (sync, fast) and IDB (persistent across iOS PWA kills)
type MsgCache = { messages: MessageWithProfile[]; savedAt: number }

// ─── Combat event parsers (used by realtime INSERT handler) ───────────────────

function parseCombatEvent(content: string, messageId?: string, messageTs?: number): CombatEvent | null {
  const id = messageId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const ts = messageTs ?? Date.now()

  if (content.startsWith('BOSS_SPAWN:')) {
    const [, name, hp] = content.split(':')
    return { id, ts, kind: 'boss_spawn' as CombatEventKind, text: `⚔ ${name} appears — ${hp} HP` }
  }

  if (!content.startsWith('COMBAT:')) return null
  const parts = content.split(':')
  const type  = parts[1]

  switch (type) {
    case 'attack': {
      const isCrit = parts[5] === '1'
      return { id, ts, kind: (isCrit ? 'player_crit' : 'player_attack') as CombatEventKind, value: Number(parts[3]),
               text: isCrit ? `${parts[2]} landed a CRIT for ${parts[3]}!` : `${parts[2]} attacked for ${parts[3]}` }
    }
    case 'volley':
      return { id, ts, kind: 'ability_used' as CombatEventKind, value: Number(parts[3]),
               text: `${parts[2]} uses VOLLEY — ${parts[3]} dmg` }
    case 'backstab':
      return { id, ts, kind: 'player_crit' as CombatEventKind, value: Number(parts[3]),
               text: `${parts[2]} backstabs for ${parts[3]}! (CRIT)` }
    case 'cast':
      return { id, ts, kind: 'ability_used' as CombatEventKind, value: Number(parts[3]),
               text: `${parts[2]} casts for ${parts[3]} dmg` }
    case 'guard':
      return { id, ts, kind: 'ability_used' as CombatEventKind, text: `${parts[2]} raises GUARD` }
    case 'mend':
      return { id, ts, kind: 'heal' as CombatEventKind, value: Number(parts[3]),
               text: `${parts[2]} mends — +${parts[3]} HP` }
    case 'boss_attack':
      return { id, ts, kind: 'boss_attack' as CombatEventKind, value: Number(parts[3]),
               text: `Boss strikes ${parts[2]} — ${parts[3]} dmg` }
    case 'downed':
      return { id, ts, kind: 'member_downed' as CombatEventKind, text: `${parts[2]} has been downed!` }
    case 'victory':
      return { id, ts, kind: 'raid_victory' as CombatEventKind,
               text: `✦ Victory! ${parts[2]} earns ${parts[3]} ${parts.slice(4).join(':')}` }
    case 'escaped':
      return { id, ts, kind: 'raid_escaped' as CombatEventKind,
               text: `${parts.slice(2).join(':')} escaped without defeating the boss.` }
    case 'stat_up':
      return { id, ts, kind: 'stat_boost' as CombatEventKind,
               text: `✦ ${parts[2]} +1 ${parts[3].toUpperCase()}` }
    default: return null
  }
}

// Returns damage-float data for player attacks that deal boss damage; null otherwise
function parseDamageFloat(content: string): { value: number; isCrit: boolean } | null {
  if (!content.startsWith('COMBAT:')) return null
  const parts = content.split(':')
  switch (parts[1]) {
    case 'attack':   return { value: Number(parts[3]), isCrit: parts[5] === '1' }
    case 'volley':   return { value: Number(parts[3]), isCrit: false }
    case 'backstab': return { value: Number(parts[3]), isCrit: true }
    case 'cast':     return { value: Number(parts[3]), isCrit: false }
    default:         return null
  }
}

export function MessageList({
  crewId,
  crewName,
  currentUserId,
  memberProfiles,
  creatorId,
  memberPinnedVinyls,
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
  const setMessages            = useChatStore((s) => s.setMessages)
  const prependMessages        = useChatStore((s) => s.prependMessages)
  const addMessage             = useChatStore((s) => s.addMessage)
  const updateMessage          = useChatStore((s) => s.updateMessage)
  const setCrewXP              = useChatStore((s) => s.setCrewXP)
  const receiveXP              = useChatStore((s) => s.receiveXP)
  const setPinnedScrollTargetId = useChatStore((s) => s.setPinnedScrollTargetId)
  const [localProfiles, setLocalProfiles] = useState<Record<string, Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url' | 'status'>>>(memberProfiles)
  const [devMode] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('nexus_dev_mode') === '1'
  })
  const [historyLoaded, setHistoryLoaded] = useState(false)

  // Pagination state
  const [hasMore, setHasMore]     = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const isFetchingOlderRef  = useRef(false)
  const oldestCursorRef     = useRef<string | null>(null)
  // Scroll-position restoration after prepend
  const prevScrollTopRef   = useRef(0)
  const prevTotalSizeRef   = useRef(0)
  const anchorPendingRef   = useRef(false)
  const skipAutoScrollRef  = useRef(false)

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
    oldestCursorRef.current = null
    hasInitialScrolled.current = false

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
        const existingMap = new Map(existing.map((m) => [m.id, m]))
        const fetchedIds = new Set(fetched.map((m) => m.id))
        const fetchedWithLocalReactions = fetched.map((fetchedMsg) => {
          const existingMsg = existingMap.get(fetchedMsg.id)
          if (!existingMsg) return fetchedMsg
          const fetchedReactions = (fetchedMsg.reactions ?? {}) as Record<string, string[]>
          const localReactions   = (existingMsg.reactions  ?? {}) as Record<string, string[]>
          if (Object.keys(fetchedReactions).length === 0 && Object.keys(localReactions).length > 0) {
            return { ...fetchedMsg, reactions: existingMsg.reactions }
          }
          return fetchedMsg
        })
        const merged = [
          ...fetchedWithLocalReactions,
          ...existing.filter((m) => !fetchedIds.has(m.id)),
        ].sort((a, b) => a.created_at.localeCompare(b.created_at))

        setMessages(merged)

        // Replay combat events from loaded messages so the log persists across page loads
        {
          const combatStore = useCombatStore.getState()
          const raid = combatStore.activeRaid
          if (raid) {
            const replayEvents = merged
              .filter((m) => m.message_type === 'system' && m.created_at >= raid.started_at)
              .map((m) => parseCombatEvent(m.content, m.id, Date.parse(m.created_at)))
              .filter((e): e is CombatEvent => e !== null)
            if (replayEvents.length > 0) combatStore.replayCombatEvents(replayEvents)
          }
        }

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

    // Top spacer so messages start below the floating navbar
    list.push({ kind: 'spacer', key: 'top-spacer' })

    if (messages.length === 0) {
      list.push({ kind: 'empty', key: 'empty-state' })
      return list
    }

    let lastDate:      Date | null   = null
    let lastUserId:    string | null = null
    let lastMsgTime:   number        = 0
    let groupLeaderId: string | null = null

    for (const msg of messages) {
      if (!msg.id || typeof msg.content !== 'string') continue

      // Combat system messages are shown in CombatLog, not in the chat history
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

  // ─── Initial scroll to bottom ─────────────────────────────────────────────────

  useBrowserLayoutEffect(() => {
    if (!historyLoaded || hasInitialScrolled.current || items.length === 0) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    hasInitialScrolled.current = true
  }, [historyLoaded, items.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Auto-scroll on new message (append) ─────────────────────────────────────

  useEffect(() => {
    if (!hasInitialScrolled.current) return
    // Skip when a prepend is in progress — anchor restoration handles scroll instead
    if (skipAutoScrollRef.current) { skipAutoScrollRef.current = false; return }
    const lastMsg = messages[messages.length - 1]
    // Combat system messages are filtered from the chat display (shown in CombatLog inside
    // the HUD instead). Auto-scrolling the chat for them would keep users pinned to the
    // bottom and prevent them from reading history while a raid is active.
    if (
      lastMsg?.message_type === 'system' &&
      typeof lastMsg.content === 'string' &&
      (lastMsg.content.startsWith('COMBAT:') || lastMsg.content.startsWith('BOSS_SPAWN:'))
    ) {
      return
    }
    const ownSend = !!lastMsg && lastMsg.user_id === currentUserId
    if (ownSend || isNearBottomRef.current) {
      virtualizer.scrollToIndex(items.length - 1, { align: 'end', behavior: 'smooth' })
    }
  }, [messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [items.length]) // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [historyLoaded, items.length, hasMore]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return

    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isNearBottomRef.current = distFromBottom < 150
    setShowScrollToBottom(distFromBottom > 300)

    if (el.scrollTop < 120 && hasMore && !isFetchingOlderRef.current && !anchorPendingRef.current && historyLoaded) {
      fetchOlderMessages()
    }
  }

  const resolveProfile = useCallback(
    (userId: string): Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url' | 'status'> =>
      profilesRef.current[userId] ?? { id: userId, username: '???', avatar_class: null, avatar_url: null, status: null },
    []
  )

  // ─── Realtime: Postgres Changes (INSERT backup + UPDATE) + profile changes ────

  useEffect(() => {
    const supabase = createClient()
    const channel  = supabase
      .channel(`db:messages:${crewId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `crew_id=eq.${crewId}` },
        (payload) => {
          const raw = payload.new as Message
          if (!raw?.id || typeof raw.content !== 'string') return
          addMessage({ ...raw, profile: resolveProfile(raw.user_id) } as MessageWithProfile)
          // Feed combat events and damage floats to the combat store (combat toggle only)
          if (raw.message_type === 'system') {
            const store = useCombatStore.getState()
            const event = parseCombatEvent(raw.content, raw.id, Date.parse(raw.created_at))
            if (event) store.addCombatEvent(event)
            const float = parseDamageFloat(raw.content)
            if (float) {
              store.spawnDamageFloat({
                id:     raw.id,
                value:  float.value,
                isCrit: float.isCrit,
                x:      window.innerWidth * 0.5 + (Math.random() * 80 - 40),
                y:      window.innerHeight * 0.65,
              })
            }
            // Patch raid HP/phase from message content — more reliable than active_raids realtime
            const p = raw.content.split(':')
            const t = p[1]
            if (t === 'attack' || t === 'volley' || t === 'backstab' || t === 'cast') {
              const newHp = Math.round(Number(p[4]))
              const curHp = store.activeRaid?.current_hp
              // Only accept decreasing HP — out-of-order messages (concurrent attackers,
              // network jitter) must never revert HP to a stale higher value
              if (!isNaN(newHp) && (curHp === undefined || newHp < curHp)) {
                store.patchRaid({ current_hp: newHp })
              }
            } else if (t === 'victory' || t === 'escaped') {
              store.setActiveRaid(null)
              store.setAllMembers([])
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `crew_id=eq.${crewId}` },
        (payload) => {
          const raw = payload.new as Message
          if (!raw?.id) return

          const dbReactions    = (raw.reactions  ?? {}) as Record<string, string[]>
          const localMsg       = useChatStore.getState().messages.find((m) => m.id === raw.id)
          const localReactions = (localMsg?.reactions  ?? {}) as Record<string, string[]>
          const hasDbReactions    = Object.keys(dbReactions).length > 0
          const hasLocalReactions = Object.keys(localReactions).length > 0

          const patch: Partial<Message> = {
            content:         raw.content,
            xp_awarded:      raw.xp_awarded,
            element_type:    raw.element_type,
            pinned:          raw.pinned,
            pinned_by:       raw.pinned_by,
            pinned_at:       raw.pinned_at,
            pin_expires_at:  raw.pin_expires_at,
          }
          if (hasDbReactions || !hasLocalReactions) patch.reactions = dbReactions

          updateMessage(raw.id, patch)

          if (patch.reactions !== undefined) {
            try {
              const cacheKey = `nexus-msgs-${crewId}`
              const cached = sessionStorage.getItem(cacheKey)
              if (cached) {
                const parsedCache = JSON.parse(cached)
                // Support old format (plain array) and new format ({ messages, savedAt })
                const msgs = (Array.isArray(parsedCache) ? parsedCache : parsedCache?.messages) as { id: string; [k: string]: unknown }[] | undefined
                if (Array.isArray(msgs)) {
                  const idx = msgs.findIndex((m) => m.id === raw.id)
                  if (idx !== -1) {
                    msgs[idx] = { ...msgs[idx], reactions: patch.reactions }
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
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          const p = payload.new as { id: string; username: string; avatar_url: string | null; avatar_class: string | null; status: string | null }
          if (!profilesRef.current[p.id]) return
          const updated: Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url' | 'status'> = {
            id: p.id,
            username: p.username,
            avatar_url: p.avatar_url,
            avatar_class: p.avatar_class as AvatarClass | null,
            status: p.status,
          }
          profilesRef.current[p.id] = updated
          setLocalProfiles((prev) => ({ ...prev, [p.id]: updated }))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [crewId, addMessage, updateMessage, resolveProfile])

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
        setDefinitions(defs.map((d) => ({ ...d, creator_username: creatorMap[d.creator_id] })))
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

    if (item.kind === 'empty') {
      return (
        <div className="flex flex-col items-center justify-center gap-4 opacity-60" style={{ minHeight: 200 }}>
          <CampfireSprite />
          <p className="font-pixel text-[9px] text-[#6b4f8f] text-center leading-loose">
            Send the first message.<br />The adventure begins.
          </p>
        </div>
      )
    }

    if (item.kind === 'divider') {
      return (
        <div className="flex items-center gap-3 my-2">
          <div className="flex-1 border-t border-[#1a1a2e]" />
          <span className="font-pixel text-[7px] text-[#2a1545]">{item.label}</span>
          <div className="flex-1 border-t border-[#1a1a2e]" />
        </div>
      )
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
        className="flex-1 min-h-0 h-full overflow-y-auto px-4 pb-4 nexus-scroll chat-no-select"
        style={{ contain: 'strict' }}
      >
        {/* Total scroll height governed by the virtualizer */}
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
      </div>
    </div>
  )
}
