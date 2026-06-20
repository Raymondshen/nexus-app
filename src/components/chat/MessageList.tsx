'use client'

import { useEffect, useLayoutEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useVirtualizer } from '@tanstack/react-virtual'

// Fires synchronously before the browser paints on the client; falls back to
// useEffect on the server (SSR) where useLayoutEffect is not available.
const useBrowserLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowBarDown } from 'pixelarticons/react/ArrowBarDown'
import { format, isToday, isYesterday, isSameDay } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { useChatStore } from '@/store/chatStore'
import { MessageBubble } from './MessageBubble'
import { LevelUpBanner } from '@/components/game/LevelUpBanner'
import { parseBossSpawnRaidId } from '@/lib/game/boss'
import { parseArtifactDropId, parseLevelUp } from '@/lib/game/artifacts'
import type { MessageWithProfile, Message, Profile, ActiveRaid, AvatarClass, SquadDefinition, SquadDefinitionWithCreator } from '@/types'

const BossCard = dynamic(
  () => import('@/components/game/BossCard').then((m) => m.BossCard),
  {
    loading: () => (
      <div
        className="w-full my-2 p-4 text-center"
        style={{ border: '1px solid rgba(255,34,0,0.4)', background: 'rgba(10,0,0,0.8)' }}
      >
        <p className="font-pixel text-[8px] text-[#ff4444]/60">BOSS INCOMING...</p>
      </div>
    ),
  }
)

const ArtifactDropRenderer = dynamic(
  () => import('@/components/game/ArtifactDropRenderer').then((m) => m.ArtifactDropRenderer),
  {
    loading: () => (
      <div className="w-full my-2 p-3 border border-[#bf5fff]/20 bg-[#0a0612] animate-pulse">
        <div className="h-4 w-32 bg-[#1a1a2e] rounded" />
      </div>
    ),
  }
)

interface MessageListProps {
  crewId:         string
  crewName:       string
  currentUserId:  string
  memberProfiles: Record<string, Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url'>>
  initialRaid:    ActiveRaid | null
  creatorId?:     string | null
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
  | { kind: 'divider';  label: string;      key: string }
  | { kind: 'boss';     raidId: string;     key: string; raid: ActiveRaid | null }
  | { kind: 'artifact'; artifactId: string; key: string }
  | { kind: 'level_up'; level: number; msgId: string; key: string }
  | { kind: 'message';  message: MessageWithProfile; isOwn: boolean; showHeader: boolean; xpOverride?: number; coinOverride?: number }

function estimateItemSize(item: DisplayItem): number {
  switch (item.kind) {
    case 'spacer':   return 134
    case 'empty':    return 200
    case 'divider':  return 36
    case 'boss':     return 120
    case 'artifact': return 100
    case 'level_up': return 80
    case 'message':  return 72
    default:         return 72
  }
}

const LOAD_OLDER_BATCH = 50

export function MessageList({
  crewId,
  crewName,
  currentUserId,
  memberProfiles,
  initialRaid,
  creatorId,
}: MessageListProps) {
  const router = useRouter()
  const onAvatarTap = useMemo(
    () => (userId: string) => {
      sessionStorage.setItem('nexus_chat_from', 'chat')
      router.push(`/chat/${crewId}/member/${userId}`)
    },
    [crewId, router],
  )

  const { messages, setMessages, prependMessages, addMessage, updateMessage, setCrewXP, receiveXP, pinnedScrollTargetId, setPinnedScrollTargetId } = useChatStore()
  const [dismissedLevelUps, setDismissedLevelUps] = useState<Set<string>>(new Set())
  const [localProfiles, setLocalProfiles] = useState<Record<string, Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url'>>>(memberProfiles)
  const [devMode] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('nexus_dev_mode') === '1'
  })
  const [historyLoaded, setHistoryLoaded] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      const raw = sessionStorage.getItem(`nexus-msgs-${crewId}`)
      return raw !== null && Array.isArray(JSON.parse(raw))
    } catch { return false }
  })

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

  const memberUsernames = useMemo(
    () => new Set(Object.values(localProfiles).map((p) => p.username.toLowerCase())),
    [localProfiles],
  )

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
        const parsed = JSON.parse(raw) as MessageWithProfile[]
        if (Array.isArray(parsed)) {
          setMessages(parsed)
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
              id: m.user_id, username: '???', avatar_class: null, avatar_url: null,
            },
          }))

        if (cancelled) {
          try { sessionStorage.setItem(cacheKey, JSON.stringify(fetched.slice(-LOAD_OLDER_BATCH))) } catch {}
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

        // Record the oldest message as the pagination cursor
        if (merged.length > 0) {
          oldestCursorRef.current = merged[0].created_at
        }
        // If the server returned fewer than LOAD_OLDER_BATCH, we're at the beginning
        if (rows.length < LOAD_OLDER_BATCH) setHasMore(false)

        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(merged.slice(-LOAD_OLDER_BATCH)))
        } catch {}
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

  // Pre-pass: accumulate XP and coins per group
  const groupXPMap   = useMemo(() => {
    const map = new Map<string, number>()
    let preLastDate: Date | null = null
    let preLastUserId: string | null = null
    let preLastMsgTime = 0
    let preGroupLeaderId: string | null = null
    const preRenderedRaids = new Set<string>()

    for (const msg of messages) {
      if (!msg.id || typeof msg.content !== 'string') continue
      const msgDate = new Date(msg.created_at)
      const msgTime = msgDate.getTime()
      const raidId     = parseBossSpawnRaidId(msg.content)
      const artifactId = parseArtifactDropId(msg.content)
      const level      = parseLevelUp(msg.content)

      if (!preLastDate || !isSameDay(preLastDate, msgDate)) {
        preLastUserId = null; preLastMsgTime = 0; preGroupLeaderId = null
      }
      preLastDate = msgDate

      if (raidId && !preRenderedRaids.has(raidId)) {
        preRenderedRaids.add(raidId)
        preLastUserId = null; preLastMsgTime = 0; preGroupLeaderId = null
        continue
      }
      if (artifactId || level !== null || raidId) {
        preLastUserId = null; preLastMsgTime = 0; preGroupLeaderId = null
        continue
      }
      if (msg.message_type === 'system' || msg.message_type === 'poll') {
        preLastUserId = null; preLastMsgTime = 0; preGroupLeaderId = null
        continue
      }

      const sameUser     = msg.user_id === preLastUserId
      const withinMinute = sameUser && (msgTime - preLastMsgTime) < 60_000
      const msgXP        = msg.xp_awarded ?? 0

      if (!withinMinute || !!msg.reply_to_id) {
        preGroupLeaderId = msg.id
        map.set(msg.id, msgXP)
      } else if (preGroupLeaderId) {
        map.set(preGroupLeaderId, (map.get(preGroupLeaderId) ?? 0) + msgXP)
      }

      preLastUserId  = msg.user_id
      preLastMsgTime = msgTime
    }
    return map
  }, [messages])

  const groupCoinMap = useMemo(() => {
    const map = new Map<string, number>()
    let preLastDate: Date | null = null
    let preLastUserId: string | null = null
    let preLastMsgTime = 0
    let preGroupLeaderId: string | null = null
    const preRenderedRaids = new Set<string>()

    for (const msg of messages) {
      if (!msg.id || typeof msg.content !== 'string') continue
      const msgDate = new Date(msg.created_at)
      const msgTime = msgDate.getTime()
      const raidId     = parseBossSpawnRaidId(msg.content)
      const artifactId = parseArtifactDropId(msg.content)
      const level      = parseLevelUp(msg.content)

      if (!preLastDate || !isSameDay(preLastDate, msgDate)) {
        preLastUserId = null; preLastMsgTime = 0; preGroupLeaderId = null
      }
      preLastDate = msgDate

      if (raidId && !preRenderedRaids.has(raidId)) {
        preRenderedRaids.add(raidId)
        preLastUserId = null; preLastMsgTime = 0; preGroupLeaderId = null
        continue
      }
      if (artifactId || level !== null || raidId) {
        preLastUserId = null; preLastMsgTime = 0; preGroupLeaderId = null
        continue
      }
      if (msg.message_type === 'system' || msg.message_type === 'poll') {
        preLastUserId = null; preLastMsgTime = 0; preGroupLeaderId = null
        continue
      }

      const sameUser     = msg.user_id === preLastUserId
      const withinMinute = sameUser && (msgTime - preLastMsgTime) < 60_000
      const msgCoins     = (msg.xp_awarded ?? 0) > 0 ? 1 : 0

      if (!withinMinute || !!msg.reply_to_id) {
        preGroupLeaderId = msg.id
        map.set(msg.id, msgCoins)
      } else if (preGroupLeaderId) {
        map.set(preGroupLeaderId, (map.get(preGroupLeaderId) ?? 0) + msgCoins)
      }

      preLastUserId  = msg.user_id
      preLastMsgTime = msgTime
    }
    return map
  }, [messages])

  const items: DisplayItem[] = useMemo(() => {
    const list: DisplayItem[] = []

    // Top spacer so messages start below the floating navbar
    list.push({ kind: 'spacer', key: 'top-spacer' })

    if (messages.length === 0) {
      list.push({ kind: 'empty', key: 'empty-state' })
      return list
    }

    let lastDate:    Date | null   = null
    let lastUserId:  string | null = null
    let lastMsgTime: number        = 0
    const renderedRaids = new Set<string>()

    for (const msg of messages) {
      if (!msg.id || typeof msg.content !== 'string') continue

      const msgDate    = new Date(msg.created_at)
      const msgTime    = msgDate.getTime()
      const raidId     = parseBossSpawnRaidId(msg.content)
      const artifactId = parseArtifactDropId(msg.content)
      const level      = parseLevelUp(msg.content)

      if (!lastDate || !isSameDay(lastDate, msgDate)) {
        list.push({ kind: 'divider', label: dayLabel(msgDate), key: `divider-${msg.id}` })
        lastUserId  = null
        lastMsgTime = 0
      }

      if (raidId) {
        if (!renderedRaids.has(raidId)) renderedRaids.add(raidId)
        lastUserId  = null
        lastMsgTime = 0
      } else if (artifactId) {
        if (devMode) {
          list.push({ kind: 'artifact', artifactId, key: `artifact-${msg.id}` })
        }
        lastUserId  = null
        lastMsgTime = 0
      } else if (level !== null) {
        if (devMode) {
          list.push({ kind: 'level_up', level, msgId: msg.id, key: `levelup-${msg.id}` })
        }
        lastUserId  = null
        lastMsgTime = 0
      } else {
        if (msg.message_type === 'poll') {
          list.push({ kind: 'message', message: msg as MessageWithProfile, isOwn: msg.user_id === currentUserId, showHeader: true })
          lastUserId  = null
          lastMsgTime = 0
        } else if (msg.message_type === 'system') {
          const c = msg.content
          const isBossMsg = c.includes('BOSS') || c.includes('VOID') || c.includes('boss') || c.includes('raid') || c.includes('RAID')
          if (!isBossMsg) {
            list.push({ kind: 'message', message: msg as MessageWithProfile, isOwn: false, showHeader: false })
            lastUserId  = null
            lastMsgTime = 0
          }
        } else {
          const sameUser     = msg.user_id === lastUserId
          const withinMinute = sameUser && (msgTime - lastMsgTime) < 60_000
          const showHeader   = !withinMinute || !!msg.reply_to_id
          const xpOverride   = showHeader ? groupXPMap.get(msg.id)   : undefined
          const coinOverride = showHeader ? groupCoinMap.get(msg.id) : undefined
          list.push({ kind: 'message', message: msg as MessageWithProfile, isOwn: msg.user_id === currentUserId, showHeader, xpOverride, coinOverride })
          lastUserId  = msg.user_id
          lastMsgTime = msgTime
        }
      }

      lastDate = msgDate
    }

    return list
  }, [messages, currentUserId, devMode, groupXPMap, groupCoinMap])

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
    (userId: string): Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url'> =>
      profilesRef.current[userId] ?? { id: userId, username: '???', avatar_class: null, avatar_url: null },
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
                const msgs = JSON.parse(cached) as { id: string; [k: string]: unknown }[]
                const idx = msgs.findIndex((m) => m.id === raw.id)
                if (idx !== -1) {
                  msgs[idx] = { ...msgs[idx], reactions: patch.reactions }
                  sessionStorage.setItem(cacheKey, JSON.stringify(msgs))
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
          const p = payload.new as { id: string; username: string; avatar_url: string | null; avatar_class: string | null }
          if (!profilesRef.current[p.id]) return
          const updated: Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url'> = {
            id: p.id,
            username: p.username,
            avatar_url: p.avatar_url,
            avatar_class: p.avatar_class as AvatarClass | null,
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
      const creatorIds = [...new Set(defs.map((d) => d.creator_id))]
      const creatorMap: Record<string, string> = {}

      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username')
          .in('id', creatorIds)
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

    if (item.kind === 'boss') {
      return (
        <BossCard
          raidId={item.raidId}
          crewId={crewId}
          initialRaid={item.raid}
        />
      )
    }

    if (item.kind === 'artifact') {
      return (
        <ArtifactDropRenderer
          artifactId={item.artifactId}
          crewName={crewName}
        />
      )
    }

    if (item.kind === 'level_up') {
      if (dismissedLevelUps.has(item.msgId)) return null
      return (
        <AnimatePresence>
          <LevelUpBanner
            level={item.level}
            onDismiss={() => setDismissedLevelUps((s) => new Set([...s, item.msgId]))}
          />
        </AnimatePresence>
      )
    }

    // item.kind === 'message'
    const liveProfile = localProfiles[item.message.user_id] ?? item.message.profile
    return (
      <div id={`msg-${item.message.id}`}>
        <MessageBubble
          message={{ ...item.message, profile: liveProfile }}
          isOwn={item.isOwn}
          showHeader={item.showHeader}
          currentUserId={currentUserId}
          crewId={crewId}
          xpOverride={item.xpOverride}
          coinOverride={item.coinOverride}
          onAvatarTap={onAvatarTap}
          definitions={definitions}
          memberUsernames={memberUsernames}
          memberProfiles={localProfiles}
          isCreator={creatorId != null && currentUserId === creatorId}
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
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 size-10 flex items-center justify-center overflow-hidden rounded-[56px] bg-black/0 p-2 shadow-[0px_0px_20px_12px_rgba(0,0,0,0.10)]"
            aria-label="Scroll to latest messages"
          >
            <ArrowBarDown style={{ width: 20, height: 20, color: 'var(--color-primary)' }} />
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
