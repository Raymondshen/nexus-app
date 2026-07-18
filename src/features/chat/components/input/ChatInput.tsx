'use client'

import React, { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import type { PanInfo } from 'framer-motion'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/shared/supabase/client'
import { getXPProgress } from '@/shared/utils/xp'
import { useChatStore } from '@/store/chatStore'
import { FriendshipXPToast } from '@/shared/components/game/FriendshipXPToast'
import { GemToast } from '@/shared/components/game/GemToast'
import { SUPABASE_URL, PRESENCE_ONLINE_THRESHOLD_MS, config } from '@/shared/constants/config'
import { haptic } from '@/shared/utils/sounds'
import { compressImage, generateLQIP, validateImageUpload, getNetworkQuality } from '@/shared/utils/imageProcessing'
import { computeOnlineIds } from '@/shared/utils/presence'
import { notifyActiveCrew } from '@/shared/utils/notifications'
import { sendWithRetry } from '@/shared/utils/sendWithRetry'
import { postEdgeFn } from '@/shared/utils/edgeFetch'
import { addToOutbox, readOutbox, type OutboxJob } from '@/shared/utils/outbox'
import { acquireCrewMessageChannel, releaseCrewMessageChannel, isActiveCrewMessageChannel, evictCrewMessageChannel } from '@/shared/supabase/crewMessageChannel'
import { IMAGE_CONFIG } from '@/shared/constants/config'
import { ChatSquadDetailBar } from '@/features/chat/components/header/ChatSquadDetailBar'
import { skipNextSlideEnter } from '@/app/layouts/SlidePage'
import { useChatRoomPeekStore } from '@/features/chat/store/chatRoomPeekStore'
import type { RoomMeta } from '@/features/chat/store/chatRoomPeekStore'
import { ensureRoomMeta } from '@/features/chat/utils/ensureRoomMeta'
import { ChatTypingIndicator } from '@/features/chat/components/input/ChatTypingIndicator'
import { isGemGateOpen, recordGemClaim } from '@/shared/utils/gems'
import type { GemClaimResult } from '@/types'
import { Send } from 'pixelarticons/react/Send'
import { Plus } from 'pixelarticons/react/Plus'
import { CornerUpLeft } from 'pixelarticons/react/CornerUpLeft'
import { Close } from 'pixelarticons/react/Close'
import { MagicEdit } from 'pixelarticons/react/MagicEdit'
import { kickMemberAction, renameCrewAction, birthdaysCommandAction } from '@/app/(app)/chat/actions'
import { leaveCrewAction } from '@/app/(app)/home/actions'
import dynamic from 'next/dynamic'
import { CrewImageUploadModal } from '@/features/chat/components/sheets/CrewImageUploadModal'
import { CrewBackgroundUploadModal } from '@/features/chat/components/sheets/CrewBackgroundUploadModal'
import { SquadDetailsSheet, type MiniMember } from '@/features/chat/components/sheets/SquadDetailsSheet'
import { ManageSquadProfile } from '@/features/chat/screens/ManageSquadProfile'
import { NotifSheet, type NotifPrefs } from '@/features/chat/components/sheets/NotifSheet'
import { AddMediaSheet } from '@/features/chat/components/input/AddMediaSheet'

// Rarely-opened sheets, all conditionally rendered below — code-split so their
// weight (Klipy picker UI, event creation + crop flow, poll creator) stays out of
// the eager chat bundle and is fetched on first open. SquadDetailsSheet and
// NotifSheet stay static: they're a core, frequently-used part of the screen.
const GifPickerSheet = dynamic(
  () => import('@/features/chat/components/input/GifPickerSheet').then((m) => m.GifPickerSheet),
  { ssr: false },
)
const PollCreatorSheet = dynamic(
  () => import('@/features/chat/components/polls/PollCreatorSheet').then((m) => m.PollCreatorSheet),
  { ssr: false },
)
const EventCreationSheet = dynamic(
  () => import('@/features/events/components/EventCreationSheet').then((m) => m.EventCreationSheet),
  { ssr: false },
)
import { setHomeLastMessage } from '@/features/home/utils/homePreviewCache'
import type { Message, MessageWithProfile, Profile } from '@/types'

const MAX_MESSAGE_LENGTH   = 2000
const RATE_LIMIT_MAX       = 30
const RATE_LIMIT_WINDOW    = 60_000
const ONLINE_THRESHOLD_MS  = PRESENCE_ONLINE_THRESHOLD_MS
// Minimum gap between update_active DB writes triggered outside the 30s heartbeat interval
const ACTIVE_WRITE_THROTTLE_MS = 10_000

const SLASH_COMMANDS = [
  { name: 'birthdays', icon: '🎂', description: 'See upcoming squad birthdays' },
  { name: 'event',     icon: '📅', description: 'Create a group event' },
] as const
type SlashCommandName = typeof SLASH_COMMANDS[number]['name']


// background_url is optional here (not a plain Pick field) because the DM page's
// own MemberProfile — passed through unchanged as this same prop shape — never
// fetches it (SquadDetailsSheet, the only consumer, is skipped for DMs).
export type MemberProfile = Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url' | 'status'> & { background_url?: string | null }

interface PendingImage {
  id:        string
  localUrl:  string        // blob URL — shown immediately on selection
  publicUrl: string | null // set after upload completes
  lqip:      string | null // set after LQIP generation
  uploading: boolean
  error:     string | null
}

interface ChatInputProps {
  crewId:         string
  userId:         string
  userProfile:    MemberProfile
  memberProfiles: Record<string, MemberProfile>
  memberPinnedVinyls?: Record<string, { imageUrl: string | null; title: string | null }>
  crewName:       string
  inviteCode?:    string
  creatorId?:     string
  crewImageUrl?:           string | null
  crewBackgroundImageUrl?: string | null
  initialXP?:              number
  currentUserId?:      string
  isDM?:               boolean
  dmPartnerId?:        string
  /** This user's group-chat crew ids, most-recently-active first (DMs excluded) — feeds
   * the dev-gated chat swipe-navigation feature. Omitted/empty on the DM screen. */
  chatRoomOrder?:      string[]
}

function sanitizeMessage(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').trim().slice(0, MAX_MESSAGE_LENGTH)
}

// Fire-and-forget daily gem claim. The local gate (idb-keyval) is a debounce only —
// the award-gem Edge Function + claim_daily_gem RPC are the sole authority on the
// award decision. Must never block sending or surface errors as a send failure.
async function tryClaimDailyGem(supabase: ReturnType<typeof createClient>, onClaimed?: () => void) {
  try {
    if (!(await isGemGateOpen())) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return

    const res = await fetch(`${SUPABASE_URL}/functions/v1/award-gem`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body:    JSON.stringify({ timezone_offset_minutes: new Date().getTimezoneOffset() }),
    })
    const data: GemClaimResult = await res.json()
    if (data.claimed) {
      await recordGemClaim()
      useChatStore.getState().setGemBalance(data.gem_balance)
      onClaimed?.()
    }
  } catch {
    // Silent — a failed gem claim must never surface as a message send error.
  }
}


// Stable empty fallbacks for ChatSquadDetailBar while barOverride is active — the
// swiped-to room's online members/avatars aren't tracked from here (presence only
// runs for the mounted room), so the bar simply omits that row rather than mislabeling
// the outgoing room's online members as the destination's.
const EMPTY_MEMBERS: MemberProfile[] = []
const EMPTY_ONLINE_IDS = new Set<string>()
const EMPTY_PENDING_IMAGES: PendingImage[] = []

// ─── ChatInput ────────────────────────────────────────────────────────────────

export function ChatInput({ crewId, userId, userProfile, memberProfiles, memberPinnedVinyls, crewName, inviteCode, creatorId, crewImageUrl: initialCrewImageUrl, crewBackgroundImageUrl: initialCrewBgUrl, initialXP, isDM, dmPartnerId, chatRoomOrder = [] }: ChatInputProps) {
  const router = useRouter()
  // Squad-bar content shown in place of THIS room's own image/name/level/member count,
  // used only on the arrival side of a committed room-swipe (see the mount-seeding
  // effect below) — never on the departing side anymore. The outgoing room's real bar
  // now stays showing its own identity, unchanged, all the way to unmount (chatRoomPeekStore
  // + ChatRoomPeekLayer's PeekBarAndInput keep that same frozen identity visible through
  // the navigation gap — see that component's doc comment). So the ONLY place group A's
  // name should ever be shown on THIS (group B's) bar is right at mount, seeded from the
  // lazy initializer below, then cleared a tick later to reveal group B's real identity —
  // that clear is what drives ChatSquadDetailBar's AnimatePresence to slide A down/out
  // while B slides in from the top, exactly once, with real (not placeholder) content on
  // both ends of the transition.
  const [barOverride,    setBarOverride]    = useState<RoomMeta | null>(() => {
    const { peek, currentCrewId, roomMeta } = useChatRoomPeekStore.getState()
    // This mount is the landing target of an in-flight swipe-nav commit, and the room
    // being departed (still `currentCrewId` at this exact synchronous point — the
    // departing room's own "I'm mounted" effect hasn't been superseded by this one yet,
    // since effects haven't run for either component this commit) has a cached identity
    // to borrow. Any other mount path (tap in from Home, deep link, back-nav, refresh)
    // leaves this null, so the bar just shows its own real identity immediately as usual.
    if (peek && peek.targetCrewId === crewId && currentCrewId && roomMeta[currentCrewId]) {
      return roomMeta[currentCrewId]
    }
    return null
  })
  const chatInputBoxRef = useRef<HTMLDivElement>(null)
  const [text,           setText]          = useState('')
  const [sendError,      setSendError]      = useState<string | null>(null)
  const [pollEnabled,      setPollEnabled]       = useState(false)
  const [eventsEnabled,    setEventsEnabled]     = useState(false)
  const [fxpEnabled,       setFxpEnabled]        = useState(false)
  const [chatSwipeNavEnabled, setChatSwipeNavEnabled] = useState(false)
  const [gemToastVisible,   setGemToastVisible]   = useState(false)
  const [isExpanded,     setIsExpanded]     = useState(false)
  const [showNotifSheet,  setShowNotifSheet]  = useState(false)
  const [showManageSquad, setShowManageSquad] = useState(false)
  const [notifPrefs,      setNotifPrefs]      = useState<NotifPrefs>({ messages: true, mentions: true, replies: true })
  const [memberMsgCounts, setMemberMsgCounts] = useState<Map<string, number>>(new Map())
  const [loadingCounts,  setLoadingCounts]  = useState(false)
  const [removeTarget,   setRemoveTarget]   = useState<MemberProfile | null>(null)
  const [removing,       setRemoving]       = useState(false)
  const [removeError,    setRemoveError]    = useState<string | null>(null)
  const [showLastMemberWarning, setShowLastMemberWarning] = useState(false)
  const [leavingSquad,   setLeavingSquad]   = useState(false)
  const [kickedIds,      setKickedIds]      = useState<Set<string>>(new Set())
  const [crewImageUrl,   setCrewImageUrl]   = useState<string | null>(initialCrewImageUrl ?? null)
  const [crewImageFile,  setCrewImageFile]  = useState<File | null>(null)
  const [crewBgUrl,      setCrewBgUrl]      = useState<string | null>(initialCrewBgUrl ?? null)
  const [crewBgFile,     setCrewBgFile]     = useState<File | null>(null)
const [showPollCreator,  setShowPollCreator]  = useState(false)
  const [showGifPicker,    setShowGifPicker]    = useState(false)
  const [showMediaPicker,  setShowMediaPicker]  = useState(false)
  const [mentionQuery,    setMentionQuery]    = useState<string | null>(null)
  const [mentionIndex,    setMentionIndex]    = useState(0)
  const [isFocused,       setIsFocused]       = useState(false)
  // True for the whole duration of an active x-axis room-swipe drag (set/cleared by
  // handleTopPan/handleTopPanStart/handleTopPanEnd below) — while true, the input area
  // renders its default idle look (plus/placeholder/send, no reply/edit banner or typed
  // draft) instead of this room's real state, since the real bar/input stays static and
  // fully visible through the whole drag (see handleTopPan's own doc comment) and a
  // half-typed draft or an open reply/edit banner reads as "stuck" mid-gesture. The real
  // text/replyTo/editTo/pendingImages state is left completely untouched, so cancelling
  // the swipe (spring-back) restores exactly what was there beforehand.
  const [isRoomSwiping,   setIsRoomSwiping]   = useState(false)
  const [showEventSheet,  setShowEventSheet]  = useState(false)
  const [isMultiline,     setIsMultiline]     = useState(false)

  const [pendingImages,      setPendingImages]      = useState<PendingImage[]>([])
  const [friendshipToast,    setFriendshipToast]    = useState<{ totalXP: number; xpAwarded: number; partnerName: string; dailyCount: number } | null>(null)

  const textareaRef           = useRef<HTMLTextAreaElement>(null)
  const inputRef              = useRef<HTMLInputElement>(null)
  const mirrorRef             = useRef<HTMLSpanElement>(null)
  const innerContainerRef     = useRef<HTMLDivElement>(null)
  const pendingCaretPosRef    = useRef<number | null>(null)
  const isMultilineRef        = useRef(false)
  const textRef               = useRef('')
  const overlayRef            = useRef<HTMLDivElement>(null)
  const crewImageInputRef     = useRef<HTMLInputElement>(null)
  const crewBgInputRef        = useRef<HTMLInputElement>(null)
  const chatImageInputRef     = useRef<HTMLInputElement>(null)
  const rateRef               = useRef({ count: 0, resetAt: Date.now() + RATE_LIMIT_WINDOW })
  const typingTimerRef        = useRef<ReturnType<typeof setTimeout> | null>(null)
  const friendshipToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gemToastTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const msgChannelRef         = useRef<RealtimeChannel | null>(null)
  const channelReadyRef       = useRef(false)
  const lastActiveWriteRef    = useRef(0)
  const isTypingRef           = useRef(false)
  // CLOSED-channel rebuild state — see the CLOSED branch in the subscribe callback.
  // attempts drives the backoff (reset on SUBSCRIBED); pendingRebuild defers a
  // rebuild that hit while backgrounded until the next foreground.
  const rebuildTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rebuildAttemptsRef    = useRef(0)
  const pendingRebuildRef     = useRef(false)
  // Individual selectors — a bare useChatStore() destructure subscribes to the whole
  // store, so every Realtime-driven update (incoming messages, reaction patches,
  // optimistic-send reconciliation — all of which replace the `messages` array this
  // component never reads) re-rendered this entire component. Actions are stable
  // references, so their selectors never trigger a re-render.
  const addMessage        = useChatStore((s) => s.addMessage)
  const updateMessage     = useChatStore((s) => s.updateMessage)
  const setCrewXP         = useChatStore((s) => s.setCrewXP)
  const receiveXP         = useChatStore((s) => s.receiveXP)
  const bumpCrewXP        = useChatStore((s) => s.bumpCrewXP)
  const crewXP            = useChatStore((s) => s.crewXP)
  const crewLevel         = useChatStore((s) => s.crewLevel)
  const onlineUserIds     = useChatStore((s) => s.onlineUserIds)
  const setLastActive     = useChatStore((s) => s.setLastActive)
  const addUserCoins      = useChatStore((s) => s.addUserCoins)
  const storeCrewName     = useChatStore((s) => s.crewName)
  const setCrewName       = useChatStore((s) => s.setCrewName)
  const replyTo           = useChatStore((s) => s.replyTo)
  const setReplyTo        = useChatStore((s) => s.setReplyTo)
  const editTo            = useChatStore((s) => s.editTo)
  const setEditTo         = useChatStore((s) => s.setEditTo)
  const squadDetailsOpen  = useChatStore((s) => s.squadDetailsOpen)
  const setSquadDetailsOpen = useChatStore((s) => s.setSquadDetailsOpen)
  const channelEpoch      = useChatStore((s) => s.channelEpoch)

  const liveCrewName = storeCrewName || crewName

  // Keep refs in sync on every render so closures and effects always see current values
  textRef.current = text
  isMultilineRef.current = isMultiline

  const profilesRef       = useRef(memberProfiles)
  profilesRef.current     = memberProfiles
  const userProfileRef    = useRef(userProfile)
  userProfileRef.current  = userProfile
  const pendingImagesRef  = useRef<PendingImage[]>([])
  pendingImagesRef.current = pendingImages
  const xpProgress  = getXPProgress(crewXP)
  // memberProfiles is a stable server-provided prop and kickedIds only changes on an
  // actual kick, so memoizing here keeps this array/its identity stable across the
  // component's frequent unrelated re-renders (realtime messages, XP, typing state) —
  // which lets consumers like SquadDetailsSheet's sortedMembers memoization actually
  // skip work instead of recomputing every time because `members` looked "new".
  const members     = useMemo(
    () => Object.values(memberProfiles).filter(m => !kickedIds.has(m.id)),
    [memberProfiles, kickedIds]
  )
  const memberCount = members.length

  // Bookkeeping for the chat-swipe-nav peek layer (chat/[crewId]/layout.tsx's
  // ChatRoomPeekLayer, which persists across room navigation unlike this component):
  // tells it which room is *actually* mounted right now (so it can clear itself once a
  // peeked room's real page takes over, and so ChatRoomPeekLayer's frozen bar/input
  // preview knows which room's identity to keep showing through a swipe-nav's navigation
  // gap) and seeds this room's own name/image/level/member-count so it's available
  // instantly if another room's mount-seeding initializer (see barOverride above) or
  // peek preview needs to borrow it.
  useEffect(() => {
    useChatRoomPeekStore.getState().setCurrentRoom(crewId)
    useChatRoomPeekStore.getState().setRoomMeta(crewId, { name: liveCrewName, imageUrl: crewImageUrl, level: crewLevel, memberCount })
  }, [crewId, liveCrewName, crewImageUrl, crewLevel, memberCount])

  // Clears a mount-seeded barOverride (see its lazy initializer above) one tick after
  // first paint. React commits the seeded state's paint before this effect runs, so the
  // browser genuinely shows group A's borrowed identity first — this then flips the bar
  // prop to group B's real identity, which is what makes ChatSquadDetailBar's
  // AnimatePresence see a key change and play the slide-down-and-fade/slide-in-from-top
  // transition, now with the real destination room's own data already loaded. A no-op
  // (and no transition) on any mount that wasn't seeded.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (barOverride) setBarOverride(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Only meaningful while the squad sheet is open, but hooks must run
  // unconditionally — cheap to recompute and now actually stable thanks to
  // the `members` memoization above, instead of a fresh array+objects per render.
  // Lowercased usernames for the @mention overlay — renderHighlightedInput runs on
  // every keystroke render, so build this Set once per membership change, not per call.
  const memberUsernameSet = useMemo(
    () => new Set(members.map((m) => m.username.toLowerCase())),
    [members]
  )
  const squadSheetMembers = useMemo(
    (): MiniMember[] => members.map((m) => ({
      id:             m.id,
      username:       m.username,
      avatar_url:     m.avatar_url as string | null,
      avatar_class:   m.avatar_class,
      background_url: m.background_url ?? null,
      status:         m.status,
    })),
    [members]
  )

  useEffect(() => {
    setFxpEnabled(localStorage.getItem('nexus_friendship_xp') === '1')
    setPollEnabled(localStorage.getItem('nexus_poll_feature') === '1')
    setEventsEnabled(localStorage.getItem('nexus_events_enabled') === '1')
    setChatSwipeNavEnabled(localStorage.getItem('nexus_chat_swipe_nav') === '1')
    function onFxpChange(e: Event)    { setFxpEnabled((e as CustomEvent<{ on: boolean }>).detail.on) }
    function onPollChange(e: Event)   { setPollEnabled((e as CustomEvent<{ on: boolean }>).detail.on) }
    function onEventsChange(e: Event) { setEventsEnabled((e as CustomEvent<{ on: boolean }>).detail.on) }
    function onChatSwipeNavChange(e: Event) { setChatSwipeNavEnabled((e as CustomEvent<{ on: boolean }>).detail.on) }
    window.addEventListener('nexus-friendship-xp-change', onFxpChange)
    window.addEventListener('nexus-poll-feature-change', onPollChange)
    window.addEventListener('nexus-events-feature-change', onEventsChange)
    window.addEventListener('nexus-chat-swipe-nav-change', onChatSwipeNavChange)
    return () => {
      window.removeEventListener('nexus-friendship-xp-change', onFxpChange)
      window.removeEventListener('nexus-poll-feature-change', onPollChange)
      window.removeEventListener('nexus-events-feature-change', onEventsChange)
      window.removeEventListener('nexus-chat-swipe-nav-change', onChatSwipeNavChange)
    }
  }, [])

  useEffect(() => {
    if (replyTo) focusField()
  }, [replyTo]) // eslint-disable-line react-hooks/exhaustive-deps

  // Populate input when entering edit mode
  useEffect(() => {
    if (editTo) {
      setText(editTo.content)
      textRef.current = editTo.content
      requestAnimationFrame(() => {
        recheckOverflow(editTo.content)
        focusField()
      })
    }
  }, [editTo]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clear reply/edit state when leaving this crew so it never bleeds into the next chat
  useEffect(() => {
    return () => { setReplyTo(null); setEditTo(null) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Seed store with server-fetched values (previously handled by ChatHeader)
  useEffect(() => {
    if (initialXP !== undefined) setCrewXP(initialXP)
    setCrewName(crewName)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps


  // Update last_seen every 60s for accurate server-side unread cursors
  useEffect(() => {
    const supabase = createClient()
    const update = async () => {
      try {
        await supabase
          .from('crew_members')
          .update({ last_seen: new Date().toISOString() })
          .eq('crew_id', crewId)
          .eq('user_id', userId)
      } catch {
        // Presence is best-effort
      }
    }
    update()
    const interval = setInterval(update, 60_000)
    return () => clearInterval(interval)
  }, [crewId, userId]) // eslint-disable-line

  useEffect(() => {
    if (!squadDetailsOpen) return
    setIsExpanded(true)
    setSquadDetailsOpen(false)
  }, [squadDetailsOpen]) // eslint-disable-line

  // Member message counts are only ever displayed inside SquadDetailsSheet, so defer
  // the RPC until the sheet is actually opened rather than fetching on every chat
  // mount. Refetches on every open (not cached per crew) so the total stays active —
  // messages sent since the sheet was last open must be reflected, matching
  // HomeCrewDetailsSheet's fetch-on-mount behavior.
  useEffect(() => {
    if (!isExpanded) return
    let cancelled = false
    setLoadingCounts(true)
    createClient()
      .rpc('get_crew_member_msg_counts', { p_crew_id: crewId })
      .then(({ data }) => {
        if (cancelled) return
        setMemberMsgCounts(new Map((data ?? []).map(r => [r.user_id, Number(r.msg_count)])))
        setLoadingCounts(false)
      })
    return () => { cancelled = true }
  }, [isExpanded, crewId]) // eslint-disable-line

  // Per-crew notification preferences — powers the Bell/BellOff icon in SquadDetailsSheet
  useEffect(() => {
    if (isDM) return
    let cancelled = false
    createClient()
      .from('crew_notification_preferences')
      .select('notif_messages, notif_mentions, notif_replies')
      .eq('user_id', userId)
      .eq('crew_id', crewId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        setNotifPrefs({
          messages: data.notif_messages as boolean,
          mentions: data.notif_mentions as boolean,
          replies:  data.notif_replies as boolean,
        })
      })
    return () => { cancelled = true }
  }, [isDM, userId, crewId])

  // Read prefs through a ref so this callback never closes over a stale snapshot —
  // with `notifPrefs` as a dep, a toggle racing the initial prefs fetch wrote the
  // pre-fetch defaults for the two untouched columns. The ref also keeps the
  // callback identity stable, so NotifSheet's onToggle prop doesn't churn.
  const notifPrefsRef = useRef(notifPrefs)
  notifPrefsRef.current = notifPrefs
  const handleToggleNotif = useCallback(async (type: keyof NotifPrefs) => {
    const prev = notifPrefsRef.current
    const next = { ...prev, [type]: !prev[type] }
    setNotifPrefs(next)
    const { error } = await createClient()
      .from('crew_notification_preferences')
      .upsert(
        {
          user_id:        userId,
          crew_id:        crewId,
          notif_messages: next.messages,
          notif_mentions: next.mentions,
          notif_replies:  next.replies,
          updated_at:     new Date().toISOString(),
        },
        { onConflict: 'user_id,crew_id' },
      )
    // Roll back the optimistic flip if the write failed, so the bell can't lie.
    if (error) setNotifPrefs(prev)
  }, [userId, crewId])

  const allMuted = !notifPrefs.messages && !notifPrefs.mentions && !notifPrefs.replies

  // Sync overlay scroll with the active field so highlighted text stays aligned.
  useEffect(() => {
    const field = isMultiline ? textareaRef.current : inputRef.current
    const ov = overlayRef.current
    if (!field || !ov) return
    const sync = () => {
      if (overlayRef.current) {
        overlayRef.current.scrollTop  = field.scrollTop
        overlayRef.current.scrollLeft = field.scrollLeft
      }
    }
    field.addEventListener('scroll', sync)
    return () => field.removeEventListener('scroll', sync)
  }, [isMultiline])

  // ─── Hybrid input/textarea helpers ─────────────────────────────────────────

  function getActiveField(): HTMLInputElement | HTMLTextAreaElement | null {
    return isMultilineRef.current ? textareaRef.current : inputRef.current
  }

  function focusField() {
    if (isMultilineRef.current) textareaRef.current?.focus()
    else inputRef.current?.focus()
  }

  // Measures text width via the hidden mirror span and swaps element type if needed.
  // Called on every keystroke and on container resize.
  const recheckOverflow = useCallback((val?: string, caretPos?: number) => {
    const currentVal = val ?? textRef.current
    const mirror     = mirrorRef.current
    const container  = innerContainerRef.current
    if (!mirror || !container) return

    mirror.textContent = currentVal || ''
    const mirrorWidth    = mirror.offsetWidth
    const containerWidth = container.clientWidth

    // 2px forward buffer, 6px hysteresis before swapping back — prevents thrashing at boundary
    const willWrap = mirrorWidth > containerWidth - 2
    const willFit  = mirrorWidth < containerWidth - 6

    if (!isMultilineRef.current && willWrap) {
      const pos = caretPos ?? (inputRef.current?.selectionStart ?? currentVal.length)
      pendingCaretPosRef.current = pos
      isMultilineRef.current = true
      setIsMultiline(true)
    } else if (isMultilineRef.current && willFit && !currentVal.includes('\n')) {
      const pos = caretPos ?? (textareaRef.current?.selectionStart ?? currentVal.length)
      pendingCaretPosRef.current = pos
      isMultilineRef.current = false
      setIsMultiline(false)
    } else if (isMultilineRef.current) {
      // Already in textarea mode — update height as content changes
      const el = textareaRef.current
      if (el) {
        el.style.height = 'auto'
        const cs  = getComputedStyle(el)
        const lh  = parseFloat(cs.lineHeight) || 24
        const pt  = parseFloat(cs.paddingTop) || 12
        const pb  = parseFloat(cs.paddingBottom) || 12
        el.style.height = Math.min(el.scrollHeight, pt + pb + lh * 3) + 'px'
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Restore caret and set initial textarea height after element swap
  useLayoutEffect(() => {
    const pos = pendingCaretPosRef.current
    if (pos === null) return
    pendingCaretPosRef.current = null
    const el = isMultiline ? textareaRef.current : inputRef.current
    if (!el) return
    if (isMultiline && el instanceof HTMLTextAreaElement) {
      el.style.height = 'auto'
      const cs  = getComputedStyle(el)
      const lh  = parseFloat(cs.lineHeight) || 24
      const pt  = parseFloat(cs.paddingTop) || 12
      const pb  = parseFloat(cs.paddingBottom) || 12
      el.style.height = Math.min(el.scrollHeight, pt + pb + lh * 3) + 'px'
    }
    el.focus()
    el.setSelectionRange(pos, pos)
  }, [isMultiline])

  // Re-check overflow when the container is resized (orientation change, keyboard open/close)
  useEffect(() => {
    const container = innerContainerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => recheckOverflow())
    ro.observe(container)
    return () => ro.disconnect()
  }, [recheckOverflow])

  // Publishes this room's rendered squad-bar+input height to chatRoomPeekStore so
  // ChatRoomPeekLayer can inset its message-log skeleton preview to match the real
  // MessageList's own bounding box (see chatInputHeight's doc comment in that store).
  useEffect(() => {
    const el = chatInputBoxRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      useChatRoomPeekStore.getState().setChatInputHeight(entry.contentRect.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ────────────────────────────────────────────────────────────────────────────

  // Dev-gated (nexus_chat_swipe_nav): swipe the squad bar left/right to page to the
  // next/previous group chat room in chatRoomOrder (Home's own most-recently-active
  // ordering, DMs excluded — see chat/[crewId]/page.tsx). The message-history log no
  // longer transitions with the drag — MessageList always renders at rest now,
  // regardless of chatRoomPeekStore's `peek` state. The squad bar, floating nav, input
  // box, and message log all stay completely static through the whole gesture, keeping
  // THIS room's own identity and content on screen the entire time (no early hard-cut
  // to the destination's — see the barOverride mount-seeding effect above for where
  // that transition actually happens: on arrival, not on departure). `peek` is still
  // written throughout the gesture (chatRoomPeekStore + ensureRoomMeta prefetch below),
  // and past the commit threshold this still fires the actual navigation —
  // skipNextSlideEnter(true) tells the real destination SlidePage to mount already in
  // position and crossfade its opacity in, rather than popping straight to fully opaque
  // real content — see that function's own doc comment. Below threshold, or at the
  // start/end of the room list, the gesture just cancels — nothing to spring back
  // visually now that nothing moved.
  //
  // panAxisRef locks the gesture to whichever axis (x = room swipe, y = existing
  // swipe-up-to-expand) crosses a small intent threshold first, so the two gestures
  // sharing this same bar never fight each other mid-drag. dragStartedRef tracks
  // whether we actually engaged the room-swipe drag (only true once axis=x AND the
  // feature is on AND there's more than one room).
  const panAxisRef     = useRef<'x' | 'y' | null>(null)
  const dragStartedRef = useRef(false)

  function handleTopPanStart() {
    panAxisRef.current     = null
    dragStartedRef.current = false
    setIsRoomSwiping(false)
  }

  function handleTopPan(_: PointerEvent, info: PanInfo) {
    if (panAxisRef.current === null) {
      if (Math.abs(info.offset.x) < 10 && Math.abs(info.offset.y) < 10) return
      panAxisRef.current = Math.abs(info.offset.x) > Math.abs(info.offset.y) ? 'x' : 'y'
    }
    if (panAxisRef.current !== 'x' || !chatSwipeNavEnabled || chatRoomOrder.length <= 1) return

    // Edge transition only (not every pan frame) — dragStartedRef doubles as the "have
    // we already flipped isRoomSwiping on for this gesture" guard.
    if (!dragStartedRef.current) setIsRoomSwiping(true)
    dragStartedRef.current = true

    // Rubber-band resistance at the ends of the room list — dragging "past" the first
    // or last room still moves the peek layer's ghost, just damped, instead of either a
    // hard stop or an unbounded 1:1 drag toward a swipe that can't commit to anything.
    const currentIndex = chatRoomOrder.indexOf(crewId)
    const dx     = info.offset.x
    const atEnd  = currentIndex === -1 || currentIndex >= chatRoomOrder.length - 1
    const atHome = currentIndex <= 0
    const resisted = (dx < 0 && atEnd) || (dx > 0 && atHome) ? dx * 0.35 : dx

    // Mirror the drag onto the peek layer for whichever room is on the leading edge.
    // No target in that direction (list boundary) — nothing to peek, just the rubber-band.
    const direction: 'left' | 'right' | null = dx < 0 ? 'left' : dx > 0 ? 'right' : null
    const targetId = direction && currentIndex !== -1
      ? chatRoomOrder[currentIndex + (direction === 'left' ? 1 : -1)]
      : undefined
    if (targetId && direction) {
      useChatRoomPeekStore.getState().setPeek({ targetCrewId: targetId, direction, x: resisted, phase: 'dragging' })
      void ensureRoomMeta(targetId)
    } else {
      useChatRoomPeekStore.getState().setPeek(null)
    }
  }

  function handleTopPanEnd(_: PointerEvent, info: PanInfo) {
    if (dragStartedRef.current) {
      const swipedLeft  = info.offset.x < -60 || info.velocity.x < -400
      const swipedRight = info.offset.x > 60  || info.velocity.x > 400
      const currentIndex = chatRoomOrder.indexOf(crewId)
      const targetId = (swipedLeft || swipedRight) && currentIndex !== -1
        ? chatRoomOrder[currentIndex + (swipedLeft ? 1 : -1)]
        : undefined

      if (targetId) {
        const direction = swipedLeft ? 'left' : 'right'
        // No barOverride hard-cut here anymore — this room's own bar stays showing its
        // own identity, unchanged, all the way to unmount. The destination room's own
        // mount-seeded barOverride (see its lazy initializer above) is what now plays the
        // group-A-to-group-B transition, on arrival, once B's real data is loaded.
        useChatRoomPeekStore.getState().setPeek({ targetCrewId: targetId, direction, x: info.offset.x, phase: 'committing' })
        // The peek layer above is what visually reveals the destination room (sliding
        // its ghost placeholder all the way to x:0) — the real SlidePage that mounts once
        // navigation lands should pick up silently at that same rest position instead of
        // re-playing its own entrance (position) animation on top, which would look like a
        // second, redundant slide-in. It still crossfades in (fadeIn=true) since, unlike a
        // plain back-nav, there's no already-rendered real content underneath — only the
        // peek layer's ghost — so popping straight to fully opaque would be an abrupt cut
        // rather than a smooth handoff. See skipNextSlideEnter's own doc comment.
        skipNextSlideEnter(true)
        sessionStorage.setItem('nexus_chat_from', 'chat')
        router.push(`/chat/${targetId}`)
        return
      }
      const activePeek = useChatRoomPeekStore.getState().peek
      if (activePeek) useChatRoomPeekStore.getState().setPeek({ ...activePeek, phase: 'cancelling' })
      setIsRoomSwiping(false)
      return
    }
    if (info.offset.y < -50 || info.velocity.y < -300) setIsExpanded(true)
  }

  // Prefetch the immediately adjacent rooms in chatRoomOrder as soon as this room
  // mounts (not lazily on drag) so a committed swipe's router.push() warms up faster —
  // shortening how long the peek preview sits frozen before the real room takes over
  // (see chat/[crewId]/loading.tsx's own doc comment for how that generic-skeleton
  // flash is actually suppressed during a swipe-committed navigation; this prefetch is
  // a complementary perf assist, not what prevents that flash by itself). Each
  // landed-on room prefetches its own neighbors in turn, so paging outward stays
  // progressively warm without eagerly fetching the whole list up front.
  useEffect(() => {
    if (!chatSwipeNavEnabled || chatRoomOrder.length <= 1) return
    const currentIndex = chatRoomOrder.indexOf(crewId)
    if (currentIndex === -1) return
    const prevId = chatRoomOrder[currentIndex - 1]
    const nextId = chatRoomOrder[currentIndex + 1]
    if (prevId) router.prefetch(`/chat/${prevId}`)
    if (nextId) router.prefetch(`/chat/${nextId}`)
  }, [chatSwipeNavEnabled, chatRoomOrder, crewId, router])

  useEffect(() => {
    // Mark self online instantly, without discarding already-known peer presence
    // (so a member who's already known online in this crew keeps showing online
    // through a remount instead of flashing to empty); DB fetch + peer broadcasts
    // below refine the rest of the set.
    useChatStore.getState().markSelfOnline(userId)

    // Tell the SW this crew's chat is open so a push for it can be suppressed —
    // the message is already visible here via Realtime. Only announce while the
    // page is actually foregrounded; handleVisibilityChange below keeps it in sync.
    if (document.visibilityState === 'visible') notifyActiveCrew(crewId)

    const supabase = createClient()
    // Shared with MessageList's postgres_changes listeners — see crewMessageChannel.ts.
    // This effect remains the sole owner of the actual .subscribe() call (deferred
    // below) since it also owns the presence/heartbeat lifecycle.
    const ch = acquireCrewMessageChannel(crewId, userId)
    const fallbackProfile = (uid: string): MemberProfile =>
      profilesRef.current[uid] ?? { id: uid, username: '???', avatar_class: null, avatar_url: null }

    // Heartbeat: write to DB + broadcast timestamp so channel peers update their maps
    const heartbeat = () => {
      const ts = Date.now()
      setLastActive(userId, ts)
      ch.send({ type: 'broadcast', event: 'active', payload: { user_id: userId, ts } })
      lastActiveWriteRef.current = ts
      supabase.rpc('update_active').then(() => {}, (err) => {
        if (config.isDev) console.warn('[presence] update_active failed', err)
      })
    }

    // Seed initial online set from DB — covers members active outside this tab
    const memberIds = Object.keys(profilesRef.current)
    if (memberIds.length > 0) {
      supabase
        .from('user_presence')
        .select('user_id, last_active_at')
        .in('user_id', memberIds)
        .then(({ data }) => {
          if (!data) return
          // Build peer entries — skip self to protect the fresh Date.now() from markSelfOnline
          const peerEntries: Record<string, number> = {}
          data.forEach((p) => {
            if (p.user_id === userId || !p.last_active_at) return
            peerEntries[p.user_id] = new Date(p.last_active_at).getTime()
          })
          // Single atomic update: merge peers into map and recompute online set in one shot
          useChatStore.setState((s) => {
            const lastActiveMap = { ...s.lastActiveMap, ...peerEntries }
            return { lastActiveMap, onlineUserIds: computeOnlineIds(lastActiveMap, ONLINE_THRESHOLD_MS) }
          })
        })
    }

    let heartbeatTimer: ReturnType<typeof setInterval> | null = null
    const startHeartbeat = () => {
      if (heartbeatTimer) return
      heartbeatTimer = setInterval(heartbeat, 30_000)
    }
    const stopHeartbeat = () => {
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
    }

    // Sweep stale entries from onlineUserIds every 15s — no network call, pure local math
    const sweepTimer = setInterval(
      () => useChatStore.getState().sweepOnlineUserIds(ONLINE_THRESHOLD_MS),
      15_000,
    )

    ch
      .on('presence', { event: 'sync' }, () => {
        // Presence channel used for typing indicators only — online status comes from timestamps.
        // Written into chatStore (not local state) — see ChatTypingIndicator; the store's own
        // equality check bails out when this sync didn't actually change who's typing.
        // The presence key IS the user id (see acquireCrewMessageChannel call below), so a
        // single user can still have >1 presence entry under that key (e.g. the same account
        // open in two tabs/devices at once) — collapse to one entry per key ("any connection
        // for this user is typing" instead of flatMap-ing every connection's own row) or a
        // user with two open sessions renders as two duplicate "X and X are typing..." names.
        const state = ch.presenceState<{ username: string; typing: boolean }>()
        const others = Object.entries(state)
          .filter(([key]) => key !== userId)
          .filter(([, presences]) => presences.some((p) => p.typing))
          .map(([, presences]) => presences[0].username)
        useChatStore.getState().setTypingUsernames(others)
      })
      .on('broadcast', { event: 'active' }, ({ payload }) => {
        const { user_id: uid, ts } = payload as { user_id: string; ts: number }
        if (!uid || typeof ts !== 'number') return
        const store = useChatStore.getState()
        store.setLastActive(uid, ts)
        store.sweepOnlineUserIds(ONLINE_THRESHOLD_MS)
      })
      .on('broadcast', { event: 'new_message' }, (payload) => {
        const msg = payload.payload as Message
        if (!msg?.id || typeof msg.content !== 'string') return
        addMessage({ ...msg, profile: fallbackProfile(msg.user_id) })
        // Optimistic XP bump for others' text/image messages — xp_update broadcast reconciles later
        if (msg.user_id !== userId && (msg.message_type === 'text' || msg.message_type === 'image') && !isDM) {
          useChatStore.getState().bumpCrewXP()
        }
      })
      .on('broadcast', { event: 'xp_update' }, (payload) => {
        const { xp_earned, new_total_xp, sender_id } =
          payload.payload as { xp_earned: number; new_total_xp: number; sender_id: string }
        if (typeof new_total_xp !== 'number') return
        if (sender_id === userId)               setCrewXP(new_total_xp)
        else if (xp_earned > 0 && !isDM)        receiveXP(xp_earned, new_total_xp)
        else                                    setCrewXP(new_total_xp)
      })
    // A CLOSED status is terminal: realtime-js removes the channel from its socket
    // and never rejoins it (unlike CHANNEL_ERROR/TIMED_OUT, which phoenix's rejoin
    // timer recovers), and the same channel instance can't be re-subscribed —
    // phoenix's join() throws on a second call. The server sends this close on
    // realtime tenant restarts, auth kicks, and rate-limit enforcement. Recovery
    // is a brand-new channel: evict the dead one from the registry and bump the
    // shared channelEpoch so this effect AND MessageList's listener effect re-run
    // and re-acquire/re-attach against a fresh instance. Exponential backoff caps
    // the loop if the server is mid-restart and keeps closing us.
    const scheduleChannelRebuild = () => {
      if (!isActiveCrewMessageChannel(crewId, ch)) return
      if (rebuildTimerRef.current) return
      const delay = Math.min(1000 * 2 ** rebuildAttemptsRef.current, 30_000)
      rebuildAttemptsRef.current++
      rebuildTimerRef.current = setTimeout(() => {
        rebuildTimerRef.current = null
        if (!isActiveCrewMessageChannel(crewId, ch)) return
        evictCrewMessageChannel(crewId, ch)
        useChatStore.getState().bumpChannelEpoch()
      }, delay)
    }

    // Defer the single subscribe() call to a microtask so it always runs after every
    // same-tick mount effect (MessageList's postgres_changes listeners included) has
    // attached its .on() bindings — regardless of which component's effect ran first.
    // The isActiveCrewMessageChannel guard skips a stale call if this exact channel
    // instance was already torn down before the microtask fired (StrictMode dev
    // double-invoke: mount → cleanup → mount all happen synchronously before this runs).
    queueMicrotask(() => {
      if (!isActiveCrewMessageChannel(crewId, ch)) return
      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          channelReadyRef.current = true
          rebuildAttemptsRef.current = 0
          await ch.track({ username: userProfileRef.current.username, typing: false })
          heartbeat()
          startHeartbeat()
          // SUBSCRIBED fires on the initial join AND on every auto-rejoin after a
          // drop — so this is exactly when to backfill anything that landed while
          // the socket was down. Dedup-safe (see MessageList.resyncMessages).
          useChatStore.getState().requestResync?.()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          // Socket is not deliverable — stop broadcasting into the void (a send
          // while this is false skips the broadcast; peers get it via Postgres
          // Changes once we rejoin, and our own catch-up runs on the next
          // SUBSCRIBED). realtime-js auto-rejoins after CHANNEL_ERROR/TIMED_OUT;
          // CLOSED needs the full rebuild above (deferred to foreground when
          // hidden — a rebuild while backgrounded would just die again).
          channelReadyRef.current = false
          if (config.isDev) console.warn('[realtime] channel status', status, 'for crew', crewId)
          if (status === 'CLOSED') {
            if (document.visibilityState === 'visible') scheduleChannelRebuild()
            else pendingRebuildRef.current = true
          }
        }
      })
    })

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        // A CLOSED status that landed while backgrounded deferred its rebuild to
        // now — run it first so the fresh channel (not the dead one) carries the
        // presence/heartbeat below.
        if (pendingRebuildRef.current) {
          pendingRebuildRef.current = false
          scheduleChannelRebuild()
        }
        // Treat socket as suspect after backgrounding — re-track typing + fire
        // heartbeat. Skip the presence round-trip when the channel is known-dead
        // (track() on a closed channel throws, and it's wasted rate-limit budget).
        if (channelReadyRef.current) {
          ch.track({ username: userProfileRef.current.username, typing: false }).catch(() => {})
        }
        heartbeat()
        startHeartbeat()
        notifyActiveCrew(crewId)
        // Backfill anything that arrived while backgrounded. If the socket stayed
        // up (brief background) no SUBSCRIBED re-fires, so this is the only catch-up
        // trigger for that case; if it dropped, this runs before the rejoin's
        // SUBSCRIBED and that one runs again — both are dedup-safe.
        useChatStore.getState().requestResync?.()
      } else {
        // Stop heartbeating when hidden — let timestamp age naturally; no iOS throttle fights
        stopHeartbeat()
        notifyActiveCrew(null)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Network came back (e.g. tunnel, elevator, wifi↔cellular handoff) without a
    // visibility change — nudge presence and catch up on the missed window.
    function handleOnline() {
      heartbeat()
      startHeartbeat()
      useChatStore.getState().requestResync?.()
    }
    window.addEventListener('online', handleOnline)

    msgChannelRef.current     = ch
    channelReadyRef.current   = false
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
      stopHeartbeat()
      clearInterval(sweepTimer)
      if (rebuildTimerRef.current) { clearTimeout(rebuildTimerRef.current); rebuildTimerRef.current = null }
      pendingRebuildRef.current = false
      releaseCrewMessageChannel(crewId)
      msgChannelRef.current     = null
      channelReadyRef.current   = false
      isTypingRef.current       = false
      // Clear so a stale "X is typing" from this crew never bleeds into the next
      // crew's chat before its own first presence sync arrives.
      useChatStore.getState().setTypingUsernames([])
      notifyActiveCrew(null)
    }
    // channelEpoch is deliberately a dep — a bump evicts the dead channel and
    // forces this effect to rebuild against a fresh one (see scheduleChannelRebuild).
  }, [crewId, userId, channelEpoch]) // eslint-disable-line react-hooks/exhaustive-deps

  // Presence .track() is a network round-trip — only send it on an actual state
  // transition instead of on every keystroke (handleInput calls this on every change).
  // Skipped entirely while the channel isn't joined: track() on a closed channel
  // throws (unhandled rejection noise), and every dropped call is wasted presence
  // rate-limit budget (ClientPresenceRateLimitReached shows up in realtime logs).
  // isTypingRef is left untouched on the skip so the next keystroke after the
  // channel recovers re-sends the edge.
  function broadcastTyping(isTyping: boolean) {
    if (!channelReadyRef.current) return
    if (isTypingRef.current === isTyping) return
    isTypingRef.current = isTyping
    msgChannelRef.current?.track({ username: userProfileRef.current.username, typing: isTyping }).catch(() => {})
  }

  // Every place that clears/replaces `text` outside of handleInput's own onChange
  // (send, edit-save, slash-command execute, Escape-clear, cancel-edit) must call this
  // too — broadcastTyping/the 3s debounce timer only fire from handleInput, so a
  // programmatic setText('') alone leaves "X is typing..." stuck for stale viewers
  // until the old debounce timer happens to fire.
  function clearTypingState() {
    broadcastTyping(false)
    if (typingTimerRef.current) { clearTimeout(typingTimerRef.current); typingTimerRef.current = null }
  }

  const removePendingImage = useCallback((id: string) => {
    setPendingImages((prev) => {
      const img = prev.find((i) => i.id === id)
      if (img?.localUrl.startsWith('blob:')) URL.revokeObjectURL(img.localUrl)
      return prev.filter((i) => i.id !== id)
    })
  }, [])

  const clearPendingImages = useCallback(() => {
    setPendingImages((prev) => {
      prev.forEach((img) => { if (img.localUrl.startsWith('blob:')) URL.revokeObjectURL(img.localUrl) })
      return []
    })
  }, [])

  useEffect(() => {
    return () => {
      if (friendshipToastTimerRef.current) clearTimeout(friendshipToastTimerRef.current)
      if (gemToastTimerRef.current) clearTimeout(gemToastTimerRef.current)
      // Revoke any remaining blob URLs on unmount
      pendingImagesRef.current.forEach((img) => {
        if (img.localUrl.startsWith('blob:')) URL.revokeObjectURL(img.localUrl)
      })
    }
  }, [])

  const showGemToast = () => {
    if (gemToastTimerRef.current) clearTimeout(gemToastTimerRef.current)
    setGemToastVisible(true)
    gemToastTimerRef.current = setTimeout(() => setGemToastVisible(false), 3000)
  }

  // Broadcasts the authoritative server row (already contains every column via the
  // insert_message RPC's RETURNING *) — avoids hand-picking fields that can drift
  // from what was actually written.
  const broadcastNewMessage = useCallback((message: Message) => {
    if (!channelReadyRef.current) return
    msgChannelRef.current?.send({ type: 'broadcast', event: 'new_message', payload: message })
  }, [])

  // Shared award-xp settlement used by every send path (text/image/gif): applies the
  // XP/coin response and broadcasts xp_update to peers.
  const settleXp = useCallback((msgId: string, messageType: string, content: string, mentionedUserIds: string[], replyToId?: string | null) => {
    postEdgeFn('award-xp', { message_id: msgId, crew_id: crewId, user_id: userId, username: userProfile.username, message_type: messageType, content, mentioned_user_ids: mentionedUserIds, reply_to_id: replyToId ?? null })
      .then((r) => { if (!r) throw new Error('no session'); return r.json() })
      .then((data: { xp_earned?: number; new_total_xp?: number; coins_earned?: number }) => {
        if (typeof data.xp_earned === 'number') updateMessage(msgId, { xp_awarded: data.xp_earned })
        if (typeof data.new_total_xp === 'number') {
          setCrewXP(data.new_total_xp)
          if (channelReadyRef.current) msgChannelRef.current?.send({
            type: 'broadcast', event: 'xp_update',
            payload: { xp_earned: data.xp_earned ?? 0, new_total_xp: data.new_total_xp, sender_id: userId },
          })
        }
        if (typeof data.coins_earned === 'number' && data.coins_earned > 0) addUserCoins(data.coins_earned)
      })
      .catch(() => {})
  }, [crewId, userId, userProfile, updateMessage, setCrewXP, addUserCoins]) // eslint-disable-line react-hooks/exhaustive-deps

  // Shared "message successfully persisted" side effects — same for a fresh send and
  // a retried one, so text/image/gif/retry all get identical broadcast/XP/friendship-xp
  // behavior instead of four subtly-diverging inline copies of this logic.
  const handleSendSuccess = useCallback((raw: Message, job: OutboxJob) => {
    setHomeLastMessage(crewId, { content: job.content || raw.content, created_at: raw.created_at, sender: userProfile.username })

    if (channelReadyRef.current) {
      broadcastNewMessage(raw)
      // Piggyback heartbeat on send — proves liveness, keeps DB timestamp fresh between intervals.
      const ts = Date.now()
      setLastActive(userId, ts)
      msgChannelRef.current?.send({ type: 'broadcast', event: 'active', payload: { user_id: userId, ts } })
      if (ts - lastActiveWriteRef.current > ACTIVE_WRITE_THROTTLE_MS) {
        lastActiveWriteRef.current = ts
        createClient().rpc('update_active').then(() => {}, (err) => {
          if (config.isDev) console.warn('[presence] update_active failed', err)
        })
      }
    }

    tryClaimDailyGem(createClient(), showGemToast)
    settleXp(raw.id, job.messageType, job.content, job.mentionedUserIds, job.replyToId)

    if (fxpEnabled && job.messageType === 'text') {
      // Friendship XP — shared helper: fade-in 200ms, hold 2000ms, then exit animation (400ms) runs
      const showFriendshipToast = (totalXP: number, xpAwarded: number, partnerName: string, dailyCount: number) => {
        if (friendshipToastTimerRef.current) clearTimeout(friendshipToastTimerRef.current)
        setFriendshipToast({ totalXP, xpAwarded, partnerName, dailyCount })
        friendshipToastTimerRef.current = setTimeout(() => setFriendshipToast(null), 2200)
      }

      // Local midnight as UTC ISO string — used by the server to compute the daily limit window
      const now = new Date()
      const localMidnightUTC = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString()

      // Friendship XP — DM send
      if (isDM && dmPartnerId) {
        const dmPartnerName = liveCrewName
        postEdgeFn('award-friendship-xp', { user_a_id: userId, user_b_id: dmPartnerId, source: 'dm', local_midnight_utc: localMidnightUTC })
          .then((r) => { if (!r) throw new Error('no session'); return r.json() })
          .then((data: { total_xp?: number; xp_awarded?: number; skipped?: boolean; daily_count?: number }) => {
            if (typeof data.total_xp === 'number' && (data.xp_awarded ?? 0) > 0) {
              showFriendshipToast(data.total_xp, data.xp_awarded!, dmPartnerName, data.daily_count ?? 1)
            }
          })
          .catch(() => {})
      }

      // Friendship XP — @mention in group chat (toast for first awarded pair)
      if (!isDM && job.mentionedUserIds.length > 0) {
        let toastShown = false
        job.mentionedUserIds.forEach((friendId) => {
          const partnerName = profilesRef.current[friendId]?.username ?? 'Friend'
          postEdgeFn('award-friendship-xp', { user_a_id: userId, user_b_id: friendId, source: 'mention', local_midnight_utc: localMidnightUTC })
            .then((r) => { if (!r) throw new Error('no session'); return r.json() })
            .then((data: { total_xp?: number; xp_awarded?: number; skipped?: boolean; daily_count?: number }) => {
              if (!toastShown && typeof data.total_xp === 'number' && (data.xp_awarded ?? 0) > 0) {
                toastShown = true
                showFriendshipToast(data.total_xp, data.xp_awarded!, partnerName, data.daily_count ?? 1)
              }
            })
            .catch(() => {})
        })
      }
    }
  }, [crewId, userId, userProfile, fxpEnabled, isDM, dmPartnerId, liveCrewName, broadcastNewMessage, setLastActive, settleXp]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleChatImagesPick(files: File[]) {
    if (files.length === 0) return

    const networkQuality = getNetworkQuality()
    const qualityScale   = networkQuality === 'slow' ? 0.7 : networkQuality === 'medium' ? 0.85 : 1
    const quality        = IMAGE_CONFIG.CHAT_IMAGE_QUALITY * qualityScale
    const supabase       = createClient()

    // Create entries with blob URLs immediately — instant preview before upload
    const entries: PendingImage[] = files.map((file, i) => ({
      id:        `img_${Date.now()}_${i}`,
      localUrl:  URL.createObjectURL(file),
      publicUrl: null,
      lqip:      null,
      uploading: true,
      error:     null,
    }))

    setPendingImages((prev) => [...prev, ...entries].slice(0, 4))

    // Upload all in parallel
    await Promise.all(entries.map(async (entry, i) => {
      const file = files[i]
      const patch = (p: Partial<PendingImage>) =>
        setPendingImages((prev) => prev.map((img) => img.id === entry.id ? { ...img, ...p } : img))

      try {
        const validation = validateImageUpload(file)
        if (!validation.ok) { patch({ uploading: false, error: validation.error }); return }

        const [lqip, compressed] = await Promise.all([
          generateLQIP(file),
          compressImage(file, { maxWidthOrHeight: IMAGE_CONFIG.CHAT_IMAGE_MAX_WIDTH_PX, quality }),
        ])
        patch({ lqip })

        const ext  = file.type === 'image/gif' ? 'gif' : compressed.type.includes('jpeg') ? 'jpg' : 'webp'
        const path = `${crewId}/${userId}/${Date.now()}_${i}.${ext}`
        const { error: uploadError } = await supabase.storage.from('chat-images').upload(path, compressed, {
          contentType:  file.type === 'image/gif' ? 'image/gif' : compressed.type,
          cacheControl: '31536000',
        })
        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(path)
        patch({ publicUrl, uploading: false })
      } catch (err) {
        patch({ uploading: false, error: err instanceof Error ? err.message : 'Upload failed.' })
      }
    }))
  }

  const sendImages = useCallback(() => {
    const readyImages = pendingImagesRef.current.filter((img) => !!img.publicUrl)
    if (readyImages.length === 0) return

    const snapshots   = readyImages.map((img) => ({ publicUrl: img.publicUrl!, lqip: img.lqip }))
    const textContent = sanitizeMessage(textRef.current)

    setSendError(null)
    clearPendingImages()

    // Clear text field when images and text are sent together
    if (textContent) {
      setText('')
      textRef.current = ''
      setReplyTo(null)
      clearTypingState()
      const wasMultiline = isMultilineRef.current
      setIsMultiline(false)
      isMultilineRef.current = false
      if (wasMultiline) pendingCaretPosRef.current = 0
    }

    haptic(10)

    const urls  = snapshots.map((s) => s.publicUrl)
    const lqips = snapshots.map((s) => s.lqip ?? null)
    // Pack all URLs + LQIPs as JSON so the server stores one message regardless of count.
    // MessageBubble detects this by JSON.parse(image_url) → array.
    const imageUrlJson  = JSON.stringify(urls)
    const imageBlurJson = JSON.stringify(lqips)
    // content = typed text (shown below images); fall back to first URL for home preview compat
    const msgContent = textContent || urls[0]

    // Client-generated id doubles as the outbox job key — random suffix (not just
    // Date.now()) avoids a collision if multiple sends fire within the same millisecond,
    // which concurrent (non-blocking) sends make possible.
    const tempId = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const optimisticMsg: MessageWithProfile = {
      id:              tempId,
      crew_id:         crewId,
      user_id:         userId,
      content:         msgContent,
      message_type:    'image',
      element_type:    null,
      xp_awarded:      1,
      reactions:       {},
      created_at:      new Date().toISOString(),
      image_url:       imageUrlJson,
      image_blur_hash: imageBlurJson,
      profile:         userProfile,
      tempId,
      sendStatus:      'sending',
    }
    addMessage(optimisticMsg)
    if (!isDM) bumpCrewXP()

    const job: OutboxJob = {
      tempId, crewId, userId, username: userProfile.username, content: msgContent,
      messageType: 'image', imageUrl: imageUrlJson, imageBlurHash: imageBlurJson,
      mentionedUserIds: [], createdAt: optimisticMsg.created_at,
    }
    addToOutbox(job).catch(() => {})
    void sendWithRetry(job, (raw) => handleSendSuccess(raw, job))

    focusField()
  }, [crewId, userId, userProfile, isDM, addMessage, bumpCrewXP, clearPendingImages, handleSendSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  const sendGif = useCallback((gifUrl: string) => {
    const tempId = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    setSendError(null)
    haptic(10)

    const optimisticMsg: MessageWithProfile = {
      id:              tempId,
      crew_id:         crewId,
      user_id:         userId,
      content:         gifUrl,
      message_type:    'image',
      element_type:    'nature',
      xp_awarded:      1,
      reactions:       {},
      created_at:      new Date().toISOString(),
      image_url:       gifUrl,
      image_blur_hash: undefined,
      profile:         userProfile,
      tempId,
      sendStatus:      'sending',
    }
    addMessage(optimisticMsg)
    if (!isDM) bumpCrewXP()

    const job: OutboxJob = {
      tempId, crewId, userId, username: userProfile.username, content: gifUrl,
      messageType: 'image', imageUrl: gifUrl, imageBlurHash: null,
      mentionedUserIds: [], createdAt: optimisticMsg.created_at,
    }
    addToOutbox(job).catch(() => {})
    void sendWithRetry(job, (raw) => handleSendSuccess(raw, job))

    focusField()
  }, [crewId, userId, userProfile, isDM, addMessage, bumpCrewXP, handleSendSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback(() => {
    const content = sanitizeMessage(text)
    if (!content) return

    // Detect mentioned user IDs from @username patterns in the message
    const currentProfiles = profilesRef.current
    const usernameToId    = new Map(Object.values(currentProfiles).map((m) => [m.username.toLowerCase(), m.id]))
    const mentionedSet    = new Set<string>()
    const mentionRx       = /@(\w+)/g
    let mx: RegExpExecArray | null
    while ((mx = mentionRx.exec(content)) !== null) {
      const uid = usernameToId.get(mx[1].toLowerCase())
      if (uid && uid !== userId) mentionedSet.add(uid)
    }
    const mentionedUserIds = [...mentionedSet]

    const now = Date.now()
    if (now >= rateRef.current.resetAt) rateRef.current = { count: 0, resetAt: now + RATE_LIMIT_WINDOW }
    rateRef.current.count++
    if (rateRef.current.count > RATE_LIMIT_MAX) { setSendError('Slow down, warrior.'); return }

    if (!localStorage.getItem('nexus_first_message')) localStorage.setItem('nexus_first_message', String(Date.now()))

    // Capture reply context before clearing state
    const currentReply = useChatStore.getState().replyTo

    setSendError(null)
    setText('')
    textRef.current = ''
    setReplyTo(null)
    clearTypingState()
    const wasMultiline = isMultilineRef.current
    setIsMultiline(false)
    isMultilineRef.current = false
    if (wasMultiline) pendingCaretPosRef.current = 0
    haptic(10)
    // Refocus immediately (not after the network round trip) — the compose box is
    // already clear, so the user can keep typing the next message right away instead
    // of waiting for this one to be confirmed by the server.
    inputRef.current?.focus()

    const replyToId     = currentReply?.id ?? null
    const replyPreview  = currentReply ? currentReply.content.slice(0, 100) : null
    const replyUsername = currentReply?.profile?.username ?? null

    // Optimistic: add the message instantly so it appears before the RPC round-trip.
    // Client-generated id doubles as the outbox job key — random suffix avoids a
    // collision if multiple sends fire within the same millisecond, which concurrent
    // (non-blocking) sends make possible.
    const tempId = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const optimisticMsg: MessageWithProfile = {
      id: tempId, crew_id: crewId, user_id: userId, content,
      message_type: 'text', element_type: null,
      xp_awarded: 1, reactions: {}, created_at: new Date().toISOString(),
      profile: userProfile,
      reply_to_id: replyToId, reply_preview: replyPreview, reply_username: replyUsername,
      tempId, sendStatus: 'sending',
    }
    addMessage(optimisticMsg)
    if (!isDM) bumpCrewXP()

    const job: OutboxJob = {
      tempId, crewId, userId, username: userProfile.username, content,
      messageType: 'text', replyToId, replyPreview, replyUsername,
      mentionedUserIds, createdAt: optimisticMsg.created_at,
    }
    addToOutbox(job).catch(() => {})
    // Fire-and-forget — sendWithRetry owns retries/backoff and never blocks the
    // compose box, so the user is free to send more messages immediately, even on
    // a connection slow enough that this particular send takes several seconds.
    void sendWithRetry(job, (raw) => handleSendSuccess(raw, job))
  }, [text, crewId, userId, userProfile, isDM, addMessage, bumpCrewXP, setReplyTo, handleSendSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  // Retries a previously-failed send. Reads the original job back from the outbox by
  // tempId (persists across reloads, so this also works for a failed send resumed in
  // a later session) and resumes it through the exact same success path as a fresh send.
  const retrySend = useCallback((tempId: string) => {
    readOutbox(crewId).then((jobs) => {
      const job = jobs.find((j) => j.tempId === tempId)
      if (!job) return
      void sendWithRetry(job, (raw) => handleSendSuccess(raw, job))
    })
  }, [crewId, handleSendSuccess])

  // Register this crew's retry dispatcher so MessageBubble's "failed — tap to retry"
  // affordance can reach it despite living in a sibling component (MessageList).
  useEffect(() => {
    useChatStore.getState().setRequestRetrySend(retrySend)
    return () => {
      if (useChatStore.getState().requestRetrySend === retrySend) {
        useChatStore.getState().setRequestRetrySend(null)
      }
    }
  }, [retrySend])

  // Resume any sends still pending from a previous session (app killed or tab closed
  // mid-send) — reconstructs the optimistic bubble if it isn't already in the store
  // (a fresh page load never persisted it), then re-attempts exactly like a manual retry.
  useEffect(() => {
    let cancelled = false
    readOutbox(crewId).then((jobs) => {
      if (cancelled) return
      for (const job of jobs) {
        const exists = useChatStore.getState().messages.some((m) => m.id === job.tempId)
        if (!exists) {
          const optimisticMsg: MessageWithProfile = {
            id: job.tempId, crew_id: job.crewId, user_id: job.userId, content: job.content,
            message_type: job.messageType, element_type: null,
            xp_awarded: 1, reactions: {}, created_at: job.createdAt,
            profile: userProfile,
            reply_to_id: job.replyToId ?? null, reply_preview: job.replyPreview ?? null, reply_username: job.replyUsername ?? null,
            image_url: job.imageUrl ?? undefined, image_blur_hash: job.imageBlurHash ?? undefined,
            tempId: job.tempId, sendStatus: 'sending',
          }
          addMessage(optimisticMsg)
        }
        void sendWithRetry(job, (raw) => handleSendSuccess(raw, job))
      }
    })
    return () => { cancelled = true }
  }, [crewId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleEditSend = useCallback(async () => {
    const currentEdit = useChatStore.getState().editTo
    if (!currentEdit) return
    const newContent = sanitizeMessage(text)

    // Close edit mode immediately regardless of outcome
    setEditTo(null)
    setText('')
    textRef.current = ''
    clearTypingState()
    const wasMultiline = isMultilineRef.current
    setIsMultiline(false)
    isMultilineRef.current = false
    if (wasMultiline) pendingCaretPosRef.current = 0

    if (!newContent || newContent === currentEdit.content) return

    const prevContent = currentEdit.content
    const msgId       = currentEdit.id

    // Optimistic update
    updateMessage(msgId, { content: newContent })

    const supabase = createClient()
    const { error } = await supabase
      .from('messages')
      .update({ content: newContent })
      .eq('id', msgId)
      .eq('user_id', userId)

    if (error) {
      updateMessage(msgId, { content: prevContent })
      setSendError('Failed to edit message.')
    }
  }, [text, userId, updateMessage]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    // @mention picker navigation
    if (mentionQuery !== null && mentionMatches.length > 0) {
      if (e.key === 'Escape')    { e.preventDefault(); setMentionQuery(null); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex((i) => (i + 1) % mentionMatches.length); return }
      if (e.key === 'Enter')     { e.preventDefault(); completeMention(mentionMatches[mentionIndex].username); return }
    }

    if (e.key === 'Escape' && text.startsWith('/') && !text.includes(' ')) {
      e.preventDefault()
      setText('')
      textRef.current = ''
      clearTypingState()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (editTo) { void handleEditSend(); return }
      const isCmd = text.startsWith('/') && !text.includes(' ')
      if (isCmd) {
        const filter   = text.slice(1).toLowerCase()
        const matches  = SLASH_COMMANDS.filter((c) => c.name.startsWith(filter) && (c.name !== 'event' || eventsEnabled))
        if (matches.length === 1) { executeCommand(matches[0].name); return }
      }
      send()
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLTextAreaElement>) {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement
    const val    = target.value.slice(0, MAX_MESSAGE_LENGTH)
    setText(val)
    textRef.current = val

    const caretPos = target.selectionStart ?? val.length
    recheckOverflow(val, caretPos)

    if (val.trim()) {
      broadcastTyping(true)
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      typingTimerRef.current = setTimeout(() => broadcastTyping(false), 3000)
    } else { clearTypingState() }
    // Detect @mention query at cursor position
    const q = getMentionQuery(val, caretPos)
    setMentionQuery(q)
    if (q !== null) setMentionIndex(0)
  }

  function handleBlur() {
    clearTypingState()
    setIsFocused(false)
  }

  async function executeCommand(name: SlashCommandName) {
    setText('')
    textRef.current = ''
    clearTypingState()
    const wasMultiline = isMultilineRef.current
    setIsMultiline(false)
    isMultilineRef.current = false
    if (wasMultiline) pendingCaretPosRef.current = 0
    else focusField()

    if (name === 'event') {
      if (eventsEnabled) setShowEventSheet(true)
      return
    }

    if (name === 'birthdays') {
      setSendError(null)
      try {
        const result = await birthdaysCommandAction(crewId)
        if (result.error) {
          setSendError(result.error)
        } else if (result.message) {
          const msgWithProfile = { ...result.message, profile: userProfile }
          addMessage(msgWithProfile)
          broadcastNewMessage(result.message)
        }
      } catch {
        // The server action call itself can throw (dropped request, or a stale
        // PWA-cached build calling an action id the deployment no longer
        // recognizes) — same class of failure fixed in DefinitionHomePage's
        // handleSave; surface it instead of failing silently.
        setSendError('Failed to send — try again')
      }
    }
  }

  function handlePollCreated(message: MessageWithProfile) {
    setShowPollCreator(false)
    addMessage(message)
    broadcastNewMessage(message)
  }

  async function handleKick() {
    if (!removeTarget || removing) return
    setRemoving(true)
    setRemoveError(null)
    const result = await kickMemberAction(crewId, removeTarget.id)
    setRemoving(false)
    if (result.error) { setRemoveError(result.error); return }
    setKickedIds(prev => new Set([...prev, removeTarget.id]))
    setRemoveTarget(null)
  }

  // Leaving as the last member permanently deletes the crew (CASCADE wipes its
  // messages and vibes) — gate that path behind an explicit warning instead of
  // letting it fire silently from a single tap.
  function handleLeaveSquadTapped() {
    if (memberCount <= 1) { setShowLastMemberWarning(true); return }
    void handleLeaveSquad()
  }

  async function handleLeaveSquad() {
    setLeavingSquad(true)
    setSendError(null)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLeavingSquad(false); return }
    // Navigate only on success — a failed leave (network/RLS) used to still push
    // to /home, leaving the user believing they'd left a crew they hadn't.
    const result = await leaveCrewAction(crewId, session.access_token)
    if (result?.error) {
      setLeavingSquad(false)
      setShowLastMemberWarning(false)
      setSendError(result.error)
      return
    }
    setIsExpanded(false)
    setShowLastMemberWarning(false)
    router.push('/home')
  }

  // ─── @mention helpers ───────────────────────────────────────────────────────

  function getMentionQuery(val: string, cursorPos: number): string | null {
    const before = val.slice(0, cursorPos)
    const atIdx  = before.lastIndexOf('@')
    if (atIdx === -1) return null
    const query = before.slice(atIdx + 1)
    if (/[\s\n]/.test(query)) return null
    return query
  }

  function completeMention(username: string) {
    const field = getActiveField()
    if (!field) return
    const pos     = field.selectionStart ?? text.length
    const before  = text.slice(0, pos)
    const after   = text.slice(pos)
    const atIdx   = before.lastIndexOf('@')
    if (atIdx === -1) return
    const newText = before.slice(0, atIdx) + '@' + username + ' ' + after
    setText(newText)
    textRef.current = newText
    setMentionQuery(null)
    setMentionIndex(0)
    requestAnimationFrame(() => {
      const f = getActiveField()
      if (f) {
        const cur = atIdx + username.length + 2
        f.focus()
        f.setSelectionRange(cur, cur)
      }
    })
  }

  function renderHighlightedInput(val: string): React.ReactNode {
    const memberSet = memberUsernameSet
    const regex     = /@(\w+)/g
    const parts: React.ReactNode[] = []
    let lastIdx = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(val)) !== null) {
      if (memberSet.has(match[1].toLowerCase())) {
        if (match.index > lastIdx) parts.push(val.slice(lastIdx, match.index))
        parts.push(
          <mark key={match.index} style={{ background: 'transparent', color: 'var(--color-purple)' }}>
            @{match[1]}
          </mark>
        )
        lastIdx = match.index + match[0].length
      }
    }
    if (lastIdx < val.length) parts.push(val.slice(lastIdx))
    parts.push('​')
    return parts
  }

  const mentionMatches = mentionQuery !== null
    ? members.filter((m) => m.id !== userId && m.username.toLowerCase().startsWith(mentionQuery.toLowerCase()))
    : []

  const totalMessages = [...memberMsgCounts.values()].reduce((s, n) => s + n, 0)

  // Rendering-only stand-ins for the input's default idle look during a room-swipe drag
  // (see isRoomSwiping's own doc comment above) — the real text/pendingImages/isFocused
  // state underneath is untouched.
  const displayText          = isRoomSwiping ? ''                     : text
  const displayPendingImages = isRoomSwiping ? EMPTY_PENDING_IMAGES   : pendingImages
  const displayFocused       = isRoomSwiping ? false                  : isFocused

  return (
    <div ref={chatInputBoxRef} className="bg-black flex flex-col flex-shrink-0 relative z-[65]">
      {/* ── Typing presence (Figma 507:2518) — own top section, no gap before the
          bordered squad+input box below; the box's border-t is what divides them.
          Isolated into its own component reading straight from chatStore so a
          presence sync doesn't re-render all of ChatInput — see ChatTypingIndicator. ── */}
      <ChatTypingIndicator />

      <div
        className="border-t border-border flex flex-col"
        style={{
          paddingTop:    'var(--space-5)',
          paddingLeft:   'var(--space-5)',
          paddingRight:  'var(--space-5)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 32px)',
          gap:           'var(--space-5)',
        }}
      >
        {/* ── Friendship XP toast (DM send or group @mention) — dev-gated: nexus_friendship_xp ── */}
        {fxpEnabled && (
          <FriendshipXPToast
            visible={!!friendshipToast}
            xpAwarded={friendshipToast?.xpAwarded ?? 0}
            totalXP={friendshipToast?.totalXP ?? 0}
            partnerName={friendshipToast?.partnerName ?? ''}
            dailyCount={friendshipToast?.dailyCount ?? 1}
          />
        )}

        {/* ── Daily gem toast ── */}
        <GemToast visible={gemToastVisible} stacked={!!friendshipToast} />


        {/* ── DM: "Chatting with" label ── */}
        {isDM && (
          <p className="font-silkscreen text-[12px] leading-none">
            <span className="text-tertiary">Chatting with </span>
            <span className="text-purple">{liveCrewName.toLowerCase()}</span>
          </p>
        )}

        {/* ── ChatSquadDetailBar — tap or swipe up to expand ── */}
        {!isDM && (
          <ChatSquadDetailBar
            crewImageUrl={barOverride ? barOverride.imageUrl : crewImageUrl}
            crewName={barOverride ? barOverride.name : liveCrewName}
            crewLevel={barOverride ? barOverride.level : crewLevel}
            memberCount={barOverride ? barOverride.memberCount : memberCount}
            members={barOverride ? EMPTY_MEMBERS : members}
            onlineUserIds={barOverride ? EMPTY_ONLINE_IDS : onlineUserIds}
            onExpand={() => setIsExpanded(true)}
            onPanStart={handleTopPanStart}
            onPan={handleTopPan}
            onPanEnd={handleTopPanEnd}
          />
        )}

        {/* ── Status indicators + input — fade out when expanded ── */}
        <motion.div
          animate={{ opacity: isExpanded ? 0 : 1, y: isExpanded ? 16 : 0 }}
          transition={{ duration: 0.18 }}
          style={{ pointerEvents: isExpanded ? 'none' : 'auto' }}
        >
          {sendError && (
            <button className="w-full font-pixel text-[7px] text-[#ff4444] mb-2 text-left" onClick={send}>
              ↺ {sendError}
            </button>
          )}

          {/* ── Edit mode bar — hidden mid room-swipe, see isRoomSwiping ── */}
          {editTo && !isRoomSwiping && (
            <div
              className="flex items-center w-full"
              style={{ background: 'var(--color-surface)', padding: 16, gap: 8, marginBottom: 8 }}
            >
              <MagicEdit style={{ width: 16, height: 16, color: 'var(--color-secondary)', flexShrink: 0 }} aria-hidden="true" />
              <p
                className="flex-1 min-w-0 font-body font-medium leading-none tracking-[0.1px] whitespace-nowrap overflow-hidden text-ellipsis"
                style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14', color: 'var(--color-primary)' }}
              >
                Editing message
              </p>
              <button
                onClick={() => { setEditTo(null); setText(''); textRef.current = ''; clearTypingState() }}
                className="flex-shrink-0 flex items-center justify-center active:opacity-60"
                style={{ width: 32, height: 32, marginTop: -8, marginRight: -8, marginBottom: -8 }}
                aria-label="Cancel edit"
              >
                <Close style={{ width: 16, height: 16, color: 'var(--color-secondary)' }} aria-hidden="true" />
              </button>
            </div>
          )}

          {/* ── Reply preview bar — hidden mid room-swipe, see isRoomSwiping ── */}
          {replyTo && !isRoomSwiping && (
            <div
              className="flex items-center w-full"
              style={{ background: 'var(--color-surface)', padding: 16, gap: 8, marginBottom: 8 }}
            >
              <CornerUpLeft style={{ width: 16, height: 16, color: 'var(--color-muted)', flexShrink: 0 }} aria-hidden="true" />

              {/* msg wrapper — flex-[1_0_0], no height clamp so text is never clipped */}
              <div style={{ flex: '1 0 0', minWidth: 1, display: 'flex', alignItems: 'center' }}>
                <p
                  className="font-body font-medium leading-[0] tracking-[0.1px] whitespace-nowrap overflow-hidden text-ellipsis w-full"
                  style={{ fontSize: 12, minWidth: 1, fontVariationSettings: '"opsz" 14' }}
                >
                  <span className="leading-none" style={{ color: 'var(--color-purple)' }}>@{replyTo.profile?.username ?? replyTo.reply_username ?? '???'} </span>
                  {(() => {
                    const preview = replyTo.content?.trim() || (replyTo.image_url ? '(photo)' : null)
                    return preview
                      ? <span className="leading-none" style={{ color: 'var(--color-tertiary)' }}>{preview}</span>
                      : null
                  })()}
                </p>
              </div>

              <button
                onClick={() => setReplyTo(null)}
                className="flex-shrink-0 flex items-center justify-center active:opacity-60"
                style={{ width: 32, height: 32, marginTop: -8, marginRight: -8, marginBottom: -8 }}
                aria-label="Cancel reply"
              >
                <Close style={{ width: 16, height: 16, color: 'var(--color-secondary)' }} aria-hidden="true" />
              </button>
            </div>
          )}

          {/* ── Input wrapper: pickers float above via absolute positioning ── */}
          <div className="relative">
            {/* @mention picker — absolute, grows upward over group details */}
            <AnimatePresence>
              {!isRoomSwiping && mentionQuery !== null && mentionMatches.length > 0 && (
                <motion.div
                  key="mention-menu"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute bottom-full left-0 right-0 border border-border bg-black"
                >
                  <div className="nexus-scroll" style={{ maxHeight: 220, overflowY: 'scroll' }}>
                  {mentionMatches.map((m, i) => {
                    const url     = m.avatar_url as string | null | undefined
                    const isLast  = i === mentionMatches.length - 1
                    return (
                      <button
                        key={m.id}
                        onMouseDown={(e) => { e.preventDefault(); completeMention(m.username) }}
                        className={`w-full flex items-center overflow-hidden p-2 text-left ${!isLast ? 'border-b border-border' : ''} ${i === mentionIndex ? 'bg-surface' : 'active:bg-surface'}`}
                        style={{ gap: 'var(--space-3)' }}
                      >
                        <UserAvatar avatarUrl={url} username={m.username} size={24} />
                        <div className="flex flex-col flex-1 min-w-0 items-start">
                          <span className="font-silkscreen text-[length:var(--text-mini)] text-purple leading-normal w-full">@mention</span>
                          <span className="font-body font-normal text-[length:var(--text-xs)] text-primary leading-normal w-full" style={{ fontVariationSettings: '"opsz" 14' }}>{m.username}</span>
                        </div>
                      </button>
                    )
                  })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Slash command menu — absolute, grows upward over group details ── */}
            {(() => {
              const isCmd = !isRoomSwiping && text.startsWith('/') && !text.includes(' ')
              const filter = isCmd ? text.slice(1).toLowerCase() : ''
              const matches = isCmd ? SLASH_COMMANDS.filter((c) => c.name.startsWith(filter) && (c.name !== 'event' || eventsEnabled)) : []
              if (!isCmd || matches.length === 0) return null
              return (
                <AnimatePresence>
                  <motion.div
                    key="cmd-menu"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.12 }}
                    className="absolute bottom-full left-0 right-0 border border-border bg-black"
                  >
                    <div className="nexus-scroll" style={{ maxHeight: 220, overflowY: 'scroll' }}>
                    {matches.map((cmd, i) => {
                      const isLast = i === matches.length - 1
                      return (
                        <button
                          key={cmd.name}
                          onMouseDown={(e) => { e.preventDefault(); executeCommand(cmd.name) }}
                          className={`w-full flex flex-col items-start overflow-hidden p-2 text-left active:bg-surface ${!isLast ? 'border-b border-border' : ''}`}
                        >
                          <span className="font-silkscreen text-[length:var(--text-mini)] text-purple leading-normal w-full">/{cmd.name}</span>
                          <span className="font-body font-normal text-[length:var(--text-xs)] text-tertiary leading-normal w-full" style={{ fontVariationSettings: '"opsz" 14' }}>{cmd.description}</span>
                        </button>
                      )
                    })}
                    </div>
                  </motion.div>
                </AnimatePresence>
              )
            })()}

            {/* Input container — flex-col when images are staged; outline brightens on focus */}
            <div
              className="w-full flex flex-col"
                style={{
                  outline:       '1px solid',
                  outlineColor:  displayFocused ? 'var(--color-border-hover)' : 'var(--color-border)',
                  outlineOffset: '-1px',
                  transition:    'outline-color 0.15s ease',
                  paddingLeft:   16,
                  paddingRight:  16,
                  paddingTop:    displayPendingImages.length > 0 ? 16 : 0,
                  paddingBottom: displayPendingImages.length > 0 ? 16 : 0,
                  gap:           displayPendingImages.length > 0 ? 16 : 0,
                  minHeight:     48,
                }}
              >
                {/* ── Image tray (inside border, animates in/out) ── */}
                <AnimatePresence>
                  {displayPendingImages.length > 0 && (
                    <motion.div
                      key="image-tray"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      style={{ overflow: 'hidden' }}
                    >
                      {/* 80×80 image slots — gap 8px, overflow clips 4th at narrow widths */}
                      <div className="flex items-start" style={{ gap: 8, overflow: 'hidden' }}>
                        {displayPendingImages.map((img) => (
                          <div
                            key={img.id}
                            className="relative flex-shrink-0"
                            style={{ width: 80, height: 80, background: 'var(--color-surface)' }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={img.localUrl}
                              alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            />
                            {img.uploading && (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                <span className="font-pixel text-[6px] text-white leading-none">···</span>
                              </div>
                            )}
                            {img.error && (
                              <div className="absolute inset-0 bg-[#ef4444]/70 flex items-center justify-center">
                                <span className="font-pixel text-[5px] text-white leading-none text-center px-1">ERR</span>
                              </div>
                            )}
                            {/* Close button — 16×16 white circle, 4px inset from top-right */}
                            <button
                              onClick={() => removePendingImage(img.id)}
                              className="absolute flex items-center justify-center active:opacity-70"
                              style={{ top: 4, right: 4, width: 16, height: 16, background: 'var(--color-primary)', borderRadius: '50%' }}
                              aria-label="Remove image"
                            >
                              <Close style={{ width: 10, height: 10, color: '#000' }} aria-hidden="true" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── Text input + send button row ── */}
                <div className="flex items-center" style={{ gap: 16, minHeight: displayPendingImages.length > 0 ? 18 : 48 }}>
                  {/* Plus button — slides left and fades out on focus */}
                  <motion.div
                    className="flex-shrink-0 overflow-hidden flex items-center justify-center"
                    animate={{
                      width:       displayFocused ? 0 : 16,
                      opacity:     displayFocused ? 0 : 1,
                      marginRight: displayFocused ? -16 : 0,
                    }}
                    transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                    style={{ pointerEvents: displayFocused ? 'none' : 'auto' }}
                  >
                    <button
                      onClick={() => setShowMediaPicker(true)}
                      disabled={displayPendingImages.length >= 4}
                      className="flex-shrink-0 flex items-center justify-center text-muted active:text-purple disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{ width: 16, height: 16 }}
                      aria-label="Add media"
                    >
                      <Plus style={{ width: 16, height: 16 }} aria-hidden="true" />
                    </button>
                  </motion.div>
                  <div ref={innerContainerRef} className="relative flex-1 min-w-0 overflow-hidden">
                    {/* Hidden mirror span — measures text pixel width for overflow detection */}
                    <span
                      ref={mirrorRef}
                      aria-hidden="true"
                      className="font-body"
                      style={{
                        position: 'fixed',
                        top: -9999,
                        left: -9999,
                        visibility: 'hidden',
                        pointerEvents: 'none',
                        whiteSpace: 'pre',
                        fontSize: 14,
                        lineHeight: 'normal',
                        fontVariationSettings: '"opsz" 14',
                      }}
                    />
                    {/* Overlay renders @mention highlights behind the transparent input/textarea */}
                    <div
                      ref={overlayRef}
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 font-body text-[14px] leading-normal overflow-hidden"
                      style={{ paddingTop: 12, paddingBottom: 12, fontVariationSettings: '"opsz" 14', whiteSpace: isMultiline ? 'pre-wrap' : 'nowrap', wordBreak: isMultiline ? 'break-word' : 'normal', color: 'var(--color-primary)' }}
                    >
                      {renderHighlightedInput(displayText)}
                    </div>
                    {isMultiline ? (
                      <textarea
                        ref={textareaRef}
                        value={displayText}
                        onChange={(e) => handleInput(e)}
                        onKeyDown={(e) => handleKeyDown(e)}
                        onBlur={handleBlur}
                        placeholder={isDM ? 'Send a message...' : 'Message the squad...'}
                        rows={1}
                        onFocus={() => setIsFocused(true)}
                        className="relative w-full bg-transparent font-body text-[14px] placeholder:text-muted resize-none focus:outline-none leading-normal"
                        style={{ paddingTop: 12, paddingBottom: 12, fontVariationSettings: '"opsz" 14', color: 'transparent', caretColor: 'var(--color-primary)', overflowY: 'auto', overflowX: 'hidden' }}
                      />
                    ) : (
                      <input
                        ref={inputRef}
                        type="text"
                        value={displayText}
                        onChange={(e) => handleInput(e)}
                        onKeyDown={(e) => handleKeyDown(e)}
                        onBlur={handleBlur}
                        placeholder={isDM ? 'Send a message...' : 'Message the squad...'}
                        onFocus={() => setIsFocused(true)}
                        className="relative w-full bg-transparent font-body text-[14px] placeholder:text-muted focus:outline-none leading-normal"
                        style={{ paddingTop: 12, paddingBottom: 12, fontVariationSettings: '"opsz" 14', color: 'transparent', caretColor: 'var(--color-primary)' }}
                      />
                    )}
                  </div>
                  {(() => {
                    const isCmd       = displayText.startsWith('/') && !displayText.includes(' ')
                    const hasMatch    = isCmd && SLASH_COMMANDS.some((c) => c.name.startsWith(displayText.slice(1).toLowerCase()))
                    const canSendImgs = displayPendingImages.some((img) => !!img.publicUrl) && !displayPendingImages.some((img) => img.uploading)
                    const canSendText = !!displayText.trim() && !hasMatch
                    const canSend     = canSendImgs || canSendText
                    return (
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <button
                          onClick={editTo ? () => void handleEditSend() : canSendImgs ? sendImages : send}
                          disabled={editTo ? !displayText.trim() : !canSend}
                          className={`flex items-center justify-center w-4 h-4 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${canSend ? 'text-purple' : 'text-muted'}`}
                          aria-label="Send message"
                        >
                          <Send style={{ width: 16, height: 16 }} aria-hidden="true" />
                        </button>
                      </div>
                    )
                  })()}
                </div>{/* end text+send row */}
            </div>{/* end input container */}
          </div>{/* end relative wrapper */}
        </motion.div>
      </div>{/* end squad+input bordered box (Figma 507:2485) */}

      {/* ── Media picker sheet (Upload Photo / GIF) ── */}
      <AnimatePresence>
        {showMediaPicker && (
          <AddMediaSheet
            onClose={() => setShowMediaPicker(false)}
            onUploadPhoto={() => chatImageInputRef.current?.click()}
            onPickGif={() => setShowGifPicker(true)}
            photoDisabled={pendingImages.length >= 4}
          />
        )}
      </AnimatePresence>

      {/* ── Kick confirmation sheet ── */}
      <AnimatePresence>
        {removeTarget && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { if (!removing) setRemoveTarget(null) }}
          >
            <div className="absolute inset-0 bg-black/60" />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="relative w-full max-w-[480px] bg-surface border-t border-border-hover flex flex-col gap-6 p-4"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex flex-col gap-2">
                <p className="font-pixel text-[8px] text-tertiary leading-none">REMOVE FROM SQUAD</p>
                <div className="flex flex-col gap-1">
                  <h2
                    className="font-body font-bold text-[18px] text-primary leading-none"
                    style={{ fontVariationSettings: '"opsz" 14' }}
                  >
                    {removeTarget.username}
                  </h2>
                  <p className="font-body text-[12px] text-secondary leading-normal">
                    Removing this member will redistribute their XP and any gains within the squad equally to all remaining members.
                  </p>
                </div>
              </div>

              {removeError && (
                <p className="font-silkscreen text-[8px] text-[#ef4444] leading-none">{removeError}</p>
              )}

              {/* Buttons */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleKick}
                  disabled={removing}
                  className="w-full h-12 flex items-center justify-center bg-[#ef4444] disabled:opacity-50 transition-opacity active:opacity-70"
                >
                  <span className="font-pixel text-[8px] text-primary leading-none">
                    {removing ? '...' : 'REMOVE MEMBER'}
                  </span>
                </button>
                <button
                  onClick={() => { setRemoveTarget(null); setRemoveError(null) }}
                  disabled={removing}
                  className="w-full h-12 flex items-center justify-center transition-opacity active:opacity-70"
                >
                  <span className="font-pixel text-[8px] text-tertiary leading-none">CANCEL</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Expanded member panel ── */}
      <AnimatePresence>
        {isExpanded && !isDM && (
          <SquadDetailsSheet
            crewName={liveCrewName}
            memberCount={memberCount}
            crewImageUrl={crewImageUrl}
            members={squadSheetMembers}
            onlineUserIds={onlineUserIds}
            crewXP={crewXP}
            crewLevel={crewLevel}
            xpProgress={xpProgress}
            totalMessages={totalMessages}
            inviteCode={inviteCode}
            creatorId={creatorId}
            currentUserId={userId}
            memberMsgCounts={memberMsgCounts}
            loadingCounts={loadingCounts}
            allMuted={allMuted}
            memberPinnedVinyls={memberPinnedVinyls}
            crewBackgroundImageUrl={crewBgUrl}
            onEditSquad={() => { setIsExpanded(false); setShowManageSquad(true) }}
            onTapMember={(memberId) => {
              setIsExpanded(false)
              sessionStorage.setItem('nexus_chat_from', 'chat')
              router.push(`/chat/${crewId}/member/${memberId}`)
            }}
            onNotif={() => setShowNotifSheet(true)}
            onLibrary={() => {
              sessionStorage.setItem('nexus_chat_from', 'chat')
              router.push(`/chat/${crewId}/definitions`)
            }}
            onLeave={handleLeaveSquadTapped}
            onClose={() => setIsExpanded(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Manage Squad Profile page (creator edit — full-screen, replaces the old
          edit bottom sheet). Reuses the crew crop-upload modals + rename below, so
          the chat header's crew image/name/background preview updates live. ── */}
      <AnimatePresence>
        {showManageSquad && !isDM && (
          <ManageSquadProfile
            crewName={liveCrewName}
            crewImageUrl={crewImageUrl}
            crewBackgroundImageUrl={crewBgUrl}
            crewLevel={crewLevel}
            memberCount={memberCount}
            crewXP={crewXP}
            xpProgress={xpProgress}
            totalMessages={totalMessages}
            onUploadPhoto={() => crewImageInputRef.current?.click()}
            onUploadBackground={() => crewBgInputRef.current?.click()}
            onSave={async (newName) => {
              const trimmed = newName.trim()
              const prev = liveCrewName
              setCrewName(trimmed)
              const result = await renameCrewAction(crewId, trimmed)
              if (result?.error) { setCrewName(prev); return result }
              return result
            }}
            onClose={() => { setShowManageSquad(false); setIsExpanded(false) }}
          />
        )}
      </AnimatePresence>

      {/* ── Last-member leave warning — leaving now would delete the whole squad ── */}
      <AnimatePresence>
        {showLastMemberWarning && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { if (!leavingSquad) setShowLastMemberWarning(false) }}
          >
            <div className="absolute inset-0 bg-black/60" />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="relative w-full max-w-[480px] bg-surface border-t border-border-hover flex flex-col gap-6 p-4"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex flex-col gap-2">
                <p className="font-pixel text-[8px] text-[#ef4444] leading-none">YOU&apos;RE THE LAST MEMBER</p>
                <div className="flex flex-col gap-1">
                  <h2
                    className="font-body font-bold text-[18px] text-primary leading-none"
                    style={{ fontVariationSettings: '"opsz" 14' }}
                  >
                    {liveCrewName}
                  </h2>
                  <p className="font-body text-[12px] text-secondary leading-normal">
                    Leaving will permanently delete this squad — its messages and vibes cannot be recovered.
                  </p>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => void handleLeaveSquad()}
                  disabled={leavingSquad}
                  className="w-full h-12 flex items-center justify-center bg-[#ef4444] disabled:opacity-50 transition-opacity active:opacity-70"
                >
                  <span className="font-pixel text-[8px] text-primary leading-none">
                    {leavingSquad ? '...' : 'DELETE & LEAVE'}
                  </span>
                </button>
                <button
                  onClick={() => setShowLastMemberWarning(false)}
                  disabled={leavingSquad}
                  className="w-full h-12 flex items-center justify-center transition-opacity active:opacity-70"
                >
                  <span className="font-pixel text-[8px] text-tertiary leading-none">CANCEL</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* File input outside any transformed container — iOS Safari drops .click() inside transforms */}
      <input
        ref={crewImageInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
        style={{ position: 'fixed', top: -1, left: -1, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) setCrewImageFile(f)
          e.target.value = ''
        }}
      />

      {/* Background image picker */}
      <input
        ref={crewBgInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
        style={{ position: 'fixed', top: -1, left: -1, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) setCrewBgFile(f)
          e.target.value = ''
        }}
      />

      {/* Chat image picker — fixed position prevents .click() issues in transforms.
          accept="image/*" (not an enumerated MIME list) is what makes iOS Safari open
          straight into the Photos library picker instead of the fuller Take Photo/Browse
          action sheet — actual type/size validation still happens after selection. */}
      <input
        ref={chatImageInputRef}
        type="file"
        multiple
        accept="image/*"
        style={{ position: 'fixed', top: -1, left: -1, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        onChange={(e) => {
          const files     = Array.from(e.target.files ?? [])
          const remaining = 4 - pendingImagesRef.current.length
          if (files.length > 0 && remaining > 0) void handleChatImagesPick(files.slice(0, remaining))
          e.target.value = ''
        }}
      />

      <CrewImageUploadModal
        file={crewImageFile}
        crewId={crewId}
        onClose={() => setCrewImageFile(null)}
        onSuccess={(url) => setCrewImageUrl(url)}
      />

      <CrewBackgroundUploadModal
        file={crewBgFile}
        crewId={crewId}
        onClose={() => setCrewBgFile(null)}
        onSuccess={(url) => setCrewBgUrl(url)}
      />

      <AnimatePresence>
        {showPollCreator && (
          <PollCreatorSheet
            crewId={crewId}
            userProfile={userProfile}
            onClose={() => setShowPollCreator(false)}
            onCreated={handlePollCreated}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGifPicker && (
          <GifPickerSheet
            onSelect={(gifUrl) => { setShowGifPicker(false); void sendGif(gifUrl) }}
            onClose={() => setShowGifPicker(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEventSheet && eventsEnabled && (
          <EventCreationSheet
            crewId={crewId}
            currentUserId={userId}
            onClose={() => setShowEventSheet(false)}
            createMessage
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNotifSheet && (
          <NotifSheet
            prefs={notifPrefs}
            onToggle={handleToggleNotif}
            onClose={() => setShowNotifSheet(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
