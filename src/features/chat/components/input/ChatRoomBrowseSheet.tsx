'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus } from 'pixelarticons/react/Plus'
import { Close } from 'pixelarticons/react/Close'
import { Note } from 'pixelarticons/react/Note'
import { ChevronRight } from 'pixelarticons/react/ChevronRight'
import { MagicEdit } from 'pixelarticons/react/MagicEdit'
import { Bell } from 'pixelarticons/react/Bell'
import { BellOff } from 'pixelarticons/react/BellOff'
import { Library } from 'pixelarticons/react/Library'
import { PageHeader } from '@/shared/components/ui/PageHeader'
import { Button } from '@/shared/components/ui/Button'
import { BottomSheet } from '@/shared/components/ui/sheet/BottomSheet'
import { SheetActionButton } from '@/shared/components/ui/SheetActionButton'
import { SwipePreviewCard } from '@/features/chat/components/input/SwipePreviewCard'
import { SquadDetailCard, SquadMemberRow, type MiniMember } from '@/features/chat/components/sheets/SquadDetailCard'
import { useSheetDrag } from '@/shared/components/ui/sheet/useSheetDrag'
import { useChatRoomPeekStore, type RoomMeta } from '@/features/chat/store/chatRoomPeekStore'

// Long-press timing for the room card's Pin Squad sheet — same 500ms threshold
// ChatSheetReact/MessageBubble already use for their own long-press-opened sheets.
const PIN_LONG_PRESS_MS = 500

// ─── ChatRoomBrowseSheet a.k.a. "Updates" (Figma 589:3619 "body") ─────────────
// Opened by a swipe left or right (either direction — up opens SquadDetailsSheet
// instead) anywhere on chatInputContainer, decided at release — see ChatInput's
// handleTopPan/handleTopPanEnd for the gesture itself. This is the sole way to
// quick-switch rooms from inside a chat room now — SquadDetailsSheet stays
// reachable via tap on the bar, or via the swipe-up gesture, unrelated to this
// sheet.
//
// Header: the shared `PageHeader`, `variant="sheet"` (Figma 599:7818 — bold
// non-uppercase DM Sans title, no back chevron) rather than the default subpage
// variant, since this overlay isn't nested under a `SlidePage` of its own and has
// no "back" concept — it's mounted directly by ChatInput, same as
// SquadDetailsSheet. When `squadDetail` is present (non-DM), title = the current
// room's crew name with a decorative leading `ChevronRight` (`icon` prop, Figma
// 599:7818's small chevron before "SQUAD SH*T") and `right` = the exact same
// action-icon row as SquadDetailsSheet's own header — `MagicEdit` (creator-only),
// `Bell`/`BellOff`, `Library`, then `Close` — so squad actions stay reachable
// without leaving this sheet. MagicEdit/Bell/Library fade out (opacity 0,
// `pointerEvents: none`) while `viewingGroupDetails` is false — i.e. while still on
// the Notifications+Squads page below — and fade smoothly back in once the user
// scrolls/snaps to Group Details, since those actions only make sense once squad
// context (the crew name in the title, the invite card, etc.) is actually on
// screen. Close is excluded from the fade — it stays reachable on both pages.
// `viewingGroupDetails` is derived from the body scroll container's own
// `scrollTop` (see `handleBodyScroll`), not a separate IntersectionObserver, since
// page one is already sized to exactly the container's height (see the body's own
// doc comment below) — a simple halfway threshold is enough to tell which page is
// in view. Falls back to a plain "Updates" title + Close-only `right` when
// `squadDetail` is null (DM screen — no squad to edit/mute/browse definitions
// for, so nothing to fade either). The header row is wrapped in its own
// `stopPropagation` div
// (mirroring SquadDetailsSheet's) since the sheet root's own `onClick={onClose}`
// would otherwise also fire on every header button tap — harmless for Close
// (already idempotent) but wrong for Notif, which should open `NotifSheet` on top
// without dismissing this sheet underneath. PageHeader owns the sheet's
// top/left/right padding now; the body wrapper below only carries the remaining
// bottom padding + inter-section gap.
//
// Notifications section (Figma 589:4570) — a single card surfacing whichever room
// has unread messages and received one most recently (`notifRoom` below), shown
// above the "Squads" row (deliberately reordered from Figma 589:3619's own
// top-to-bottom layout, which has "Squads" first — Notifications leads here by
// explicit request). Tapping it navigates there, same as tapping its card in the
// row. Unlike Home's own DmNotificationPreviewCard, this section is never hidden —
// with no unread room it renders a plain "you're all caught up" message instead, so
// the sheet always shows both sections. Its wrapper carries `flex: 1 0 0` so it
// fills whatever vertical space isn't used by "Squads". Per Figma 599:3928's current
// tree, the section's title row (599:7826) is bare text — no trailing close button —
// so dismissal is tap-outside/tap-a-card/drag-down only (documented below).
//
// A persistent overlay showing every room in chatRoomOrder as a native horizontally-
// scrollable row, reusing the shared `SwipePreviewCard`, plus a "Create Squad" card
// (Figma 589:3631 — dashed border, matches the room cards' height via `alignSelf:
// stretch` since it has no photo/text content of its own to size it). Create Squad is
// a genuine first ITEM in the same list as the rooms (`items` below, always index 0)
// — not a separate leading slot bolted onto the room array — so scroll tracking, the
// entrance stagger, and the equalizer all treat it exactly like any other card rather
// than special-casing it. Dismisses three ways: tap a room card (navigates there
// immediately), tap Create Squad (routes to Home with its existing create-squad sheet
// auto-opened — see `onCreateSquad`'s call site in ChatInput, no new create flow
// duplicated here), tap anywhere in the sheet OTHER than the scrollable row (the
// row's own onClick stops propagation so a card tap doesn't also bubble into this),
// or drag down anywhere in the sheet — a real, live-following pull via the same
// `useSheetDrag` hook BottomSheet/SquadDetailsSheet's panel already share (see that
// hook's own doc comment for why it's a manual dragControls-driven gesture rather
// than plain `drag="y"`: it's what lets a downward pull coexist with the row's
// native horizontal scroll instead of one stealing the other). Releasing past its
// threshold calls `onClose`; short of that, Framer's own drag-constraint spring-back
// returns it to rest. Either way — a drag-release close, or any of the tap-based
// closes above — the exit below is a plain opacity fade (100% → 0%, eased), not a
// slide — the live drag already provides the "following" motion while the user's
// finger is down, so the programmatic exit only needs to dissolve the sheet.
//
// The header's equalizer bars are live: they track native scroll position via a
// sliding window of up to EQUALIZER_WINDOW items centered on whichever card is
// currently scrolled into view (`focusedIndex`, updated on `onScroll`). Per-bar rules
// (Figma 589:3622, and the explicit color/growth spec this implements):
//   - color: purple if that bar's room is `currentRoomId` (the room you're actually
//     chatting in — this is fixed to that room's own position and never changes with
//     scroll); else red if that room has unread messages; else muted (Create Squad's
//     own bar is always muted — it isn't a room, so it can never be "current" or
//     "unread"). Purple always wins over red/muted for the current room's own bar,
//     wherever it sits in the window.
//   - height: tall (16) only for whichever bar is currently FOCUSED (scrolled into
//     view) — a bar can be tall AND purple at once (you've scrolled back to your own
//     room), tall and red (scrolled onto an unread room), or tall and muted (scrolled
//     onto a read one, or onto Create Squad). This is what makes "the bar size growth
//     would be different colors dependent on the group being viewed" — the growing
//     bar always reflects whichever item it currently represents' own color,
//     purple/red/muted are not mutually exclusive with the grow state.
// Each bar is a `layout`-animated motion.div inside an `AnimatePresence
// mode="popLayout"`, so when the window shifts by one item (scrolling past a card
// boundary), the remaining bars smoothly slide to their new slot instead of snapping —
// that slide is what reads as the equalizer "shifting left/right" with scroll
// direction; there's no separate direction state to track, Framer's layout diff
// already reflects it from the DOM reordering.
//
// Rooms not yet peeked/visited need their `RoomMeta` fetched before they can render a
// real card — ChatInput's own effect fires `ensureRoomMeta` for the whole list the
// moment this opens (deduped against whatever's already cached, same as everywhere
// else `ensureRoomMeta` is used), so a room is simply omitted from this list until
// that resolves rather than rendering a placeholder/skeleton card.
//
// Below the Squads row (Figma 599:3931's `601:3901` "group card details" + `601:3919`
// member row): the full detail card + member row for whichever room this sheet was
// opened FROM (`currentRoomId`) — the exact same `SquadDetailCard`/`SquadMemberRow`
// components `SquadDetailsSheet` renders (see that file's own doc comment; extracted
// there rather than re-inlined here a third time). This only covers the current room
// — `RoomMeta` (what every OTHER room card in the Squads row above is built from)
// doesn't carry invite codes, per-member class/msg-count/vinyl, or a real XP fraction,
// and fetching all of that for every room in the list just to render one static card
// would be wasteful; ChatInput already computes it all for its own current room to
// feed `SquadDetailsSheet`, so it's threaded down as the `squadDetail` prop instead of
// refetched here. `null` on the DM screen, which has no invite/member-row concept.
// Because this section makes the body reliably taller than the available viewport
// (unlike before, when Notifications' own `flex: 1 0 0` grow made everything fit), the
// body wrapper below is now `overflow-y-auto` — still one level below the sheet root,
// same shape `SquadDetailsSheet`'s own scrollable body uses, so `useSheetDrag`'s
// ancestor walk still finds it and gates the pull-to-close drag on `scrollTop <= 0`.
const CARD_WIDTH  = 180
const CARD_GAP    = 16
const CARD_STEP   = CARD_WIDTH + CARD_GAP
const EQUALIZER_WINDOW = 10
const CREATE_SQUAD_ID  = 'create-squad'

type BrowseRoom = RoomMeta & { id: string }

// One unified list item — Create Squad or a room — see this file's top doc comment
// for why Create Squad is a real entry here instead of a bolted-on leading slot.
type BrowseItem =
  | { kind: 'create' }
  | { kind: 'room'; room: BrowseRoom }

function itemId(item: BrowseItem): string {
  return item.kind === 'create' ? CREATE_SQUAD_ID : item.room.id
}

// The current room's own detail card + member row data — see this file's top doc
// comment for why this is threaded down rather than derived from RoomMeta. Mirrors
// the fields SquadDetailsSheet's own props already carry for the same room.
export interface SquadDetailInfo {
  crewName:                string
  crewImageUrl:            string | null
  crewBackgroundImageUrl?: string | null
  totalMessages:           number
  xpProgress:              number
  inviteCode?:             string
  creatorId?:              string
  members:                 MiniMember[]
  onlineUserIds:           Set<string>
  memberMsgCounts:         Map<string, number>
  loadingCounts:           boolean
  memberPinnedVinyls?:     Record<string, { imageUrl: string | null; title: string | null }>
  onTapMember:             (memberId: string) => void
  /** Figma 603:3511 "leave squad" — omitted (button hidden) if the caller has no
   *  leave flow to offer, same optionality as SquadDetailsSheet's own `onLeave`. */
  onLeave?:                () => void
}

export function ChatRoomBrowseSheet({
  visible,
  rooms,
  currentRoomId,
  pinnedRoomId,
  squadDetail,
  currentUserId,
  allMuted,
  onSelectRoom,
  onCreateSquad,
  onTogglePin,
  onEditSquad,
  onNotif,
  onLibrary,
  onClose,
}: {
  visible:       boolean
  rooms:         BrowseRoom[]
  currentRoomId: string
  /** This user's pinned squad, if any — see the Pin Squad sheet below. */
  pinnedRoomId:  string | null
  /** Detail card + member row for `currentRoomId` — null on the DM screen. */
  squadDetail:   SquadDetailInfo | null
  /** Compared against `squadDetail.creatorId` to gate the header's MagicEdit icon. */
  currentUserId: string
  /** Drives the header's Bell/BellOff icon — same `allMuted` ChatInput already
   *  computes for SquadDetailsSheet's identical action row. */
  allMuted:      boolean
  onSelectRoom:  (id: string) => void
  onCreateSquad: () => void
  onTogglePin:   (id: string) => void
  /** Header MagicEdit tap (creator only) — opens Manage Squad Profile. */
  onEditSquad:   () => void
  /** Header Bell/BellOff tap — opens NotifSheet on top, this sheet stays open. */
  onNotif:       () => void
  /** Header Library tap — navigates to the squad's definitions page. */
  onLibrary:     () => void
  onClose:       () => void
}) {
  const chatInputHeight = useChatRoomPeekStore((s) => s.chatInputHeight)
  const rowRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Tracks which scroll-snap "page" (see the body's own doc comment below) is
  // currently in view, to fade the header's MagicEdit/Bell/Library icons out while
  // on Notifications+Squads and back in on Group Details — those actions only make
  // sense once the user has actually scrolled to the squad-context section, per
  // this file's own request. Close is unaffected; it stays visible/tappable on
  // both pages.
  const [viewingGroupDetails, setViewingGroupDetails] = useState(false)

  function handleBodyScroll() {
    const el = scrollContainerRef.current
    if (!el) return
    // Page one is sized to exactly `el.clientHeight` (see below), so once scrollTop
    // passes the halfway point the Group Details page is what's actually on screen.
    const isPastPage1 = el.scrollTop > el.clientHeight * 0.5
    setViewingGroupDetails((prev) => (prev === isPastPage1 ? prev : isPastPage1))
  }

  // Long-press (hold) a room card to open a one-action Pin/Unpin Squad sheet
  // (Figma has no spec for this yet — minimal single-row sheet, same shell as
  // ChatSheetReact's own long-press-opened sheet). The pinned room always sorts to
  // the front of `rooms` below (right after the ever-first Create Squad card) —
  // pinning a different room simply overwrites profiles.pinned_crew_id server-side
  // (see togglePinCrewAction), so only one room can ever be pinned at a time.
  const [pinSheetRoomId, setPinSheetRoomId] = useState<string | null>(null)
  const pinLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pinLongPressFiredRef = useRef(false)

  function handleCardPressStart(roomId: string) {
    pinLongPressFiredRef.current = false
    pinLongPressTimer.current = setTimeout(() => {
      pinLongPressFiredRef.current = true
      setPinSheetRoomId(roomId)
    }, PIN_LONG_PRESS_MS)
  }
  function clearCardPressTimer() {
    if (pinLongPressTimer.current) {
      clearTimeout(pinLongPressTimer.current)
      pinLongPressTimer.current = null
    }
  }

  // Whichever room has unread messages and received one most recently — see this
  // file's top doc comment for the Notifications section this feeds. The current
  // room is never a candidate here since ChatInput always publishes its own
  // unreadCount as 0 (see RoomMeta.unreadCount's doc comment).
  const notifRoom = rooms
    .filter((r) => r.unreadCount > 0)
    .sort((a, b) => {
      const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
      const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
      return bt - at
    })[0]

  // Pinned room always sorts to the front of the room list (index 1 overall, right
  // after the Create Squad card at index 0) — a no-op sort if nothing's pinned or
  // the pinned id isn't in this list (e.g. a stale pin left over from leaving that
  // crew; see the migration's own doc comment for why that's harmless).
  const sortedRooms = pinnedRoomId
    ? [...rooms].sort((a, b) => (a.id === pinnedRoomId ? -1 : b.id === pinnedRoomId ? 1 : 0))
    : rooms
  const items: BrowseItem[] = [{ kind: 'create' }, ...sortedRooms.map((room): BrowseItem => ({ kind: 'room', room }))]

  const indexOfCurrentItem = () => {
    const idx = items.findIndex((it) => it.kind === 'room' && it.room.id === currentRoomId)
    return idx === -1 ? Math.min(1, items.length - 1) : idx
  }
  const [focusedIndex, setFocusedIndex] = useState(indexOfCurrentItem)

  // Re-center on the current room every time the sheet freshly opens — adjusted
  // during render (the "you might not need an effect" pattern) rather than in a
  // useEffect.
  const [prevVisible, setPrevVisible] = useState(visible)
  if (visible !== prevVisible) {
    setPrevVisible(visible)
    if (visible) { setFocusedIndex(indexOfCurrentItem()); setViewingGroupDetails(false) }
    else setPinSheetRoomId(null)
  }

  // Scroll the row to match that same reset — a real DOM mutation, so this one does
  // need an effect (there's no way to set an element's scrollLeft during render).
  useLayoutEffect(() => {
    if (visible && rowRef.current) rowRef.current.scrollLeft = indexOfCurrentItem() * CARD_STEP
    // Only re-run when the sheet opens, not on every rooms/currentRoomId identity
    // change — this is a one-time "snap to start" on open, not a continuous sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  // Snapping to a CARD_STEP-multiple scrollLeft only works for interior items — the
  // row's real max scrollLeft is `scrollWidth - clientWidth`, which is always LESS
  // than "the last item's left edge at the container's own left edge" (the viewport
  // is wider than one card, so it's still showing part of an earlier card once
  // scrolling maxes out). That means the division below can never actually reach the
  // value needed to compute the last index — the scroll simply never "hits" that
  // exact position — so the last bar never registered as focused no matter how far
  // right you scrolled. Fixed by checking the actual scroll boundaries first and
  // snapping explicitly, instead of trusting the division to land exactly on them.
  function handleScroll() {
    const el = rowRef.current
    if (!el || items.length === 0) return
    const maxScrollLeft = el.scrollWidth - el.clientWidth
    let idx: number
    if (el.scrollLeft <= 1) {
      idx = 0
    } else if (el.scrollLeft >= maxScrollLeft - 1) {
      idx = items.length - 1
    } else {
      idx = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollLeft / CARD_STEP)))
    }
    setFocusedIndex((prev) => (prev === idx ? prev : idx))
  }

  // Pull-to-close that coexists with the row's native horizontal scroll — see
  // useSheetDrag's own doc comment.
  const { sheetRef, dragProps } = useSheetDrag(onClose)

  const half = Math.floor(EQUALIZER_WINDOW / 2)
  const windowStart = Math.max(0, Math.min(focusedIndex - half, Math.max(0, items.length - EQUALIZER_WINDOW)))
  const equalizerItems = items.slice(windowStart, windowStart + EQUALIZER_WINDOW)
  const focusedItemId  = items[focusedIndex] ? itemId(items[focusedIndex]) : undefined

  const pinSheetRoom = pinSheetRoomId ? sortedRooms.find((r) => r.id === pinSheetRoomId) ?? null : null

  return (
    <>
      <AnimatePresence>
        {visible && (
        <motion.div
          key="room-browse-sheet"
          ref={sheetRef}
          className="fixed left-0 right-0 top-0 bg-black/85 flex flex-col"
          style={{
            bottom:     chatInputHeight,
            maxWidth:   480,
            marginLeft:  'auto',
            marginRight: 'auto',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.12 } }}
          exit={{ opacity: 0, transition: { duration: 0.2, ease: 'easeInOut' } }}
          {...dragProps}
          // Override useSheetDrag's own bottom elasticity (1 = follows the finger 1:1,
          // what BottomSheet/SquadDetailsSheet's panel both want) down to 0 — this sheet
          // shouldn't visually translate while being pulled at all, just stay put and let
          // the release-triggered `exit` fade (above) be the only close animation. The
          // gesture's own offset/velocity close-thresholds (onDragEnd, inside dragProps)
          // are untouched, since PanInfo.offset/velocity track the pointer directly and
          // aren't affected by dragElastic.
          dragElastic={{ top: 0, bottom: 0 }}
          onClick={onClose}
        >
          {/* Fixed above the scrollable body — see this file's top doc comment for why
              this needs its own `stopPropagation` wrapper (the sheet root's own
              onClick={onClose} would otherwise also fire on every header tap). */}
          <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            {squadDetail ? (
              <PageHeader
                title={squadDetail.crewName}
                variant="sheet"
                icon={<ChevronRight style={{ width: 16, height: 16, color: 'var(--color-secondary)' }} aria-hidden="true" />}
                right={
                  <div className="flex items-center flex-shrink-0" style={{ gap: 16 }}>
                    {/* MagicEdit/Bell/Library only make sense once the user has actually
                        scrolled to the Group Details page — faded out (and untappable,
                        `pointerEvents: 'none'`) while still on Notifications/Squads,
                        fading in smoothly as `viewingGroupDetails` flips. Close is
                        excluded — it stays visible/tappable on both pages. */}
                    {currentUserId === squadDetail.creatorId && (
                      <button
                        onClick={onEditSquad}
                        className="flex items-center justify-center"
                        style={{
                          width:         24,
                          height:        24,
                          opacity:       viewingGroupDetails ? 1 : 0,
                          pointerEvents: viewingGroupDetails ? 'auto' : 'none',
                          transition:    'opacity 200ms ease',
                        }}
                        aria-label="Edit squad details"
                        aria-hidden={!viewingGroupDetails}
                      >
                        <MagicEdit style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
                      </button>
                    )}
                    <button
                      onClick={onNotif}
                      className="flex items-center justify-center"
                      style={{
                        width:         24,
                        height:        24,
                        color:         allMuted ? 'var(--color-muted)' : 'var(--color-primary)',
                        opacity:       viewingGroupDetails ? 1 : 0,
                        pointerEvents: viewingGroupDetails ? 'auto' : 'none',
                        transition:    'opacity 200ms ease',
                      }}
                      aria-label={allMuted ? 'Notifications muted' : 'Notification settings'}
                      aria-hidden={!viewingGroupDetails}
                    >
                      {allMuted
                        ? <BellOff style={{ width: 24, height: 24 }} aria-hidden="true" />
                        : <Bell style={{ width: 24, height: 24 }} aria-hidden="true" />}
                    </button>
                    <button
                      onClick={onLibrary}
                      className="flex items-center justify-center"
                      style={{
                        width:         24,
                        height:        24,
                        opacity:       viewingGroupDetails ? 1 : 0,
                        pointerEvents: viewingGroupDetails ? 'auto' : 'none',
                        transition:    'opacity 200ms ease',
                      }}
                      aria-label="Squad glossary"
                      aria-hidden={!viewingGroupDetails}
                    >
                      <Library style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-shrink-0 appearance-none flex items-center justify-center"
                      style={{ width: 24, height: 24 }}
                      aria-label="Close"
                    >
                      <Close style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
                    </button>
                  </div>
                }
              />
            ) : (
              <PageHeader
                title="Updates"
                variant="sheet"
                right={
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-shrink-0 appearance-none flex items-center justify-center"
                    style={{ width: 24, height: 24 }}
                    aria-label="Close"
                  >
                    <Close style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
                  </button>
                }
              />
            )}
          </div>

          <div
            ref={scrollContainerRef}
            onScroll={handleBodyScroll}
            className="flex flex-col w-full min-h-0 overflow-y-auto nexus-scroll"
            style={{
              gap:            'var(--space-5)',
              flex:           '1 1 auto',
              paddingLeft:    'var(--space-5)',
              paddingRight:   'var(--space-5)',
              paddingBottom:  'var(--space-5)',
              scrollSnapType: 'y mandatory',
            }}
          >
            {/* Notifications + Squads combined into a single scroll-snap "page" that
                fills the full height below the header (`height: 100%` of this scroll
                container, not just its own content height) — swiping/scrolling down
                slides past it and settles (native scroll-snap, no JS) on Group Details
                below, rather than a continuous scroll through all three sections. This
                is also what lets Notifications' own `flex: 1 0 0` genuinely fill the
                remaining space next to Squads (centering NoNotificationsCard's ghost),
                since this wrapper's height is now the real viewport height rather than
                whatever the unclamped sum of all three sections happened to be. */}
            <div
              className="flex flex-col w-full flex-shrink-0"
              style={{ gap: 'var(--space-5)', height: '100%', scrollSnapAlign: 'start' }}
            >
              <div className="flex flex-col w-full" style={{ gap: 'var(--space-5)', flex: '1 0 0' }}>
                <p
                  className="font-body font-medium text-primary leading-none truncate w-full"
                  style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
                >
                  Notifications
                </p>
                {notifRoom
                  ? <NotificationPreviewCard room={notifRoom} onTap={() => onSelectRoom(notifRoom.id)} />
                  : <NoNotificationsCard />}
              </div>

              <div className="flex flex-col w-full flex-shrink-0" style={{ gap: 'var(--space-5)' }}>
                <div className="flex items-center justify-between w-full">
                  <p
                    className="font-body font-medium text-primary leading-none truncate min-w-0"
                    style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
                  >
                    Squads
                  </p>
                  <ScrollEqualizerBars items={equalizerItems} currentRoomId={currentRoomId} focusedItemId={focusedItemId} />
                </div>

                {/* Same horizontally-scrollable-row pattern SquadDetailsSheet's member card
                    row already uses (overflow-x-auto no-scrollbar) — not a new one-off. */}
                <div
                  ref={rowRef}
                  onScroll={handleScroll}
                  className="flex items-stretch overflow-x-auto no-scrollbar nexus-scroll w-full"
                  style={{ gap: CARD_GAP }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {items.map((item) => {
                    if (item.kind === 'create') {
                      return (
                        <button
                          key={CREATE_SQUAD_ID}
                          type="button"
                          onClick={onCreateSquad}
                          className="flex-shrink-0 appearance-none overflow-hidden"
                          style={{ width: CARD_WIDTH }}
                          aria-label="Create Squad"
                        >
                          <div
                            className="flex flex-col items-center justify-center h-full rounded-[var(--x3,8px)]"
                            style={{
                              gap:         8,
                              border:      '1px dashed',
                              borderColor: 'var(--color-border-hover)',
                            }}
                          >
                            <Plus style={{ width: 24, height: 24, color: 'var(--color-tertiary)', flexShrink: 0 }} aria-hidden="true" />
                            <p
                              className="font-body font-medium text-tertiary text-center truncate w-full"
                              style={{ fontSize: 14, fontVariationSettings: '"opsz" 14', paddingLeft: 12, paddingRight: 12 }}
                            >
                              Create Squad
                            </p>
                          </div>
                        </button>
                      )
                    }
                    const room = item.room
                    return (
                      <button
                        key={room.id}
                        type="button"
                        onClick={() => { if (!pinLongPressFiredRef.current) onSelectRoom(room.id) }}
                        onTouchStart={() => handleCardPressStart(room.id)}
                        onTouchEnd={clearCardPressTimer}
                        onTouchMove={clearCardPressTimer}
                        onTouchCancel={clearCardPressTimer}
                        onMouseDown={() => handleCardPressStart(room.id)}
                        onMouseUp={clearCardPressTimer}
                        onMouseLeave={clearCardPressTimer}
                        className="flex-shrink-0 appearance-none text-left active:opacity-80 overflow-hidden"
                        aria-label={`Go to ${room.name}`}
                      >
                        <SwipePreviewCard room={room} selected={room.id === currentRoomId} pinned={room.id === pinnedRoomId} />
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Group card details + member row + Leave Squad (Figma 599:3931/601:4007 —
                601:4009/601:3901/601:3919/603:3511) for whichever room this sheet was
                opened from — see this file's top doc comment for why `squadDetail` is
                threaded down rather than derived from RoomMeta, and why it's null
                (nothing rendered) on the DM screen. The "Group Details" label (Figma
                601:4009) precedes the card, same pattern as the "Notifications"/
                "Squads" section labels above. */}
            {squadDetail && (
              <div
                className="flex flex-col w-full flex-shrink-0"
                style={{ gap: 'var(--space-5)', scrollSnapAlign: 'start' }}
              >
                <p
                  className="font-body font-medium text-primary leading-none truncate w-full"
                  style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
                >
                  Group Details
                </p>
                <SquadDetailCard
                  crewName={squadDetail.crewName}
                  crewImageUrl={squadDetail.crewImageUrl}
                  crewBackgroundImageUrl={squadDetail.crewBackgroundImageUrl}
                  totalMessages={squadDetail.totalMessages}
                  xpProgress={squadDetail.xpProgress}
                  inviteCode={squadDetail.inviteCode}
                />
                <SquadMemberRow
                  members={squadDetail.members}
                  onlineUserIds={squadDetail.onlineUserIds}
                  memberMsgCounts={squadDetail.memberMsgCounts}
                  loadingCounts={squadDetail.loadingCounts}
                  creatorId={squadDetail.creatorId}
                  memberPinnedVinyls={squadDetail.memberPinnedVinyls}
                  onTapMember={squadDetail.onTapMember}
                />

                {/* Figma 603:3511 "leave squad" — same outlined-red Button + stopPropagation
                    wrapper as SquadDetailsSheet's own Leave Squad (see that component's
                    doc comment); not part of the earlier 599:3931 crop this section's
                    other pieces came from, but needed here for the same reason it's
                    needed there — this sheet is a way into squad context with no other
                    exit for it. */}
                {squadDetail.onLeave && (
                  <div className="w-full flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button variant="outlined" color="red" onClick={squadDetail.onLeave} className="w-full">
                      Leave Squad
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    {pinSheetRoom && (
      <RoomPinSheet
        room={pinSheetRoom}
        pinned={pinSheetRoom.id === pinnedRoomId}
        onTogglePin={() => onTogglePin(pinSheetRoom.id)}
        onClose={() => setPinSheetRoomId(null)}
      />
    )}
    </>
  )
}

// Pin/Unpin Squad — the sheet a room card's long-press opens (see PIN_LONG_PRESS_MS
// above). No Figma spec for this yet: a single-row sheet, same minimal shell as
// ChatSheetReact's own long-press-opened sheet (BottomSheet + dismissOnPointerDown,
// since the opening gesture is itself a long-press/touch-hold).
function RoomPinSheet({
  room, pinned, onTogglePin, onClose,
}: {
  room:        BrowseRoom
  pinned:      boolean
  onTogglePin: () => void
  onClose:     () => void
}) {
  return (
    <BottomSheet onClose={onClose} zIndex={90} dismissOnPointerDown>
      <div
        className="flex flex-col"
        style={{ gap: 16, paddingLeft: 16, paddingRight: 16, paddingBottom: 'max(env(safe-area-inset-bottom), 28px)' }}
      >
        <SheetActionButton
          icon={<Note style={{ width: 20, height: 20 }} />}
          label={pinned ? `Unpin ${room.name}` : `Pin ${room.name}`}
          onClick={() => { onTogglePin(); onClose() }}
        />
      </div>
    </BottomSheet>
  )
}

// Notifications card (Figma 589:5145 "home - chatCardPreview") — see this file's top
// doc comment for how `room` is picked. Figma's card has no avatar — just the room
// name + unread count on one row, and the latest message preview below.
function NotificationPreviewCard({ room, onTap }: { room: BrowseRoom; onTap: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onTap() }}
      className="w-full flex flex-col text-left appearance-none rounded-[var(--x3,8px)] overflow-hidden"
      style={{ gap: 'var(--space-2)', padding: 'var(--space-5)', backgroundColor: 'var(--color-surface-sheet)' }}
      aria-label={`Go to ${room.name}`}
    >
      <div className="flex items-center w-full" style={{ gap: 'var(--space-3)' }}>
        <p
          className="flex-1 min-w-0 font-body font-semibold text-primary leading-none truncate"
          style={{ fontSize: 'var(--text-sm)', letterSpacing: '0.2px', fontVariationSettings: '"opsz" 14' }}
        >
          {room.name}
        </p>
        <p
          className="flex-shrink-0 font-body font-light text-muted leading-normal whitespace-nowrap"
          style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}
        >
          {room.unreadCount} unread message{room.unreadCount === 1 ? '' : 's'}
        </p>
      </div>
      <p
        className="font-body font-normal text-secondary leading-none truncate w-full"
        style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
      >
        {room.lastMessagePreview || 'Nothing new'}
      </p>
    </button>
  )
}

// Shown in place of NotificationPreviewCard when no room has unread messages — the
// Notifications section always renders (see this file's top doc comment), it just
// swaps between the card and this empty state rather than disappearing. Figma
// 599:3932 — no card chrome here (unlike the unread NotificationPreviewCard's
// `--color-surface-sheet` box): just the sleeping-ghost sprite + muted copy,
// centered in the section's own flex-1 space.
function NoNotificationsCard() {
  return (
    <div className="w-full flex-1 min-h-0 flex flex-col items-center justify-center text-center" style={{ gap: 'var(--space-2)' }}>
      <SleepingGhost />
      <p
        className="font-body font-normal text-tertiary w-full"
        style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14', lineHeight: 1.5 }}
      >
        You&apos;re all up to date. I will alert you when you have new messages. I&apos;ll be resting for now.
      </p>
    </div>
  )
}

// Figma 599:7813 ("A_small_round_ghost_with_front-flip_south") — a 9-frame sleep-loop
// sprite (public/sprites/ghost/sleep/ghost-sleeping_0001.webp…0009.webp, 1-indexed),
// looped continuously via setInterval — same simple frame-cycling approach as
// ChatRoomPeekLayer's WalkingGhost (a different ghost animation, different frame
// set/count, not worth sharing a generic sprite-loop abstraction over just these two).
const SLEEP_FRAME_COUNT = 9
const SLEEP_FRAME_MS    = 200

function SleepingGhost() {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % SLEEP_FRAME_COUNT), SLEEP_FRAME_MS)
    return () => clearInterval(id)
  }, [])

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/sprites/ghost/sleep/ghost-sleeping_${String(frame + 1).padStart(4, '0')}.webp`}
      alt=""
      style={{ width: 80, height: 80, flexShrink: 0, imageRendering: 'pixelated' }}
      aria-hidden="true"
    />
  )
}

// Live scroll-position indicator — see this file's top doc comment for the full
// purple/red/muted + grow rules. `layout` + `AnimatePresence mode="popLayout"` is what
// makes the window shifting by one item (a scroll past a card boundary) read as the
// bars sliding over rather than snapping to a new set.
function ScrollEqualizerBars({
  items, currentRoomId, focusedItemId,
}: {
  items:         BrowseItem[]
  currentRoomId: string
  focusedItemId: string | undefined
}) {
  return (
    <div className="flex items-end flex-shrink-0" style={{ gap: 8 }}>
      <AnimatePresence mode="popLayout" initial={false}>
        {items.map((item) => {
          const id         = itemId(item)
          const isFocused  = id === focusedItemId
          const isCurrent  = item.kind === 'room' && item.room.id === currentRoomId
          const hasUnread  = item.kind === 'room' && item.room.unreadCount > 0
          const color = isCurrent ? 'var(--color-purple)' : hasUnread ? 'var(--red)' : 'var(--color-muted)'
          return (
            <motion.div
              key={id}
              layout
              initial={{ opacity: 0, height: 8 }}
              animate={{ opacity: isCurrent || isFocused ? 1 : 0.5, height: isFocused ? 16 : 8 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              style={{ width: 2, background: color }}
            />
          )
        })}
      </AnimatePresence>
    </div>
  )
}
