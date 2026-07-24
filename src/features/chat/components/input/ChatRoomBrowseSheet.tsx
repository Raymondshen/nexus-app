'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus } from 'pixelarticons/react/Plus'
import { ChevronDown } from 'pixelarticons/react/ChevronDown'
import { Bell } from 'pixelarticons/react/Bell'
import { BellOff } from 'pixelarticons/react/BellOff'
import { PageHeader } from '@/shared/components/ui/PageHeader'
import { Button } from '@/shared/components/ui/Button'
import { supabaseImageLoader } from '@/shared/supabase/imageLoader'
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
// Opened two ways, both toggles onto the same sheet: a vertical, up-only pan
// gesture anywhere on chatInputContainer (decided at release — see ChatInput's
// handleTopPan/handleTopPanEnd), or a plain tap on ChatSquadDetailBar (its own
// `onTap`, which just toggles ChatInput's `showRoomBrowser` state — a second tap
// while it's open closes it). This is the sole way to quick-switch rooms or view
// squad details from inside a chat room now — there is no separate sheet/page for
// squad details or room-switching anymore, this one covers both.
//
// Header (Figma 674:13991, "page-header"): the shared `PageHeader`,
// `variant="sheet"` (bold non-uppercase DM Sans title, no back chevron) rather
// than the default subpage variant, since this overlay isn't nested under a
// `SlidePage` of its own and has no "back" concept — it's mounted directly by
// ChatInput. Title is a static "My Squads" in every state (DM or squad) — no
// dynamic crew name, no decorative leading chevron. `right` is just two icons:
// `Bell`/`BellOff` (opens `NotifSheet` on top, this sheet stays open) then
// `ChevronDown` (closes this sheet — same handler `Close` used to). This
// replaced an earlier two-branch header (crew name + MagicEdit/Library/Bell/Close
// when `squadDetail` was present, "Updates" + Close-only otherwise) — MagicEdit
// (Manage Squad Profile) and Library (squad definitions) lost their only entry
// point in that redesign and are now unreachable from the UI; `ChatInput`'s
// `showManageSquad` state and `<ManageSquadProfile>` render block are kept but
// orphaned rather than deleted (see CLAUDE.md's "kept but orphaned" convention),
// pending a new entry point if these ever need to come back. The header row is
// wrapped in its own `stopPropagation` div since the sheet root's own
// `onClick={onClose}` would otherwise also fire on every header button tap —
// harmless for the close chevron (already idempotent) but wrong for Notif, which
// should open `NotifSheet` on top without dismissing this sheet underneath.
// PageHeader owns the sheet's top/left/right padding now; the body wrapper below
// only carries the remaining bottom padding + inter-section gap.
//
// "Latest News" section (Figma 674:14485, renamed from "Notifications") — a
// stacked card per room with unread messages (Figma 674:14869), newest activity
// first (`unreadRooms` below), shown above the "Squads" row (deliberately
// reordered from Figma 589:3619's own top-to-bottom layout, which has "Squads"
// first — Notifications leads here by explicit request). Tapping a card navigates
// there, same as tapping its card in the Squads row. Unlike Home's own
// DmNotificationPreviewCard, this section is never hidden — with zero unread rooms
// it renders a bordered empty state (`NoNotificationsCard`, Figma 674:14541)
// instead, so the sheet always shows both sections. Its wrapper carries
// `flex: 1 0 0` so it fills whatever vertical space isn't used by "Squads" (the
// stacked-cards case doesn't itself grow to fill that space — only the empty
// state's own ghost/copy self-centers within it).
//
// A persistent overlay showing every room in chatRoomOrder as a native horizontally-
// scrollable row, reusing the shared `SwipePreviewCard` (Figma 674:14650, its own
// redesign — see that file). "Create Squad" (Figma 674:15311) is the LAST card in
// that same scrollable row — always trailing every room regardless of pin order,
// never first — not a separate full-width button below it (an earlier revision put
// it there; Figma 674:14485 moved it back inside the row). It always navigates
// straight to the standalone Create Squad page (`onCreateSquad`'s call site in
// ChatInput → `/home/create`) and, like before, isn't part of the equalizer's own
// room-tracking (see ScrollEqualizerBars — it's built from `rooms`, not the rendered
// card list). Dismisses three ways: tap a room card (navigates there
// immediately), tap anywhere in the sheet OTHER than the scrollable row/Create Squad
// button (the row's own onClick stops propagation so a card tap doesn't also bubble
// into this, and Create Squad's button does the same), or drag down anywhere in the
// sheet — a real, live-following pull via the same `useSheetDrag` hook `BottomSheet`
// itself uses (see that hook's own doc comment for why it's a manual
// dragControls-driven gesture rather than plain `drag="y"`: it's what lets a
// downward pull coexist with the row's native horizontal scroll instead of one
// stealing the other). Releasing past its threshold calls `onClose`; short of that,
// Framer's own drag-constraint spring-back returns it to rest. Either way — a
// drag-release close, or any of the tap-based closes above — the exit below is a
// plain opacity fade (100% → 0%, eased), not a slide — the live drag already
// provides the "following" motion while the user's finger is down, so the
// programmatic exit only needs to dissolve the sheet.
//
// The header's equalizer bars are live: they track native scroll position via a
// sliding window of up to EQUALIZER_WINDOW rooms centered on whichever card is
// currently scrolled into view (`focusedIndex`, updated on `onScroll`). Per-bar rules
// (Figma 674:15287, and the explicit color/growth spec this implements):
//   - color: `--color-primary` if that bar's room is `currentRoomId` (the room
//     you're actually chatting in — this is fixed to that room's own position and
//     never changes with scroll); else red if that room has unread messages; else
//     muted. Primary always wins over red/muted for the current room's own bar,
//     wherever it sits in the window.
//   - height: SHORT (4px) only for whichever bar is currently FOCUSED (scrolled
//     into view); every other bar in the window sits TALL (8px, the container's
//     own height) — a bar can be short AND primary at once (you've scrolled back
//     to your own room), short and red (scrolled onto an unread room), or short
//     and muted (scrolled onto a read one). Matches Figma's spec exactly (the
//     un-focused bars are `h-full` against an 8px-tall container while the
//     focused one is a fixed 4px) — this is the inverse of an earlier revision
//     that grew the focused bar taller instead of shrinking it. The growing/
//     shrinking bar always reflects whichever room it currently represents' own
//     color; primary/red/muted are not mutually exclusive with the size state.
// Each bar is a `layout`-animated motion.div inside an `AnimatePresence
// mode="popLayout"`, so when the window shifts by one room (scrolling past a card
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
// opened FROM (`currentRoomId`) — the shared `SquadDetailCard`/`SquadMemberRow`
// components (see `SquadDetailCard.tsx`'s own doc comment) rather than inlined here.
// This only covers the current room — `RoomMeta` (what every OTHER room card in the
// Squads row above is built from) doesn't carry invite codes, per-member
// class/msg-count/vinyl, or a real XP fraction, and fetching all of that for every
// room in the list just to render one static card would be wasteful; ChatInput
// already computes it all for its own current room, so it's threaded down as the
// `squadDetail` prop instead of refetched here. `null` on the DM screen, which has
// no invite/member-row concept. Because this section makes the body reliably taller
// than the available viewport (unlike before, when Notifications' own `flex: 1 0 0`
// grow made everything fit), the body wrapper below is now `overflow-y-auto` — still
// one level below the sheet root, the same nested-scrollable-region shape
// `useSheetDrag`'s ancestor walk needs (see that hook's own doc comment), so it
// still gates the pull-to-close drag on `scrollTop <= 0`.
const CARD_WIDTH  = 180
const CARD_GAP    = 16
const CARD_STEP   = CARD_WIDTH + CARD_GAP
const EQUALIZER_WINDOW = 10

type BrowseRoom = RoomMeta & { id: string }

// The current room's own detail card + member row data — see this file's top doc
// comment for why this is threaded down rather than derived from RoomMeta.
export interface SquadDetailInfo {
  crewName:                string
  crewImageUrl:            string | null
  crewBackgroundImageUrl?: string | null
  totalMessages:           number
  xpProgress:              number
  /** XP accumulated within the current level — Figma 674:14739's "0 / 100XP" readout. */
  xpInLevel:               number
  /** XP needed to complete the current level — the "100" in "0 / 100XP". */
  xpNeeded:                number
  inviteCode?:             string
  creatorId?:              string
  members:                 MiniMember[]
  onlineUserIds:           Set<string>
  memberMsgCounts:         Map<string, number>
  loadingCounts:           boolean
  memberPinnedVinyls?:     Record<string, { imageUrl: string | null; title: string | null }>
  onTapMember:             (memberId: string) => void
  /** Figma 603:3511 "leave squad" — optional; omitted (button hidden) if the caller
   *  has no leave flow to offer. */
  onLeave?:                () => void
  /** Figma 674:14748 "Manage Squad" — optional; omitted (button hidden) if the
   *  caller has no manage flow to offer (e.g. the viewer isn't the creator). */
  onManageSquad?:          () => void
}

export function ChatRoomBrowseSheet({
  visible,
  rooms,
  currentRoomId,
  pinnedRoomId,
  squadDetail,
  allMuted,
  onSelectRoom,
  onCreateSquad,
  onPinCrew,
  onLeaveRoom,
  onNotif,
  onClose,
}: {
  visible:       boolean
  rooms:         BrowseRoom[]
  currentRoomId: string
  /** This user's pinned squad, if any — see the Pin Squad sheet below. */
  pinnedRoomId:  string | null
  /** Detail card + member row for `currentRoomId` — null on the DM screen. */
  squadDetail:   SquadDetailInfo | null
  /** Drives the header's Bell/BellOff icon. */
  allMuted:      boolean
  onSelectRoom:  (id: string) => void
  onCreateSquad: () => void
  /** Long-press sheet's Pin Squad tap — always (re)assigns the pin to this room, no
   *  unpin path (see RoomPinSheet's own doc comment for the invariant). */
  onPinCrew:     (id: string) => void
  /** Long-press sheet's Leave Squad tap (Figma 605:3830) — works for ANY room card
   *  in the list, not just `currentRoomId`. See RoomPinSheet's own doc comment. */
  onLeaveRoom:   (room: BrowseRoom) => void
  /** Header Bell/BellOff tap — opens NotifSheet on top, this sheet stays open. */
  onNotif:       () => void
  onClose:       () => void
}) {
  const chatInputHeight = useChatRoomPeekStore((s) => s.chatInputHeight)
  const rowRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Long-press (hold) a room card to open a one-action Pin/Unpin Squad sheet
  // (Figma has no spec for this yet — minimal single-row sheet, same shell as
  // ChatSheetReact's own long-press-opened sheet). The pinned room always sorts to
  // the front of `rooms` below (right after the ever-first Create Squad card) —
  // pinning a different room simply overwrites profiles.pinned_crew_id server-side
  // (see pinCrewAction), so only one room can ever be pinned at a time.
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

  // Every room with unread messages, newest activity first — see this file's top
  // doc comment for the "Latest News" section this feeds (Figma 674:14869 — a
  // stacked card per unread room, replacing the empty state entirely once there's
  // at least one). The current room is never a candidate here since ChatInput
  // always publishes its own unreadCount as 0 (see RoomMeta.unreadCount's doc
  // comment).
  const unreadRooms = rooms
    .filter((r) => r.unreadCount > 0)
    .sort((a, b) => {
      const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
      const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
      return bt - at
    })

  // Pinned room always sorts to the front of the room list — a no-op sort if
  // nothing's pinned or the pinned id isn't in this list (e.g. a stale pin left
  // over from leaving that crew; see the migration's own doc comment for why
  // that's harmless).
  const sortedRooms = pinnedRoomId
    ? [...rooms].sort((a, b) => (a.id === pinnedRoomId ? -1 : b.id === pinnedRoomId ? 1 : 0))
    : rooms

  const indexOfCurrentRoom = () => {
    const idx = sortedRooms.findIndex((r) => r.id === currentRoomId)
    return idx === -1 ? 0 : idx
  }
  const [focusedIndex, setFocusedIndex] = useState(indexOfCurrentRoom)

  // Re-center on the current room every time the sheet freshly opens — adjusted
  // during render (the "you might not need an effect" pattern) rather than in a
  // useEffect.
  const [prevVisible, setPrevVisible] = useState(visible)
  if (visible !== prevVisible) {
    setPrevVisible(visible)
    if (visible) { setFocusedIndex(indexOfCurrentRoom()) }
    else setPinSheetRoomId(null)
  }

  // Scroll the row to match that same reset — a real DOM mutation, so this one does
  // need an effect (there's no way to set an element's scrollLeft during render).
  useLayoutEffect(() => {
    if (visible && rowRef.current) rowRef.current.scrollLeft = indexOfCurrentRoom() * CARD_STEP
    // Only re-run when the sheet opens, not on every rooms/currentRoomId identity
    // change — this is a one-time "snap to start" on open, not a continuous sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  // Snapping to a CARD_STEP-multiple scrollLeft only works for interior rooms — the
  // row's real max scrollLeft is `scrollWidth - clientWidth`, which is always LESS
  // than "the last room's left edge at the container's own left edge" (the viewport
  // is wider than one card, so it's still showing part of an earlier card once
  // scrolling maxes out). That means the division below can never actually reach the
  // value needed to compute the last index — the scroll simply never "hits" that
  // exact position — so the last bar never registered as focused no matter how far
  // right you scrolled. Fixed by checking the actual scroll boundaries first and
  // snapping explicitly, instead of trusting the division to land exactly on them.
  function handleScroll() {
    const el = rowRef.current
    if (!el || sortedRooms.length === 0) return
    const maxScrollLeft = el.scrollWidth - el.clientWidth
    let idx: number
    if (el.scrollLeft <= 1) {
      idx = 0
    } else if (el.scrollLeft >= maxScrollLeft - 1) {
      idx = sortedRooms.length - 1
    } else {
      idx = Math.max(0, Math.min(sortedRooms.length - 1, Math.round(el.scrollLeft / CARD_STEP)))
    }
    setFocusedIndex((prev) => (prev === idx ? prev : idx))
  }

  // Pull-to-close that coexists with the row's native horizontal scroll — see
  // useSheetDrag's own doc comment.
  const { sheetRef, dragProps } = useSheetDrag(onClose)

  const half = Math.floor(EQUALIZER_WINDOW / 2)
  const windowStart = Math.max(0, Math.min(focusedIndex - half, Math.max(0, sortedRooms.length - EQUALIZER_WINDOW)))
  const equalizerRooms = sortedRooms.slice(windowStart, windowStart + EQUALIZER_WINDOW)
  const focusedRoomId  = sortedRooms[focusedIndex]?.id

  const pinSheetRoom = pinSheetRoomId ? sortedRooms.find((r) => r.id === pinSheetRoomId) ?? null : null

  return (
    <>
      <AnimatePresence>
        {visible && (
        <motion.div
          key="room-browse-sheet"
          ref={sheetRef}
          className="fixed left-0 right-0 top-0 bg-black/95 flex flex-col"
          style={{
            bottom:     chatInputHeight,
            maxWidth:   480,
            marginLeft:  'auto',
            marginRight: 'auto',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.2, ease: 'easeInOut' } }}
          exit={{ opacity: 0, transition: { duration: 0.2, ease: 'easeInOut' } }}
          {...dragProps}
          // Override useSheetDrag's own bottom elasticity (1 = follows the finger 1:1,
          // what BottomSheet's panel wants) down to 0 — this sheet
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
            <PageHeader
              title="My Squads"
              variant="sheet"
              right={
                <div className="flex items-center flex-shrink-0" style={{ gap: 16 }}>
                  <button
                    type="button"
                    onClick={onNotif}
                    className="flex-shrink-0 appearance-none flex items-center justify-center"
                    style={{ width: 24, height: 24, color: allMuted ? 'var(--color-muted)' : 'var(--color-primary)' }}
                    aria-label={allMuted ? 'Notifications muted' : 'Notification settings'}
                  >
                    {allMuted
                      ? <BellOff style={{ width: 24, height: 24 }} aria-hidden="true" />
                      : <Bell style={{ width: 24, height: 24 }} aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-shrink-0 appearance-none flex items-center justify-center"
                    style={{ width: 24, height: 24 }}
                    aria-label="Close"
                  >
                    <ChevronDown style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
                  </button>
                </div>
              }
            />
          </div>

          <div
            ref={scrollContainerRef}
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
                  Latest News
                </p>
                {unreadRooms.length > 0
                  ? (
                    <div className="flex flex-col w-full flex-shrink-0" style={{ gap: 'var(--space-5)' }}>
                      {unreadRooms.map((room) => (
                        <NotificationPreviewCard key={room.id} room={room} onTap={() => onSelectRoom(room.id)} />
                      ))}
                    </div>
                  )
                  : <NoNotificationsCard />}
              </div>

              <div className="flex flex-col w-full flex-shrink-0" style={{ gap: 'var(--space-5)' }}>
                <p
                  className="font-body font-medium text-primary leading-none truncate min-w-0 w-full"
                  style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
                >
                  Squads
                </p>

                {/* Same horizontally-scrollable-row pattern this sheet's own member card
                    row (SquadMemberRow, below) already uses (overflow-x-auto no-scrollbar) — not a new one-off.
                    The row bleeds full-bleed past the scroll container's own `--space-5`
                    padding so the gutter is part of the scrollable content instead of static
                    ancestor padding — otherwise the auto-snap-to-current-room effect below
                    (`scrollLeft = index * CARD_STEP`), or a manual scroll to either end,
                    leaves the edge card flush against the screen edge with zero breathing
                    room, looking clipped.
                    Full-bleed here is `width: calc(100% + --space-5*2)` + `marginLeft:
                    -var(--space-5)` — NOT `marginLeft`/`marginRight` both negative on a
                    `width: 100%` box. That was tried and measured (via a throwaway
                    Playwright harness rendering this exact component) to be wrong:
                    `margin-right` never affects an element's OWN rendered edges once width
                    is fixed (non-auto) — it only affects the gap to whatever comes after it.
                    With `marginLeft` alone doing the "bleed", the whole box just SHIFTS left
                    by `--space-5`: the left edge lands correctly (0), but the right edge
                    shifts left too, ending up `--space-5` short of the ancestor's own
                    (uncancelled) right padding — i.e. `2 * --space-5` short of the true
                    viewport edge. Expanding `width` by `--space-5*2` while shifting the box
                    left by `--space-5` grows the box symmetrically in both directions instead.
                    The gutter itself is two real flex-item spacers (leading/trailing), NOT
                    `paddingLeft`/`paddingRight` on the scrolling element — trailing
                    (end-side) padding on an `overflow-x` container is unreliably included in
                    `scrollWidth` across browsers (start padding is always honored, end
                    padding after the last child often isn't). A real spacer element is
                    unambiguously part of `scrollWidth`. BOTH spacers are `--space-5` minus
                    `CARD_GAP`, not just the trailing one — flex `gap` applies on either side
                    of a spacer (between leading-spacer↔first-card, and between
                    last-card↔trailing-spacer), so each spacer only needs to make up the
                    *remainder* of `--space-5` after its own adjacent `gap` already
                    contributes `CARD_GAP` of it. `CARD_STEP`'s snap math still doesn't need
                    to change: the leading spacer is part of `scrollWidth`/`scrollLeft`
                    itself, so `index * CARD_STEP` still lands each card `--space-5` in from
                    the visible edge rather than flush against it. */}
                <div
                  ref={rowRef}
                  onScroll={handleScroll}
                  className="flex items-stretch overflow-x-auto no-scrollbar nexus-scroll"
                  style={{
                    gap:        CARD_GAP,
                    width:      'calc(100% + var(--space-5) * 2)',
                    marginLeft: 'calc(var(--space-5) * -1)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div aria-hidden="true" className="flex-shrink-0" style={{ width: `calc(var(--space-5) - ${CARD_GAP}px)` }} />
                  {sortedRooms.map((room) => (
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
                      <SwipePreviewCard room={room} pinned={room.id === pinnedRoomId} isCurrent={room.id === currentRoomId} />
                    </button>
                  ))}
                  {/* Create Squad (Figma 674:15311) — always the LAST card in the row, after
                      every room including the pinned one; never first, never a separate
                      button below the row (see this file's top doc comment). Same
                      180×240 footprint as SwipePreviewCard so it sits flush with its
                      siblings, dashed --color-border-hover border per Figma. */}
                  <button
                    type="button"
                    onClick={onCreateSquad}
                    className="flex-shrink-0 appearance-none flex flex-col items-center justify-center rounded-[var(--x3,8px)]"
                    style={{
                      width:  CARD_WIDTH,
                      height: 240,
                      gap:    'var(--x3)',
                      border: '1px dashed var(--color-border-hover)',
                    }}
                    aria-label="Create Squad"
                  >
                    <Plus style={{ width: 24, height: 24, color: 'var(--color-tertiary)', flexShrink: 0 }} aria-hidden="true" />
                    <p
                      className="font-body font-medium text-tertiary text-center leading-none"
                      style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
                    >
                      Create Squad
                    </p>
                  </button>
                  <div aria-hidden="true" className="flex-shrink-0" style={{ width: `calc(var(--space-5) - ${CARD_GAP}px)` }} />
                </div>

                {/* Equalizer + "Swipe down to view more" hint (Figma 674:15320) — its own
                    footer row BELOW the Squads card row, not paired with the "Squads"
                    label above it (an earlier revision put it there; this Figma export
                    has no such pairing). */}
                <div className="flex items-end justify-between w-full flex-shrink-0">
                  <ScrollEqualizerBars rooms={equalizerRooms} currentRoomId={currentRoomId} focusedRoomId={focusedRoomId} />
                  <p
                    className="font-body font-normal whitespace-nowrap flex-shrink-0"
                    style={{
                      fontSize:   'var(--text-xs)',
                      color:      'var(--color-muted)',
                      lineHeight: 1.4,
                      fontVariationSettings: '"opsz" 14',
                    }}
                  >
                    Swipe down to view more ↓
                  </p>
                </div>
              </div>
            </div>

            {/* Group card details + member row + Leave Squad (Figma 674:14729 "Current
                Squad Information", renamed from "Group Details" — 674:14730/674:14749/
                674:14788) for whichever room this sheet was opened from — see this
                file's top doc comment for why `squadDetail` is threaded down rather
                than derived from RoomMeta, and why it's null (nothing rendered) on the
                DM screen. The section label precedes the card, same pattern as the
                "Latest News"/"Squads" section labels above. */}
            {squadDetail && (
              <div
                className="flex flex-col w-full flex-shrink-0"
                style={{ gap: 'var(--space-5)', scrollSnapAlign: 'start' }}
              >
                <p
                  className="font-body font-medium text-primary leading-none truncate w-full"
                  style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
                >
                  Current Squad Information
                </p>
                <SquadDetailCard
                  crewName={squadDetail.crewName}
                  crewImageUrl={squadDetail.crewImageUrl}
                  crewBackgroundImageUrl={squadDetail.crewBackgroundImageUrl}
                  totalMessages={squadDetail.totalMessages}
                  xpProgress={squadDetail.xpProgress}
                  xpInLevel={squadDetail.xpInLevel}
                  xpNeeded={squadDetail.xpNeeded}
                  inviteCode={squadDetail.inviteCode}
                  onManageSquad={squadDetail.onManageSquad}
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

                {/* Figma 603:3511 "leave squad" — outlined-red Button, wrapped in its own
                    stopPropagation so the tap doesn't also close the sheet via the
                    backdrop's own onClick; not part of the earlier 599:3931 crop this
                    section's other pieces came from, but needed here since this sheet is
                    a way into squad context with no other exit for it. */}
                {squadDetail.onLeave && (
                  <div className="w-full flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button variant="outlined" color="red" onClick={squadDetail.onLeave} className="w-full">
                      Leave Squad
                    </Button>
                  </div>
                )}
              </div>
            )}
            {/* `scroll-snap-type: y mandatory` above only has two valid resting
                positions without this — the top of the Squads page and the top of
                Group Details — so releasing a scroll anywhere INSIDE Group Details'
                own content (past the member row, toward Leave Squad) would always
                spring back up to its top, permanently hiding the button no matter
                how far down you dragged. This zero-height `end`-aligned marker,
                sitting after everything else, adds a third legitimate mandatory
                rest position at the true scroll limit — so scrolling all the way
                down through Group Details now stays put there instead of snapping
                away, while the Squads↔Group-Details boundary snap is untouched. */}
            {squadDetail && <div aria-hidden className="w-full flex-shrink-0" style={{ height: 1, scrollSnapAlign: 'end' }} />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    {pinSheetRoom && (
      <RoomPinSheet
        pinned={pinSheetRoom.id === pinnedRoomId}
        onPin={() => onPinCrew(pinSheetRoom.id)}
        onLeave={() => onLeaveRoom(pinSheetRoom)}
        onClose={() => setPinSheetRoomId(null)}
      />
    )}
    </>
  )
}

// Pin/Leave Squad — the sheet a room card's long-press opens (see PIN_LONG_PRESS_MS
// above), Figma 605:3830 "chat - sheetAddMedia". Same minimal shell as ChatSheetReact's
// own long-press-opened sheet (BottomSheet + dismissOnPointerDown, since the opening
// gesture is itself a long-press/touch-hold), now with a real Figma spec: a bold
// "What would you like to do?" header, a Pin Squad `SheetActionButton` with an
// explanatory caption underneath, and a Leave Squad `SheetActionButton` below that.
// Leave Squad works for ANY room card in the browse list — not just `currentRoomId` —
// via `onLeaveRoom` (see ChatInput's `requestLeaveSquad`, which generalizes the
// existing current-room-only leave flow to accept an arbitrary target room).
//
// Pin Squad has no "unpin" path from here — matches the caption's own "one squad is
// always pinned", which is now a real DB-enforced invariant (see the
// pin_squad_invariant migration: backfilled for every existing account, and kept
// true going forward by create_crew/join_crew auto-pinning a user's first squad and
// leave_crew re-picking a replacement if the pinned squad is left), not just UI
// copy — unpinning entirely isn't offered, only switching the pin to a DIFFERENT
// squad. So when the long-pressed card is already the pinned one, the button is
// disabled outright (`SheetActionButton`'s `disabled` prop, which also renders its
// label/icon in `--color-tertiary`) — the heart icon swaps to a flat
// tertiary-filled variant (`pin-heart-tertiary.svg`) for the same reason `pin-heart.svg`
// itself is a static asset rather than a pixelarticons glyph: it's a raster/vector file
// with its own baked-in fill, not driven by `currentColor`.
//
// Both action icons are pixel-art assets exported straight from this Figma node
// (`public/icons/pin-heart.svg`, `pin-door.svg`) rather than pixelarticons glyphs —
// the heart's fill is the two-stop `--gradient-nexus` gradient (not flat, so
// `currentColor` can't reproduce it) and neither shape has a pixelarticons match.
function RoomPinSheet({
  pinned, onPin, onLeave, onClose,
}: {
  pinned:  boolean
  onPin:   () => void
  onLeave: () => void
  onClose: () => void
}) {
  return (
    <BottomSheet onClose={onClose} zIndex={90} dismissOnPointerDown>
      <div
        className="flex flex-col w-full"
        style={{
          gap:           'var(--x5)',
          paddingLeft:   'var(--md)',
          paddingRight:  'var(--md)',
          paddingBottom: 'max(env(safe-area-inset-bottom), var(--x8))',
        }}
      >
        <p
          className="font-body font-bold leading-none w-full"
          style={{ fontSize: 'var(--md)', color: 'var(--color-primary)', fontVariationSettings: '"opsz" 14' }}
        >
          What would you like to do?
        </p>

        <div className="flex flex-col w-full" style={{ gap: 'var(--x5)' }}>
          <div className="flex flex-col w-full" style={{ gap: 'var(--x2)' }}>
            <SheetActionButton
              icon={
                // eslint-disable-next-line @next/next/no-img-element -- static gradient/tertiary-fill asset, next/image adds no value here
                <img
                  src={pinned ? '/icons/pin-heart-tertiary.svg' : '/icons/pin-heart.svg'}
                  alt=""
                  style={{ width: 20, height: 'auto', display: 'block' }}
                />
              }
              label="Pin Squad"
              onClick={() => { onPin(); onClose() }}
              disabled={pinned}
            />
            <p
              className="font-body font-normal w-full"
              style={{
                fontSize:      'var(--xxs)',
                color:         'var(--color-tertiary)',
                letterSpacing: '0.2px',
                lineHeight:    'normal',
                fontVariationSettings: '"opsz" 14',
              }}
            >
              One squad is always pinned. Pinned squads will be the room you land on every time you open the Nexus.
            </p>
          </div>

          <SheetActionButton
            icon={
              // eslint-disable-next-line @next/next/no-img-element -- static asset, next/image adds no value here
              <img src="/icons/pin-door.svg" alt="" style={{ width: 20, height: 20, display: 'block' }} />
            }
            label="Leave Squad"
            onClick={() => { onClose(); onLeave() }}
          />
        </div>
      </div>
    </BottomSheet>
  )
}

// Notifications card (Figma 674:14870 "home - chatCardPreview") — one per unread
// room, stacked by the caller (see this file's top doc comment for how
// `unreadRooms` is built/sorted). A small 24×32 cover-crop thumbnail of the room's
// image now sits left of the text column — plain rectangular crop, no rounding,
// matching the Figma export exactly (not `GroupAvatar`, which forces a square
// aspect ratio this shape doesn't use); crew name + unread count on one row, the
// latest message preview below.
function NotificationPreviewCard({ room, onTap }: { room: BrowseRoom; onTap: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onTap() }}
      className="w-full flex items-center text-left appearance-none rounded-[var(--x3,8px)] overflow-hidden"
      style={{ gap: 'var(--space-3)', padding: 'var(--md)', backgroundColor: 'var(--color-surface-sheet)' }}
      aria-label={`Go to ${room.name}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- small fixed-aspect cover crop, next/image adds no value here */}
      <img
        src={supabaseImageLoader({ src: room.backgroundImageUrl ?? '/img/default_image.png', width: 48, quality: 90 })}
        alt=""
        aria-hidden
        style={{ width: 24, height: 32, objectFit: 'cover', flexShrink: 0 }}
      />
      <div className="flex flex-col flex-1 min-w-0" style={{ gap: 'var(--space-2)' }}>
        <div className="flex items-center w-full" style={{ gap: 'var(--space-3)' }}>
          <p
            className="flex-1 min-w-0 font-body font-semibold text-primary leading-none truncate"
            style={{ fontSize: 'var(--text-sm)', letterSpacing: '0.2px', fontVariationSettings: '"opsz" 14' }}
          >
            {room.name}
          </p>
          <p
            className="flex-shrink-0 font-body font-light text-tertiary leading-normal whitespace-nowrap"
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
      </div>
    </button>
  )
}

// Shown in place of NotificationPreviewCard when no room has unread messages — the
// "Latest News" section always renders (see this file's top doc comment), it just
// swaps between the card and this empty state rather than disappearing. Figma
// 674:14541 — a bordered (`--color-border`, rounded-x3) box, still filling the
// section's own flex-1 space (unlike the unread NotificationPreviewCard's
// natural-height `--color-surface-sheet` box): sleeping-ghost sprite + muted copy,
// centered.
function NoNotificationsCard() {
  return (
    <div
      className="w-full flex-1 min-h-0 flex flex-col items-center justify-center text-center rounded-[var(--x3,8px)]"
      style={{ gap: 'var(--space-2)', border: '1px solid var(--color-border)', paddingLeft: 'var(--x11)', paddingRight: 'var(--x11)' }}
    >
      <SleepingGhost size={56} />
      <p
        className="font-body font-normal text-tertiary w-full"
        style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14', lineHeight: 1.5 }}
      >
        You&apos;re all up to date. I will alert you when you have new messages.
      </p>
    </div>
  )
}

// Figma 599:7813 ("A_small_round_ghost_with_front-flip_south") — a 9-frame sleep-loop
// sprite (public/sprites/ghost/sleep/ghost-sleeping_0001.webp…0009.webp, 1-indexed),
// looped continuously via setInterval. ChatRoomPeekLayer's own ghost placeholder used
// to animate the same way (a different sprite/frame set) but is now a single static
// frame — this is the only sprite in the app still doing frame-cycling, not worth a
// shared sprite-loop abstraction for just one consumer.
const SLEEP_FRAME_COUNT = 9
const SLEEP_FRAME_MS    = 200

function SleepingGhost({ size = 80 }: { size?: number }) {
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
      style={{ width: size, height: size, flexShrink: 0, imageRendering: 'pixelated' }}
      aria-hidden="true"
    />
  )
}

// Live scroll-position indicator — see this file's top doc comment for the full
// purple/red/muted + grow rules. `layout` + `AnimatePresence mode="popLayout"` is what
// makes the window shifting by one room (a scroll past a card boundary) read as the
// bars sliding over rather than snapping to a new set.
function ScrollEqualizerBars({
  rooms, currentRoomId, focusedRoomId,
}: {
  rooms:         BrowseRoom[]
  currentRoomId: string
  focusedRoomId: string | undefined
}) {
  return (
    <div className="flex items-end flex-shrink-0" style={{ gap: 8, height: 8 }}>
      <AnimatePresence mode="popLayout" initial={false}>
        {rooms.map((room) => {
          const isFocused = room.id === focusedRoomId
          const isCurrent = room.id === currentRoomId
          const hasUnread = room.unreadCount > 0
          const color = isCurrent ? 'var(--color-primary)' : hasUnread ? 'var(--red)' : 'var(--color-muted)'
          return (
            <motion.div
              key={room.id}
              layout
              initial={{ opacity: 0, height: 8 }}
              animate={{ opacity: isCurrent || isFocused ? 1 : 0.5, height: isFocused ? 4 : 8 }}
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
