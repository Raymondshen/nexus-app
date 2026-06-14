'use client'

import { useEffect, useLayoutEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

// Fires synchronously before the browser paints on the client; falls back to
// useEffect on the server (SSR) where useLayoutEffect is not available.
const useBrowserLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect
import dynamic from 'next/dynamic'
import { AnimatePresence } from 'framer-motion'
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
}

function dayLabel(date: Date): string {
  if (isToday(date))     return 'TODAY'
  if (isYesterday(date)) return 'YESTERDAY'
  return format(date, 'MMM d, yyyy').toUpperCase()
}

// ─── Campfire pixel art for empty state ─────────────────────────────────────
// 0=bg 1=stone 2=log 3=flame-outer 4=flame-inner 5=ember
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

export function MessageList({
  crewId,
  crewName,
  currentUserId,
  memberProfiles,
  initialRaid,
}: MessageListProps) {
  const router = useRouter()
  const onAvatarTap = useMemo(
    () => (userId: string) => {
      sessionStorage.setItem('nexus_chat_from', 'chat')
      router.push(`/chat/${crewId}/member/${userId}`)
    },
    [crewId, router],
  )

  const { messages, setMessages, addMessage, updateMessage, setCrewXP, receiveXP } = useChatStore()
  const [dismissedLevelUps, setDismissedLevelUps] = useState<Set<string>>(new Set())
  // Local override map for profiles — patched in real-time when a member updates their avatar/username
  const [localProfiles, setLocalProfiles] = useState<Record<string, Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url'>>>(memberProfiles)
  const [devMode] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('nexus_dev_mode') === '1'
  })
  // Lazy initializer: read sessionStorage synchronously at first render so the
  // initial render is already in the "loaded" state for cache hits. This is
  // fundamentally more reliable than useLayoutEffect because it eliminates the
  // intermediate skeleton render entirely — no render cycle with historyLoaded=false.
  const [historyLoaded, setHistoryLoaded] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      const raw = sessionStorage.getItem(`nexus-msgs-${crewId}`)
      return raw !== null && Array.isArray(JSON.parse(raw))
    } catch { return false }
  })

  const [definitions, setDefinitions] = useState<SquadDefinitionWithCreator[]>([])

  const memberUsernames = useMemo(
    () => new Set(Object.values(localProfiles).map((p) => p.username.toLowerCase())),
    [localProfiles],
  )

  const scrollRef    = useRef<HTMLDivElement>(null)
  const bottomRef    = useRef<HTMLDivElement>(null)
  const profilesRef  = useRef(memberProfiles)
  profilesRef.current = memberProfiles

  // Track whether user is near the bottom (within 120px)
  const isNearBottomRef = useRef(true)
  // True after the first scroll-to-bottom on open; gates smooth vs instant scroll
  const hasInitialScrolled = useRef(false)

  // Pre-paint: clear any stale Zustand messages from a previous crew and populate
  // from cache. historyLoaded is already correctly initialized by the lazy useState
  // above, so we only need to set it here for the edge case where the cache entry
  // disappears between the lazy init read and this effect.
  useBrowserLayoutEffect(() => {
    setMessages([])
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

  // Post-paint: background network fetch to hydrate / refresh from DB.
  // The cache check above already resolved historyLoaded for cache hits, so
  // this effect only needs to handle the fetch itself + the fallback timer.
  useEffect(() => {
    const cacheKey = `nexus-msgs-${crewId}`
    let cancelled = false

    // Safety net: if the fetch hangs indefinitely, exit the skeleton after 8 s.
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
          .limit(50)

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
          // Component unmounted — still write the cache so the next visit is instant.
          try { sessionStorage.setItem(cacheKey, JSON.stringify(fetched.slice(-50))) } catch {}
          return
        }

        // Merge with any messages already in the store (Realtime events or
        // optimistic sends that arrived while the fetch was in flight).
        // For messages in both sets, use the fetched row as the base but
        // preserve local reactions when the fetched snapshot has none — the
        // fetch may have been issued before react-to-message committed, so
        // the fetched row is stale with respect to reactions.
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

        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(merged.slice(-50)))
        } catch {
          // Storage quota exceeded — skip silently
        }
      } catch {
        // Network error — Realtime subscription still delivers live messages
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

  // Instant jump on first load; smooth scroll for new messages while chatting
  useEffect(() => {
    if (!historyLoaded) return
    if (!hasInitialScrolled.current) {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
      hasInitialScrolled.current = true
      return
    }
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, historyLoaded])

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isNearBottomRef.current = distFromBottom < 120
  }

  const resolveProfile = useCallback(
    (userId: string): Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url'> =>
      profilesRef.current[userId] ?? { id: userId, username: '???', avatar_class: null, avatar_url: null },
    []
  )

  // Postgres-change fallback only — broadcasts are handled by ChatInput on the
  // shared messages:{crewId} channel (presence + broadcasts in one subscription).
  // Using a different topic here avoids the duplicate-channel / presence-after-
  // subscribe crash that occurs when two components share the singleton client.
  useEffect(() => {
    const supabase = createClient()
    const channel  = supabase
      .channel(`db:messages:${crewId}`)
      // INSERT: catches missed broadcasts and reconnect gaps.
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `crew_id=eq.${crewId}` },
        (payload) => {
          const raw = payload.new as Message
          if (!raw?.id || typeof raw.content !== 'string') return
          addMessage({ ...raw, profile: resolveProfile(raw.user_id) } as MessageWithProfile)
        }
      )
      // UPDATE: picks up xp_awarded written back by the award-xp edge function.
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `crew_id=eq.${crewId}` },
        (payload) => {
          const raw = payload.new as Message
          if (!raw?.id) return

          // Guard: award-xp UPDATEs the message row (setting xp_awarded/element_type)
          // BEFORE react-to-message commits the reaction, so the Postgres Changes UPDATE
          // event for award-xp carries reactions:{} from the DB — which would wipe any
          // optimistic reaction the user already applied locally. Only overwrite local
          // reactions when the DB value is non-empty (authoritative) OR when local is
          // already empty (safe to sync). Never apply an empty DB snapshot over a
          // non-empty local state.
          const dbReactions    = (raw.reactions  ?? {}) as Record<string, string[]>
          const localMsg       = useChatStore.getState().messages.find((m) => m.id === raw.id)
          const localReactions = (localMsg?.reactions  ?? {}) as Record<string, string[]>
          const hasDbReactions    = Object.keys(dbReactions).length > 0
          const hasLocalReactions = Object.keys(localReactions).length > 0

          const patch: Partial<Message> = { xp_awarded: raw.xp_awarded, element_type: raw.element_type }
          // Apply DB reactions only when non-empty (authoritative) OR both sides are empty
          if (hasDbReactions || !hasLocalReactions) patch.reactions = dbReactions

          updateMessage(raw.id, patch)
        }
      )
      // Profile UPDATE: reflects avatar/username changes immediately for active chat members.
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

  // Fetch squad definitions on mount + subscribe to live changes
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
            // Resolve username from in-memory profiles first; fall back to a DB fetch
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

  // Show skeleton while the initial history fetch is in flight
  if (!historyLoaded) {
    return (
      <div className="flex-1 min-h-0 overflow-hidden px-4 py-3 flex flex-col gap-3">
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

  // Pre-pass: accumulate XP and coins per group so the group-leader bubble shows running totals.
  // Coins = 1 per message when xp_awarded > 0 (spam-blocked messages earn neither XP nor coins).
  // Mirrors the grouping conditions in the main display-list loop below.
  const groupXPMap   = new Map<string, number>()
  const groupCoinMap = new Map<string, number>()
  {
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
      const msgCoins     = msgXP > 0 ? 1 : 0

      if (!withinMinute || !!msg.reply_to_id) {
        preGroupLeaderId = msg.id
        groupXPMap.set(msg.id, msgXP)
        groupCoinMap.set(msg.id, msgCoins)
      } else if (preGroupLeaderId) {
        groupXPMap.set(preGroupLeaderId, (groupXPMap.get(preGroupLeaderId) ?? 0) + msgXP)
        groupCoinMap.set(preGroupLeaderId, (groupCoinMap.get(preGroupLeaderId) ?? 0) + msgCoins)
      }

      preLastUserId  = msg.user_id
      preLastMsgTime = msgTime
    }
  }

  // Build display list
  type DisplayItem =
    | { kind: 'divider';  label: string;      key: string }
    | { kind: 'boss';     raidId: string;     key: string; raid: ActiveRaid | null }
    | { kind: 'artifact'; artifactId: string; key: string }
    | { kind: 'level_up'; level: number; msgId: string; key: string }
    | { kind: 'message';  message: MessageWithProfile; isOwn: boolean; showHeader: boolean; xpOverride?: number; coinOverride?: number }

  const items: DisplayItem[] = []
  let lastDate:    Date | null   = null
  let lastUserId:  string | null = null
  let lastMsgTime: number        = 0
  const renderedRaids = new Set<string>()

  for (const msg of messages) {
    // Guard against malformed messages (e.g. broadcast with missing fields)
    if (!msg.id || typeof msg.content !== 'string') continue

    const msgDate    = new Date(msg.created_at)
    const msgTime    = msgDate.getTime()
    const raidId     = parseBossSpawnRaidId(msg.content)
    const artifactId = parseArtifactDropId(msg.content)
    const level      = parseLevelUp(msg.content)

    if (!lastDate || !isSameDay(lastDate, msgDate)) {
      items.push({ kind: 'divider', label: dayLabel(msgDate), key: `divider-${msg.id}` })
      lastUserId  = null
      lastMsgTime = 0
    }

    if (raidId) {
      // Boss spawn messages are always skipped — not rendered in squad chat
      if (!renderedRaids.has(raidId)) renderedRaids.add(raidId)
      lastUserId  = null
      lastMsgTime = 0
    } else if (artifactId) {
      if (devMode) {
        items.push({ kind: 'artifact', artifactId, key: `artifact-${msg.id}` })
      }
      lastUserId  = null
      lastMsgTime = 0
    } else if (level !== null) {
      if (devMode) {
        items.push({ kind: 'level_up', level, msgId: msg.id, key: `levelup-${msg.id}` })
      }
      lastUserId  = null
      lastMsgTime = 0
    } else {
      if (msg.message_type === 'poll') {
        // Polls always render with a header and break grouping on both sides
        items.push({ kind: 'message', message: msg as MessageWithProfile, isOwn: msg.user_id === currentUserId, showHeader: true })
        lastUserId  = null
        lastMsgTime = 0
      } else if (msg.message_type === 'system') {
        const c = msg.content
        const isBossMsg = c.includes('BOSS') || c.includes('VOID') || c.includes('boss') || c.includes('raid') || c.includes('RAID')
        if (!isBossMsg) {
          items.push({ kind: 'message', message: msg as MessageWithProfile, isOwn: false, showHeader: false })
          lastUserId  = null
          lastMsgTime = 0
        }
      } else {
        const sameUser     = msg.user_id === lastUserId
        const withinMinute = sameUser && (msgTime - lastMsgTime) < 60_000
        const showHeader   = !withinMinute || !!msg.reply_to_id
        const xpOverride   = showHeader ? groupXPMap.get(msg.id)   : undefined
        const coinOverride = showHeader ? groupCoinMap.get(msg.id) : undefined
        items.push({ kind: 'message', message: msg as MessageWithProfile, isOwn: msg.user_id === currentUserId, showHeader, xpOverride, coinOverride })
        lastUserId  = msg.user_id
        lastMsgTime = msgTime
      }
    }

    lastDate = msgDate
  }

  return (
    <div className="relative flex-1 min-h-0">
      {/* Top fade overlay matching Figma node 88:448 */}
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 z-10 h-1/4"
        style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.25) 46.158%, rgba(0,0,0,0) 100%)',
        }}
      />
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 min-h-0 h-full overflow-y-auto px-4 py-4 flex flex-col nexus-scroll"
    >
      {messages.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 opacity-60">
          <CampfireSprite />
          <p className="font-pixel text-[9px] text-[#6b4f8f] text-center leading-loose">
            Send the first message.<br />The adventure begins.
          </p>
        </div>
      )}

      {items.map((item) => {
        if (item.kind === 'divider') {
          return (
            <div key={item.key} className="flex items-center gap-3 my-2">
              <div className="flex-1 border-t border-[#1a1a2e]" />
              <span className="font-pixel text-[7px] text-[#2a1545]">{item.label}</span>
              <div className="flex-1 border-t border-[#1a1a2e]" />
            </div>
          )
        }

        if (item.kind === 'boss') {
          return (
            <BossCard
              key={item.key}
              raidId={item.raidId}
              crewId={crewId}
              initialRaid={item.raid}
            />
          )
        }

        if (item.kind === 'artifact') {
          return (
            <ArtifactDropRenderer
              key={item.key}
              artifactId={item.artifactId}
              crewName={crewName}
            />
          )
        }

        if (item.kind === 'level_up') {
          if (dismissedLevelUps.has(item.msgId)) return null
          return (
            <AnimatePresence key={item.key}>
              <LevelUpBanner
                level={item.level}
                onDismiss={() => setDismissedLevelUps((s) => new Set([...s, item.msgId]))}
              />
            </AnimatePresence>
          )
        }

        // Use localProfiles for real-time avatar/username updates; fall back to the
        // profile embedded in the message for users who left the crew since fetch.
        const liveProfile = localProfiles[item.message.user_id] ?? item.message.profile
        return (
          <MessageBubble
            key={item.message.id}
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
          />
        )
      })}

      <div ref={bottomRef} />
    </div>
    </div>
  )
}
