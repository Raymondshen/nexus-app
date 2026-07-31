'use client'

import React, { useState, useRef, useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { createClient } from '@/shared/supabase/client'
import { getXPProgress, getXPInCurrentLevel, getXPForCurrentLevel } from '@/shared/utils/xp'
import { useChatStore } from '@/store/chatStore'
import { FriendshipXPToast } from '@/shared/components/game/FriendshipXPToast'
import { GemToast } from '@/shared/components/game/GemToast'
import { usePresenceChannel } from '@/features/chat/hooks/usePresenceChannel'
import { useComposerField } from '@/features/chat/hooks/useComposerField'
import { useMentionAutocomplete } from '@/features/chat/hooks/useMentionAutocomplete'
import { useCrewProfileManagement } from '@/features/chat/hooks/useCrewProfileManagement'
import { useMessageSend } from '@/features/chat/hooks/useMessageSend'
import { ChatSquadDetailBar } from '@/features/chat/components/header/ChatSquadDetailBar'
import { skipNextSlideEnter } from '@/app/layouts/SlidePage'
import { useChatRoomPeekStore } from '@/features/chat/store/chatRoomPeekStore'
import type { RoomMeta } from '@/features/chat/store/chatRoomPeekStore'
import { ensureRoomMeta } from '@/features/chat/utils/ensureRoomMeta'
import { ChatTypingIndicator } from '@/features/chat/components/input/ChatTypingIndicator'
import { ChatRoomBrowseSheet, type SquadDetailInfo } from '@/features/chat/components/input/ChatRoomBrowseSheet'
import { makeLocalStorageFlagStore, getServerFlagSnapshotFalse } from '@/shared/utils/localStorageFlag'
import { Send } from 'pixelarticons/react/Send'
import { Plus } from 'pixelarticons/react/Plus'
import { CornerUpLeft } from 'pixelarticons/react/CornerUpLeft'
import { Close } from 'pixelarticons/react/Close'
import { MagicEdit } from 'pixelarticons/react/MagicEdit'
import { Camera } from 'pixelarticons/react/Camera'
import { GifIcon } from '@/shared/icons/GifIcon'
import { DefinitionIcon } from '@/shared/icons/DefinitionIcon'
import { kickMemberAction, birthdaysCommandAction, pinCrewAction } from '@/app/(app)/chat/actions'
import { leaveCrewAction } from '@/app/(app)/home/actions'
import dynamic from 'next/dynamic'
import { type MiniMember } from '@/features/chat/components/sheets/SquadDetailCard'
import { NotifSheet, type NotifPrefs } from '@/features/chat/components/sheets/NotifSheet'
import { BottomSheet } from '@/shared/components/ui/sheet/BottomSheet'

// Rarely-opened sheets, all conditionally rendered below — code-split so their
// weight (Klipy picker UI, event creation + crop flow, crew image/background crop
// tooling, the Manage Squad screen) stays out of the eager chat bundle and is
// fetched on first open. NotifSheet stays static: it's a core, frequently-used
// part of the screen.
const GifPickerSheet = dynamic(
  () => import('@/features/chat/components/input/GifPickerSheet').then((m) => m.GifPickerSheet),
  { ssr: false },
)
const EventCreationSheet = dynamic(
  () => import('@/features/events/components/EventCreationSheet').then((m) => m.EventCreationSheet),
  { ssr: false },
)
const ManageSquadProfile = dynamic(
  () => import('@/features/chat/screens/ManageSquadProfile').then((m) => m.ManageSquadProfile),
  { ssr: false },
)
// CrewImageUploadModal/CrewBackgroundUploadModal's own dynamic() imports (and the
// crewImageModalMounted/crewBgModalMounted lazy-mount flags that actually defer their
// fetch) now live inside useCrewProfileManagement, alongside the rest of the crew
// image/background/rename state — see that hook's own doc comment.
import type { Profile } from '@/types'

// Must match useMessageSend's own copy of this constant — this file's handleInput
// independently truncates before handing off to the composer.
const MAX_MESSAGE_LENGTH = 2000

const SLASH_COMMANDS = [
  { name: 'birthdays', icon: '🎂', description: 'See upcoming squad birthdays' },
  { name: 'event',     icon: '📅', description: 'Create a group event' },
] as const
type SlashCommandName = typeof SLASH_COMMANDS[number]['name']


// background_url is optional here (not a plain Pick field) because the DM page's
// own MemberProfile — passed through unchanged as this same prop shape — never
// fetches it (the squad member row is the only consumer, and ChatRoomBrowseSheet's
// squadDetail — which feeds it — is always null on the DM screen).
export type MemberProfile = Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url' | 'status'> & { background_url?: string | null }

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
  isDM?:               boolean
  dmPartnerId?:        string
  /** This user's group-chat crew ids, most-recently-active first (DMs excluded) — feeds
   * the dev-gated chat swipe-navigation feature. Omitted/empty on the DM screen. */
  chatRoomOrder?:      string[]
  /** This user's profiles.pinned_crew_id at page load — seeds ChatRoomBrowseSheet's
   * Pin Squad state (see handlePinCrew below). Omitted/null on the DM screen. */
  initialPinnedCrewId?: string | null
}

// Stable empty fallbacks for ChatSquadDetailBar while barOverride is active — the
// swiped-to room's online members/avatars aren't tracked from here (presence only
// runs for the mounted room), so the bar simply omits that row rather than mislabeling
// the outgoing room's online members as the destination's.
const EMPTY_MEMBERS: MemberProfile[] = []
const EMPTY_ONLINE_IDS = new Set<string>()

// SSR-safe localStorage dev-flag reader, one instance per (storageKey, changeEvent)
// pair — mirrors useQuickReactions' useSyncExternalStore pattern
// (src/shared/utils/quickReactions.ts) rather than the old "read in a useEffect, call
// setState in its body" approach (see makeLocalStorageFlagStore's own doc comment for
// why). DeveloperUserSettings.tsx is the sole writer for both flags this drives
// (nexus_friendship_xp/nexus-friendship-xp-change,
// nexus_events_enabled/nexus-events-feature-change) — it dispatches the change event
// itself after writing, same-tab, so no `storage` event listener is needed here.
const FXP_FLAG_STORE    = makeLocalStorageFlagStore('nexus_friendship_xp',  'nexus-friendship-xp-change')
const EVENTS_FLAG_STORE = makeLocalStorageFlagStore('nexus_events_enabled', 'nexus-events-feature-change')

// One of the three Upload/GIF/Definition pills in the add menu (Figma 645:8116,
// "buttons") — only ever used here, so kept local rather than promoted to
// shared/ui alongside SheetActionButton (a full-width sheet row, a different shape).
function AddMenuPill({ icon, label, onClick, disabled = false }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center flex-shrink-0 appearance-none active:opacity-70 disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        background:   'var(--color-surface-elevated)',
        borderRadius: 'var(--space-2)',
        padding:      'var(--space-4)',
        gap:          'var(--space-2)',
        color:        'var(--color-secondary)',
      }}
    >
      <span className="flex-shrink-0 flex items-center justify-center" style={{ width: 16, height: 16 }} aria-hidden="true">
        {icon}
      </span>
      <span
        className="font-body font-semibold whitespace-nowrap leading-none"
        style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}
      >
        {label}
      </span>
    </button>
  )
}

// Shared destructive-confirm sheet shell — "REMOVE FROM SQUAD" (kick) and "YOU'RE
// THE LAST MEMBER" (leave-deletes-the-squad) below both used to hand-roll their own
// backdrop + spring(320/32) + y-slide shell instead of the shared `BottomSheet`
// (project rule: no custom bottom sheet implementations) despite being ~90%
// identical to each other otherwise — consolidated into one local component (only
// ever used here, same "used only in this file" treatment as `AddMenuPill` above).
function ConfirmDestructiveSheet({
  eyebrow, eyebrowColor = 'var(--color-tertiary)', title, description, errorText,
  confirmLabel, confirmBusyLabel, busy, onConfirm, onCancel,
}: {
  eyebrow:          string
  eyebrowColor?:    string
  title:            string
  description:      string
  errorText?:       string | null
  confirmLabel:     string
  confirmBusyLabel: string
  busy:             boolean
  onConfirm:        () => void
  onCancel:         () => void
}) {
  return (
    <BottomSheet onClose={() => { if (!busy) onCancel() }} zIndex={80} disableDrag={busy}>
      <div className="flex flex-col gap-6 p-4" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}>
        <div className="flex flex-col gap-2">
          <p className="font-pixel text-[8px] leading-none" style={{ color: eyebrowColor }}>{eyebrow}</p>
          <div className="flex flex-col gap-1">
            <h2
              className="font-body font-bold text-[18px] text-primary leading-none"
              style={{ fontVariationSettings: '"opsz" 14' }}
            >
              {title}
            </h2>
            <p className="font-body text-[12px] text-secondary leading-normal">{description}</p>
          </div>
        </div>

        {errorText && (
          <p className="font-silkscreen text-[8px] text-[#ef4444] leading-none">{errorText}</p>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={onConfirm}
            disabled={busy}
            className="w-full h-12 flex items-center justify-center bg-[#ef4444] disabled:opacity-50 transition-opacity active:opacity-70"
          >
            <span className="font-pixel text-[8px] text-primary leading-none">
              {busy ? confirmBusyLabel : confirmLabel}
            </span>
          </button>
          <button
            onClick={onCancel}
            disabled={busy}
            className="w-full h-12 flex items-center justify-center transition-opacity active:opacity-70"
          >
            <span className="font-pixel text-[8px] text-tertiary leading-none">CANCEL</span>
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

// ─── ChatInput ────────────────────────────────────────────────────────────────

export function ChatInput({ crewId, userId, userProfile, memberProfiles, memberPinnedVinyls, crewName, inviteCode, creatorId, crewImageUrl: initialCrewImageUrl, crewBackgroundImageUrl: initialCrewBgUrl, initialXP, isDM, dmPartnerId, chatRoomOrder = [], initialPinnedCrewId = null }: ChatInputProps) {
  const router = useRouter()
  // Pin Squad state (see ChatRoomBrowseSheet's own doc comment) — optimistic, rolled
  // back on server error. null only ever means "this user has zero squads" — the
  // pin_squad_invariant migration backfills every existing account and
  // create_crew/join_crew/leave_crew keep it true going forward, so there's no
  // unpin path here anymore, just (re)assigning the pin to a different squad.
  const [pinnedCrewId, setPinnedCrewId] = useState<string | null>(initialPinnedCrewId)
  async function handlePinCrew(targetCrewId: string) {
    const previous = pinnedCrewId
    setPinnedCrewId(targetCrewId)
    const result = await pinCrewAction(targetCrewId)
    if (result.error) setPinnedCrewId(previous)
  }
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
  // Read via useSyncExternalStore (see makeLocalStorageFlagStore above), not a
  // useState+useEffect pair — that's what actually satisfies react-hooks/set-state-in-effect
  // here, not just a disable comment, since this genuinely is syncing from an external
  // store.
  const eventsEnabled = useSyncExternalStore(EVENTS_FLAG_STORE.subscribe, EVENTS_FLAG_STORE.getSnapshot, getServerFlagSnapshotFalse)
  const fxpEnabled    = useSyncExternalStore(FXP_FLAG_STORE.subscribe,    FXP_FLAG_STORE.getSnapshot,    getServerFlagSnapshotFalse)
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
  // Which room the last-member warning above (and the eventual leave call) actually
  // targets — null defaults to the room this ChatInput is mounted for (`crewId`,
  // `liveCrewName`). Set when Leave Squad is tapped for a DIFFERENT room via
  // ChatRoomBrowseSheet's per-card long-press sheet (Figma 605:3830) — see
  // requestLeaveSquad below.
  const [leaveTarget,    setLeaveTarget]    = useState<{ id: string; name: string } | null>(null)
  // Rooms successfully left via that same per-card Leave Squad while NOT navigating
  // away (i.e. some room other than `crewId`) — filtered out of browseRooms below so
  // a left room stops appearing in the Squads row without needing a full reload of
  // `chatRoomOrder` (a server-provided prop this component never otherwise mutates).
  const [locallyLeftRoomIds, setLocallyLeftRoomIds] = useState<Set<string>>(new Set())
  const [kickedIds,      setKickedIds]      = useState<Set<string>>(new Set())
  const [showGifPicker,    setShowGifPicker]    = useState(false)
  // Opened by the Plus button next to the text field (Figma 645:8116) — swaps the
  // squad detail bar for an inline Upload/GIF/Definition pill row and swaps the
  // Plus icon for a Close/X. Closed by tapping that X, or tapping anywhere outside
  // chatInputContainerRef (see the pointerdown effect below) — never a bottom sheet.
  const [showAddMenu,      setShowAddMenu]      = useState(false)
  const [isFocused,       setIsFocused]       = useState(false)
  // Opened by a tap on ChatSquadDetailBar — ChatRoomBrowseSheet, a persistent
  // "every room, scrollable, tap to navigate" overlay. Stays true until the user
  // taps a card, taps the bar again, or the backdrop.
  const [showRoomBrowser, setShowRoomBrowser] = useState(false)
  const [showEventSheet,  setShowEventSheet]  = useState(false)

  // The bordered "chatInputContainer" box (squad bar/add-menu + input row) — used to
  // detect a tap outside it while the add menu is open (see the pointerdown effect
  // below), separate from chatInputBoxRef, which wraps this plus the typing
  // indicator/swipe hint/ChatRoomBrowseSheet above it.
  const chatInputContainerRef = useRef<HTMLDivElement>(null)
  const overlayRef            = useRef<HTMLDivElement>(null)
  // Individual selectors — a bare useChatStore() destructure subscribes to the whole
  // store, so every Realtime-driven update (incoming messages, reaction patches,
  // optimistic-send reconciliation — all of which replace the `messages` array this
  // component never reads) re-rendered this entire component. Actions are stable
  // references, so their selectors never trigger a re-render.
  const addMessage        = useChatStore((s) => s.addMessage)
  const setCrewXP         = useChatStore((s) => s.setCrewXP)
  const crewXP            = useChatStore((s) => s.crewXP)
  const crewLevel         = useChatStore((s) => s.crewLevel)
  const onlineUserIds     = useChatStore((s) => s.onlineUserIds)
  const storeCrewName     = useChatStore((s) => s.crewName)
  const setCrewName       = useChatStore((s) => s.setCrewName)
  const replyTo           = useChatStore((s) => s.replyTo)
  const setReplyTo        = useChatStore((s) => s.setReplyTo)
  const editTo            = useChatStore((s) => s.editTo)
  const setEditTo         = useChatStore((s) => s.setEditTo)

  // Realtime channel/presence/heartbeat/typing lifecycle for this crew — see
  // usePresenceChannel's own doc comment. Everything else in this component reaches
  // the channel only through the functions returned here; the channel/presence refs
  // themselves are fully private to the hook.
  const { broadcastNewMessage, broadcastXpUpdate, pingPresence, notifyTyping, clearTypingState } =
    usePresenceChannel({ crewId, userId, userProfile, isDM, memberProfiles })

  // Hybrid input/textarea composer — text state, the multiline swap, autosize, caret
  // restore. See useComposerField's own doc comment. `clear` is destructured under
  // its own name below (not shadowing anything) since ChatInput's own
  // clearComposerText composes it with clearTypingState above.
  const {
    text, isMultiline, textareaRef, inputRef, mirrorRef, innerContainerRef, textRef,
    getActiveField, focusField, recheckOverflow, setText, setTextRaw, clear: clearComposerField,
  } = useComposerField()

  // Shared "the composer's text is fully consumed" reset — composes the composer's
  // own text/multiline/caret reset with the presence channel's typing-state clear.
  // Every path that clears `text` outside of handleInput's own onChange (send,
  // sendImages when text rode along, handleEditSend, executeCommand, the Escape-clear
  // slash-command shortcut, cancel-edit) should call this rather than re-inlining the
  // multiline reset — callers still own their own domain-specific resets around it
  // (setReplyTo, setEditTo, focusField). Stable identity (both clearComposerField and
  // clearTypingState are themselves stable) — this is passed into useMessageSend and
  // listed in send/sendImages/handleEditSend's own dependency arrays, so an unstable
  // reference here would recreate all three of those on every render.
  const clearComposerText = useCallback((): boolean => {
    const wasMultiline = clearComposerField()
    clearTypingState()
    return wasMultiline
  }, [clearComposerField, clearTypingState])

  const liveCrewName = storeCrewName || crewName

  // Crew image/background upload + rename. See useCrewProfileManagement's own doc
  // comment. crewImageUrl/crewBgUrl are read widely below (peek-store publish, squadDetail,
  // ChatSquadDetailBar, ManageSquadProfile) so the hook still exposes them as plain values,
  // same as useComposerField exposes `text`.
  const {
    crewImageUrl, crewBgUrl, crewImageInputRef, crewBgInputRef,
    onCrewImageFileChange, onCrewBgFileChange, openImagePicker, openBackgroundPicker,
    imageModal, bgModal, renameCrew,
  } = useCrewProfileManagement({ crewId, initialCrewImageUrl, initialCrewBgUrl, liveCrewName })

  const profilesRef       = useRef(memberProfiles)
  profilesRef.current     = memberProfiles

  // Message-send pipeline: text/image/GIF send, edit-save, retry, outbox-resume, and
  // their success side effects (XP settlement, presence piggyback, daily gem claim,
  // friendship-XP toast). See useMessageSend's own doc comment.
  const {
    sendError, setSendError,
    pendingImages, pendingImagesRef, removePendingImage,
    chatImageInputRef, handleChatImagesPick,
    friendshipToast, gemToastVisible,
    send, sendImages, sendGif, handleEditSend,
  } = useMessageSend({
    crewId, userId, userProfile, isDM, dmPartnerId, liveCrewName, fxpEnabled,
    text, textRef, inputRef, focusField, clearComposerText, profilesRef,
    broadcastNewMessage, broadcastXpUpdate, pingPresence,
  })

  const xpProgress  = getXPProgress(crewXP)
  const xpInLevel   = getXPInCurrentLevel(crewXP)
  const xpNeeded    = getXPForCurrentLevel(crewXP)
  // memberProfiles is a stable server-provided prop and kickedIds only changes on an
  // actual kick, so memoizing here keeps this array/its identity stable across the
  // component's frequent unrelated re-renders (realtime messages, XP, typing state) —
  // which lets consumers like SquadMemberRow's sortedMembers memoization actually
  // skip work instead of recomputing every time because `members` looked "new".
  const members     = useMemo(
    () => Object.values(memberProfiles).filter(m => !kickedIds.has(m.id)),
    [memberProfiles, kickedIds]
  )
  const memberCount = members.length

  // @mention autocomplete — query detection, filtered matches, completion, and
  // inline highlight rendering. See useMentionAutocomplete's own doc comment.
  const {
    mentionQuery, setMentionQuery, mentionIndex, setMentionIndex, mentionMatches,
    getMentionQuery, completeMention, renderHighlightedInput,
  } = useMentionAutocomplete({ members, userId, text, getActiveField, setTextRaw })

  // ChatRoomBrowseSheet's rich card (Figma 577:4895, via SwipePreviewCard) needs a
  // last-message-preview snippet for every room it shows, including this one — unlike
  // image/level/member count/online members, that's not otherwise tracked as live
  // state here, so it's fetched once per crewId. `ensureRoomMeta` can't be reused for
  // this: it short-circuits once `roomMeta[crewId]` exists, which the "publish own
  // meta" effect below already guarantees for the room currently open.
  const [ownLastMessagePreview, setOwnLastMessagePreview] = useState<string | null>(null)
  const [ownLastMessageAt,      setOwnLastMessageAt]       = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    createClient()
      .from('crews')
      .select('last_message_preview, last_message_at')
      .eq('id', crewId)
      .single()
      .then(({ data }) => {
        if (cancelled) return
        const row = data as { last_message_preview: string | null; last_message_at: string | null } | null
        setOwnLastMessagePreview(row?.last_message_preview ?? null)
        setOwnLastMessageAt(row?.last_message_at ?? null)
      })
    return () => { cancelled = true }
  }, [crewId])

  // Bookkeeping for the chat-swipe-nav peek layer (chat/[crewId]/layout.tsx's
  // ChatRoomPeekLayer, which persists across room navigation unlike this component):
  // tells it which room is *actually* mounted right now (so it can clear itself once a
  // peeked room's real page takes over, and so ChatRoomPeekLayer's frozen bar/input
  // preview knows which room's identity to keep showing through a room-switch's
  // navigation gap) and seeds this room's own name/image/level/member-count/online-
  // members/last-message so it's available instantly if another room's mount-seeding
  // initializer (see barOverride above) or ChatRoomBrowseSheet needs to borrow it.
  // unreadCount is always 0 here — you're actively viewing this room, unlike
  // ensureRoomMeta's one-shot RPC fetch for a room that isn't open.
  useEffect(() => {
    const onlineMembers = members
      .filter((m) => onlineUserIds.has(m.id))
      .map((m) => ({ id: m.id, username: m.username, avatarUrl: (m.avatar_url as string | null) ?? null }))
    useChatRoomPeekStore.getState().setCurrentRoom(crewId)
    useChatRoomPeekStore.getState().setRoomMeta(crewId, {
      name:               liveCrewName,
      imageUrl:           crewImageUrl,
      backgroundImageUrl: crewBgUrl,
      level:              crewLevel,
      memberCount,
      lastMessagePreview: ownLastMessagePreview,
      lastMessageAt:      ownLastMessageAt,
      unreadCount:        0,
      onlineMembers,
    })
  }, [crewId, liveCrewName, crewImageUrl, crewBgUrl, crewLevel, memberCount, members, onlineUserIds, ownLastMessagePreview, ownLastMessageAt])

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
    if (replyTo) focusField()
  }, [replyTo, focusField])

  // Populate input when entering edit mode. Not just a state-mirroring effect
  // ("you might not need an effect") — recheckOverflow/focusField are genuine
  // imperative DOM work (measuring the rendered text, focusing the field) that must
  // run after the setText above has actually committed to the DOM, so the setState
  // here can't be hoisted out to render time the way react-hooks/set-state-in-effect
  // would otherwise want.
  useEffect(() => {
    if (editTo) {
      setTextRaw(editTo.content)
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
  }, [crewId, userId])

  // Member message counts are only ever displayed inside ChatRoomBrowseSheet's own
  // squad-detail section, so defer the RPC until it's actually opened rather than
  // fetching on every chat mount. Refetches on every open (not cached per crew) so
  // the total stays active — messages sent since last open must be reflected,
  // matching HomeCrewDetailsSheet's fetch-on-mount behavior. The setLoadingCounts(true)
  // below is the standard "kick off an async fetch, track its loading state" shape —
  // there's no way to start the RPC call itself outside an effect (it's a side effect
  // by nature), so the state that tracks it can't be hoisted to render time either.
  useEffect(() => {
    if (!showRoomBrowser) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingCounts(true)
    createClient()
      .rpc('get_crew_member_msg_counts', { p_crew_id: crewId })
      .then(({ data }) => {
        if (cancelled) return
        setMemberMsgCounts(new Map((data ?? []).map(r => [r.user_id, Number(r.msg_count)])))
        setLoadingCounts(false)
      })
    return () => { cancelled = true }
  }, [showRoomBrowser, crewId])

  // Per-crew notification preferences — powers the Bell/BellOff icon in ChatRoomBrowseSheet
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
  }, [isMultiline, inputRef, textareaRef])


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

  // Cancels the add menu (see showAddMenu's own doc comment) on a tap anywhere
  // outside chatInputContainerRef — the X button inside it closes via its own
  // onClick instead, so this only ever needs to handle the "outside" half.
  // pointerdown (not click) so it fires before a target inside the container (e.g.
  // the text field) processes its own focus/click side effects.
  useEffect(() => {
    if (!showAddMenu) return
    function handlePointerDown(e: PointerEvent) {
      if (chatInputContainerRef.current && !chatInputContainerRef.current.contains(e.target as Node)) {
        setShowAddMenu(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [showAddMenu])

  // ChatRoomBrowseSheet shows every room in chatRoomOrder — fetched only once the
  // sheet actually opens, not eagerly on mount, since a user's full crew list could be
  // arbitrarily long. ensureRoomMeta already dedupes against whatever's cached, so
  // this is cheap on a room a prior browse-sheet open already warmed.
  useEffect(() => {
    if (!showRoomBrowser) return
    for (const id of chatRoomOrder) {
      if (id !== crewId) void ensureRoomMeta(id, userId)
    }
  }, [showRoomBrowser, chatRoomOrder, crewId, userId])

  // Used by ChatRoomBrowseSheet's own Create Squad card tap (its onCreateSquad prop
  // below). Navigates straight to the standalone Create Squad page (Figma 426:2044,
  // `CreateSquadPage`) rather than round-tripping through Home's sheet — see that
  // component's own doc comment.
  function openCreateSquadFromBrowse() {
    setShowRoomBrowser(false)
    router.push('/home/create')
  }

  // Used by ChatRoomBrowseSheet's tap-to-navigate (see its onSelectRoom call site
  // below) — `direction` only affects which side ChatRoomPeekLayer's ghost enters
  // from; a tap has no real drag direction, so the caller passes whichever is
  // closest to correct based on list position.
  function commitRoomSwitch(targetId: string, direction: 'left' | 'right') {
    // No barOverride hard-cut here anymore — this room's own bar stays showing its
    // own identity, unchanged, all the way to unmount. The destination room's own
    // mount-seeded barOverride (see its lazy initializer above) is what now plays the
    // group-A-to-group-B transition, on arrival, once B's real data is loaded.
    useChatRoomPeekStore.getState().setPeek({ targetCrewId: targetId, direction, x: 0, phase: 'committing' })
    // The peek layer above is what visually reveals the destination room (sliding its
    // ghost placeholder all the way to x:0 — which 'committing' always does,
    // regardless of the `x` passed here) — the real SlidePage that mounts once
    // navigation lands should pick up silently at that same rest position instead of
    // re-playing its own entrance (position) animation on top, which would look like a
    // second, redundant slide-in. It still crossfades in (fadeIn=true) since, unlike a
    // plain back-nav, there's no already-rendered real content underneath — only the
    // peek layer's ghost — so popping straight to fully opaque would be an abrupt cut
    // rather than a smooth handoff. See skipNextSlideEnter's own doc comment.
    skipNextSlideEnter(true)
    sessionStorage.setItem('nexus_chat_from', 'chat')
    router.push(`/chat/${targetId}`)
  }

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
      clearComposerText()
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
    const caretPos = target.selectionStart ?? val.length
    setText(val, caretPos)

    notifyTyping(!!val.trim())
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
    const wasMultiline = clearComposerText()
    if (!wasMultiline) focusField()

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
  // letting it fire silently from a single tap. Generalized to accept any target
  // room (not just `crewId`) so ChatRoomBrowseSheet's per-card long-press sheet
  // (Figma 605:3830) can offer Leave Squad for ANY room in the browse list —
  // `leave_crew`/`leaveCrewAction` already take an arbitrary crew id, this gating
  // was just hardcoded to the current room by every call site until now.
  function requestLeaveSquad(target: { id: string; name: string; memberCount: number }) {
    if (target.memberCount <= 1) {
      setLeaveTarget(target)
      setShowLastMemberWarning(true)
      return
    }
    void performLeaveSquad(target)
  }

  // The current room's own Leave Squad (ChatRoomBrowseSheet's Group Details
  // section) — unchanged call shape for that existing call site.
  function handleLeaveSquadTapped() {
    requestLeaveSquad({ id: crewId, name: liveCrewName, memberCount })
  }

  async function performLeaveSquad(target: { id: string; name: string }) {
    setLeavingSquad(true)
    setSendError(null)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLeavingSquad(false); return }
    // Navigate only on success — a failed leave (network/RLS) used to still push
    // to /home, leaving the user believing they'd left a crew they hadn't.
    const result = await leaveCrewAction(target.id, session.access_token)
    if (result?.error) {
      setLeavingSquad(false)
      setShowLastMemberWarning(false)
      setSendError(result.error)
      return
    }
    setLeavingSquad(false)
    setShowLastMemberWarning(false)
    setLeaveTarget(null)
    if (target.id === crewId) {
      // The room this ChatInput is actually mounted for — nothing left to show here.
      setShowRoomBrowser(false)
      router.push('/home')
    } else {
      // Some OTHER room, left from the browse sheet's long-press menu without ever
      // navigating into it — just drop it from the visible room list. A `pinnedCrewId`
      // now pointing at a room the user has left is harmless, same as any other stale
      // pin (see CLAUDE.md's Pin Squad section) — every consumer already no-ops when
      // the pinned id isn't in the user's current room list.
      setLocallyLeftRoomIds((prev) => new Set(prev).add(target.id))
    }
  }

  const totalMessages = [...memberMsgCounts.values()].reduce((s, n) => s + n, 0)

  // ChatRoomBrowseSheet's full list — every chatRoomOrder id with roomMeta already
  // loaded (warmed by the effect above the moment the sheet opens), in that same
  // list order. A room still mid-fetch is simply omitted until it resolves rather
  // than padded with a placeholder.
  const roomPeekMeta = useChatRoomPeekStore((s) => s.roomMeta)
  const browseRooms = chatRoomOrder
    .filter((id) => !locallyLeftRoomIds.has(id))
    .map((id) => (roomPeekMeta[id] ? { id, ...roomPeekMeta[id] } : null))
    .filter((room): room is { id: string } & RoomMeta => room !== null)

  // Feeds ChatRoomBrowseSheet's own squad-detail section (Figma 599:3931). null for
  // DMs, which don't have an invite/member-row concept — that section is skipped
  // entirely when this is null, see ChatRoomBrowseSheet's own call site.
  const squadDetail: SquadDetailInfo | null = isDM ? null : {
    crewName:               liveCrewName,
    crewImageUrl,
    crewBackgroundImageUrl: crewBgUrl,
    totalMessages,
    xpProgress,
    xpInLevel,
    xpNeeded,
    inviteCode,
    creatorId,
    members:                squadSheetMembers,
    onlineUserIds,
    memberMsgCounts,
    loadingCounts,
    memberPinnedVinyls,
    onTapMember: (memberId: string) => {
      setShowRoomBrowser(false)
      sessionStorage.setItem('nexus_chat_from', 'chat')
      router.push(`/chat/${crewId}/member/${memberId}`)
    },
    onLeave: handleLeaveSquadTapped,
    // Figma 674:14748 "Manage Squad" — restores the entry point into
    // ManageSquadProfile that the header's MagicEdit icon used to own before that
    // header was redesigned (see ChatRoomBrowseSheet's header doc comment).
    // Creator-only, same gate the old header icon used — `renameCrewAction`
    // already enforces this server-side, so a non-creator would just hit an error
    // on save; omitted (button hidden) rather than shown-disabled, matching
    // `onLeave`'s own optional-callback pattern.
    onManageSquad: userId === creatorId
      ? () => { setShowRoomBrowser(false); setShowManageSquad(true) }
      : undefined,
  }

  // Upload/GIF/Definition pills (Figma 645:8116) — identical content whether the add
  // menu is crossfading in over ChatSquadDetailBar (squad rooms) or appearing alone
  // (DMs, which have no squad bar to swap against); built once here so both render
  // paths below share the same markup instead of duplicating it.
  const addMenuPills = (
    <>
      <AddMenuPill
        icon={<Camera style={{ width: 16, height: 16 }} aria-hidden="true" />}
        label="Upload"
        disabled={pendingImages.length >= 4}
        onClick={() => { setShowAddMenu(false); chatImageInputRef.current?.click() }}
      />
      <AddMenuPill
        icon={<GifIcon style={{ width: 16, height: 16 }} aria-hidden="true" />}
        label="GIF"
        onClick={() => { setShowAddMenu(false); setShowGifPicker(true) }}
      />
      <AddMenuPill
        icon={<DefinitionIcon style={{ width: 16, height: 16 }} aria-hidden="true" />}
        label="Definition"
        onClick={() => { setShowAddMenu(false); router.push(`/chat/${crewId}/definitions`) }}
      />
    </>
  )

  function handleSelectRoomFromBrowse(targetId: string) {
    setShowRoomBrowser(false)
    if (targetId === crewId) return
    const currentIndex = chatRoomOrder.indexOf(crewId)
    const targetIndex  = chatRoomOrder.indexOf(targetId)
    const direction: 'left' | 'right' = targetIndex > currentIndex ? 'left' : 'right'
    commitRoomSwitch(targetId, direction)
  }

  return (
    <div ref={chatInputBoxRef} className="bg-black flex flex-col flex-shrink-0 relative z-[65]">
      {/* ── Typing presence (Figma 507:2518) — own top section, no gap before the
          bordered squad+input box below; the box's border-t is what divides them.
          Isolated into its own component reading straight from chatStore so a
          presence sync doesn't re-render all of ChatInput — see ChatTypingIndicator. ── */}
      <ChatTypingIndicator />

      {/* Swipe-on-the-container overlay — every room, scrollable, tap to navigate.
          Opened at the current room by a tap on ChatSquadDetailBar, or by
          tap-scrolling within the sheet itself once open. */}
      <ChatRoomBrowseSheet
        visible={showRoomBrowser}
        rooms={browseRooms}
        currentRoomId={crewId}
        pinnedRoomId={pinnedCrewId}
        squadDetail={squadDetail}
        allMuted={allMuted}
        onSelectRoom={handleSelectRoomFromBrowse}
        onCreateSquad={openCreateSquadFromBrowse}
        onPinCrew={handlePinCrew}
        onLeaveRoom={(room) => requestLeaveSquad({ id: room.id, name: room.name, memberCount: room.memberCount })}
        onNotif={() => setShowNotifSheet(true)}
        onClose={() => setShowRoomBrowser(false)}
      />

      {/* Figma 645:8036 ("chatInputContainer", supersedes the older 637:3886 revision)
          — squad bar/add-menu + input field together, as one unit. */}
      <motion.div
        ref={chatInputContainerRef}
        className="border-t border-border flex flex-col"
        style={{
          // top/gap: var(--x3, 8px) — tightened from var(--space-4)/12px by
          // explicit request.
          paddingTop:    'var(--space-3)',
          paddingLeft:   'var(--space-5)',
          paddingRight:  'var(--space-5)',
          // pb: var(--x8, 28px) per Figma — was a hardcoded 32px, drifted from the
          // design token.
          paddingBottom: 'max(env(safe-area-inset-bottom), var(--space-8))',
          // Applies uniformly to every direct child of this flex column, not just
          // squadDetails↔input: the friendship-XP/gem toasts and the DM "Chatting
          // with" label too.
          gap:           'var(--space-3)',
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

        {/* ── ChatSquadDetailBar / add menu — mutually exclusive (Figma 645:8116).
            Tapping Plus (below) fades the squad bar out and fades this Upload/GIF/
            Definition pill row in, in its place; tapping the resulting X, or
            anywhere outside chatInputContainerRef, fades back to the squad bar (see
            showAddMenu's own doc comment + the pointerdown effect above).

            Squad rooms always have exactly one of {ChatSquadDetailBar, add-menu}
            showing, so this renders as a fixed 40px-tall, absolutely-positioned
            crossfade slot rather than plain AnimatePresence siblings in normal flow.
            With the default (overlapping) AnimatePresence mode, BOTH the exiting and
            entering element are mounted for the ~150ms fade — in normal flow that
            briefly stacked ChatSquadDetailBar's own 32px height (from its 32px crew
            avatar) on top of the pill row's 40px, so chatInputBoxRef's ResizeObserver
            (below) saw the composer grow then shrink on every tap and republished
            that height to chatRoomPeekStore, which MessageList reads for its own
            bottom offset — the message list visibly jumped along with the flicker.
            Pinning both to the same absolute box keeps the wrapper's real height
            constant through the whole transition, so only opacity crossfades and
            nothing downstream ever re-measures. DMs have no ChatSquadDetailBar to
            swap against — just the add menu appearing/disappearing alone — so they
            keep the simpler normal-flow mount/unmount below instead. ── */}
        {!isDM ? (
          <div className="relative w-full flex-shrink-0" style={{ height: 40 }}>
            <AnimatePresence initial={false}>
              {showAddMenu ? (
                <motion.div
                  key="add-menu"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 right-0 top-0 flex items-center"
                  style={{ height: 40, gap: 'var(--space-2)' }}
                >
                  {addMenuPills}
                </motion.div>
              ) : (
                <motion.div
                  key="squad-bar"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 right-0 top-0 flex items-center"
                  style={{ height: 40 }}
                >
                  <ChatSquadDetailBar
                    crewImageUrl={barOverride ? barOverride.imageUrl : crewImageUrl}
                    crewName={barOverride ? barOverride.name : liveCrewName}
                    crewLevel={barOverride ? barOverride.level : crewLevel}
                    memberCount={barOverride ? barOverride.memberCount : memberCount}
                    members={barOverride ? EMPTY_MEMBERS : members}
                    onlineUserIds={barOverride ? EMPTY_ONLINE_IDS : onlineUserIds}
                    // Toggles ChatRoomBrowseSheet. A tap while it's already open closes it,
                    // matching every other "tap outside the row" dismissal instead of
                    // stacking a second open on top.
                    onTap={() => setShowRoomBrowser((prev) => !prev)}
                    isSheetOpen={showRoomBrowser}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {showAddMenu && (
              <motion.div
                key="add-menu"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center"
                style={{ gap: 'var(--space-2)', height: 40 }}
              >
                {addMenuPills}
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* ── Status indicators + input — stays visible under ChatRoomBrowseSheet
            (both it and the composer stop at `bottom: chatInputHeight`, leaving this
            box on-screen below the overlay). ── */}
        <div>
          {sendError && (
            <button className="w-full font-pixel text-[7px] text-[#ff4444] mb-2 text-left" onClick={send}>
              ↺ {sendError}
            </button>
          )}

          {/* ── Edit mode bar ── */}
          {editTo && (
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
                onClick={() => { setEditTo(null); clearComposerText() }}
                className="flex-shrink-0 flex items-center justify-center active:opacity-60"
                style={{ width: 32, height: 32, marginTop: -8, marginRight: -8, marginBottom: -8 }}
                aria-label="Cancel edit"
              >
                <Close style={{ width: 16, height: 16, color: 'var(--color-secondary)' }} aria-hidden="true" />
              </button>
            </div>
          )}

          {/* ── Reply preview bar ── */}
          {replyTo && (
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
              {mentionQuery !== null && mentionMatches.length > 0 && (
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
              const isCmd = text.startsWith('/') && !text.includes(' ')
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

            {/* Input container — flex-col when images are staged; outline brightens on focus.
                onClick just dismisses ChatRoomBrowseSheet when it's open (a tap on the
                text field/Plus/Send bubbles up to this same handler) — unlike the squad
                bar above, this doesn't suppress the tap's own normal effect (typing/
                opening the media picker still happens), it's a side effect alongside it. */}
            <div
              className="w-full flex flex-col"
              onClick={() => { if (showRoomBrowser) setShowRoomBrowser(false) }}
                style={{
                  outline:       '1px solid',
                  outlineColor:  isFocused ? 'var(--color-border-hover)' : 'var(--color-border)',
                  outlineOffset: '-1px',
                  transition:    'outline-color 0.15s ease',
                  paddingLeft:   16,
                  paddingRight:  16,
                  paddingTop:    pendingImages.length > 0 ? 16 : 0,
                  paddingBottom: pendingImages.length > 0 ? 16 : 0,
                  gap:           pendingImages.length > 0 ? 16 : 0,
                  minHeight:     48,
                }}
              >
                {/* ── Image tray (inside border, animates in/out) ── */}
                <AnimatePresence>
                  {pendingImages.length > 0 && (
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
                        {pendingImages.map((img) => (
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
                <div className="flex items-center" style={{ gap: 16, minHeight: pendingImages.length > 0 ? 18 : 48 }}>
                  {/* Plus/X toggle — slides left and fades out on focus, same as before,
                      except while the add menu itself is open: it has to stay put and
                      tappable there so X remains reachable even if the field is also
                      focused (see showAddMenu's own doc comment). */}
                  <motion.div
                    className="flex-shrink-0 overflow-hidden flex items-center justify-center"
                    animate={{
                      width:       isFocused && !showAddMenu ? 0 : 16,
                      opacity:     isFocused && !showAddMenu ? 0 : 1,
                      marginRight: isFocused && !showAddMenu ? -16 : 0,
                    }}
                    transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                    style={{ pointerEvents: isFocused && !showAddMenu ? 'none' : 'auto' }}
                  >
                    <button
                      onClick={() => setShowAddMenu((prev) => !prev)}
                      className="flex-shrink-0 flex items-center justify-center text-primary active:text-purple"
                      style={{ width: 16, height: 16 }}
                      aria-label={showAddMenu ? 'Close add menu' : 'Add media'}
                    >
                      {showAddMenu
                        ? <Close style={{ width: 16, height: 16 }} aria-hidden="true" />
                        : <Plus style={{ width: 16, height: 16 }} aria-hidden="true" />}
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
                      {renderHighlightedInput(text)}
                    </div>
                    {isMultiline ? (
                      <textarea
                        ref={textareaRef}
                        value={text}
                        onChange={(e) => handleInput(e)}
                        onKeyDown={(e) => handleKeyDown(e)}
                        onBlur={handleBlur}
                        placeholder={isDM ? 'Send a message...' : `Message ${liveCrewName}...`}
                        rows={1}
                        onFocus={() => setIsFocused(true)}
                        className="relative w-full bg-transparent font-body text-[14px] placeholder:text-muted resize-none focus:outline-none leading-normal"
                        style={{ paddingTop: 12, paddingBottom: 12, fontVariationSettings: '"opsz" 14', color: 'transparent', caretColor: 'var(--color-primary)', overflowY: 'auto', overflowX: 'hidden' }}
                      />
                    ) : (
                      <input
                        ref={inputRef}
                        type="text"
                        value={text}
                        onChange={(e) => handleInput(e)}
                        onKeyDown={(e) => handleKeyDown(e)}
                        onBlur={handleBlur}
                        placeholder={isDM ? 'Send a message...' : `Message ${liveCrewName}...`}
                        onFocus={() => setIsFocused(true)}
                        className="relative w-full bg-transparent font-body text-[14px] placeholder:text-muted focus:outline-none leading-normal"
                        style={{ paddingTop: 12, paddingBottom: 12, fontVariationSettings: '"opsz" 14', color: 'transparent', caretColor: 'var(--color-primary)' }}
                      />
                    )}
                  </div>
                  {(() => {
                    const isCmd       = text.startsWith('/') && !text.includes(' ')
                    const hasMatch    = isCmd && SLASH_COMMANDS.some((c) => c.name.startsWith(text.slice(1).toLowerCase()))
                    const canSendImgs = pendingImages.some((img) => !!img.publicUrl) && !pendingImages.some((img) => img.uploading)
                    const canSendText = !!text.trim() && !hasMatch
                    const canSend     = canSendImgs || canSendText
                    return (
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <button
                          onClick={editTo ? () => void handleEditSend() : canSendImgs ? sendImages : send}
                          disabled={editTo ? !text.trim() : !canSend}
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
        </div>
      </motion.div>{/* end squad+input bordered box (Figma 577:4905) */}

      {/* ── Kick confirmation sheet ── */}
      <AnimatePresence>
        {removeTarget && (
          <ConfirmDestructiveSheet
            eyebrow="REMOVE FROM SQUAD"
            title={removeTarget.username}
            description="Removing this member will redistribute their XP and any gains within the squad equally to all remaining members."
            errorText={removeError}
            confirmLabel="REMOVE MEMBER"
            confirmBusyLabel="..."
            busy={removing}
            onConfirm={handleKick}
            onCancel={() => { setRemoveTarget(null); setRemoveError(null) }}
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
            onUploadPhoto={openImagePicker}
            onUploadBackground={openBackgroundPicker}
            onSave={renameCrew}
            onClose={() => { setShowManageSquad(false); setShowRoomBrowser(false) }}
          />
        )}
      </AnimatePresence>

      {/* ── Last-member leave warning — leaving now would delete the whole squad ── */}
      <AnimatePresence>
        {showLastMemberWarning && (
          <ConfirmDestructiveSheet
            eyebrow="YOU'RE THE LAST MEMBER"
            eyebrowColor="#ef4444"
            title={leaveTarget?.name ?? liveCrewName}
            description="Leaving will permanently delete this squad — its messages and vibes cannot be recovered."
            confirmLabel="DELETE & LEAVE"
            confirmBusyLabel="..."
            busy={leavingSquad}
            onConfirm={() => void performLeaveSquad(leaveTarget ?? { id: crewId, name: liveCrewName })}
            onCancel={() => { setShowLastMemberWarning(false); setLeaveTarget(null) }}
          />
        )}
      </AnimatePresence>

      {/* File input outside any transformed container — iOS Safari drops .click() inside transforms */}
      <input
        ref={crewImageInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
        style={{ position: 'fixed', top: -1, left: -1, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        onChange={onCrewImageFileChange}
      />

      {/* Background image picker */}
      <input
        ref={crewBgInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
        style={{ position: 'fixed', top: -1, left: -1, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        onChange={onCrewBgFileChange}
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

      {imageModal}
      {bgModal}

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
