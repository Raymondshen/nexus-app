'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus } from 'pixelarticons/react/Plus'
import { SwipePreviewCard } from '@/features/chat/components/input/SwipePreviewCard'
import { useSheetDrag } from '@/shared/components/ui/sheet/useSheetDrag'
import { useChatRoomPeekStore, type RoomMeta } from '@/features/chat/store/chatRoomPeekStore'

// ─── ChatRoomBrowseSheet (Figma 589:3619 "body") ───────────────────────────────
// Opened by a swipe right (only — left does nothing, and up opens
// SquadDetailsSheet instead) anywhere on chatInputContainer, decided at release —
// see ChatInput's handleTopPan/handleTopPanEnd for the gesture itself. This is the
// sole way to quick-switch rooms from inside a chat room now — SquadDetailsSheet
// stays reachable via tap on the bar, or via the swipe-up gesture, unrelated to
// this sheet.
//
// Notifications section (Figma 589:4570) — a single card surfacing whichever room
// has unread messages and received one most recently (`notifRoom` below), shown
// below the "My Squads" row (Figma has "My Squads" pinned to the top and
// "Notifications" filling the rest of the sheet beneath it). Tapping it navigates
// there, same as tapping its card in the row. Unlike Home's own
// DmNotificationPreviewCard, this section is never hidden — with no unread room it
// renders a plain "you're all caught up" message instead, so the sheet always shows
// both sections. Its wrapper carries `flex: 1 0 0` (Figma's own layout) so it fills
// whatever vertical space isn't used by "My Squads".
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

export function ChatRoomBrowseSheet({
  visible,
  rooms,
  currentRoomId,
  onSelectRoom,
  onCreateSquad,
  onClose,
}: {
  visible:       boolean
  rooms:         BrowseRoom[]
  currentRoomId: string
  onSelectRoom:  (id: string) => void
  onCreateSquad: () => void
  onClose:       () => void
}) {
  const chatInputHeight = useChatRoomPeekStore((s) => s.chatInputHeight)
  const rowRef = useRef<HTMLDivElement>(null)

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

  const items: BrowseItem[] = [{ kind: 'create' }, ...rooms.map((room): BrowseItem => ({ kind: 'room', room }))]

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
    if (visible) setFocusedIndex(indexOfCurrentItem())
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

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="room-browse-sheet"
          ref={sheetRef}
          className="fixed left-0 right-0 top-0 bg-black/85 flex flex-col"
          style={{
            bottom:        chatInputHeight,
            maxWidth:      480,
            marginLeft:    'auto',
            marginRight:   'auto',
            gap:           'var(--space-5)',
            paddingLeft:   'var(--space-5)',
            paddingRight:  'var(--space-5)',
            paddingTop:    'max(env(safe-area-inset-top), var(--space-5))',
            paddingBottom: 'var(--space-5)',
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
          <div className="flex flex-col w-full flex-shrink-0" style={{ gap: 'var(--space-5)' }}>
            <div className="flex items-center justify-between w-full">
              <p
                className="font-body font-bold text-primary leading-none truncate min-w-0"
                style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}
              >
                My Squads
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
                          gap:             8,
                          border:          '1px dashed',
                          borderColor:     'var(--color-border-hover)',
                          backgroundColor: 'var(--color-background)',
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
                    onClick={() => onSelectRoom(room.id)}
                    className="flex-shrink-0 appearance-none text-left active:opacity-80 overflow-hidden"
                    aria-label={`Go to ${room.name}`}
                  >
                    <SwipePreviewCard room={room} selected={room.id === currentRoomId} />
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col w-full" style={{ gap: 'var(--space-5)', flex: '1 0 0' }}>
            <p
              className="font-body font-bold text-primary leading-none truncate w-full"
              style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}
            >
              Notifications
            </p>
            {notifRoom
              ? <NotificationPreviewCard room={notifRoom} onTap={() => onSelectRoom(notifRoom.id)} />
              : <NoNotificationsCard />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
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
// swaps between the card and this empty state rather than disappearing.
function NoNotificationsCard() {
  return (
    <div
      className="w-full flex-1 min-h-0 flex items-center justify-center text-center rounded-[var(--x3,8px)]"
      style={{ padding: 'var(--space-5)', backgroundColor: 'var(--color-surface-sheet)' }}
    >
      <p
        className="font-body font-normal text-tertiary"
        style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
      >
        You&apos;re all caught up — no new notifications.
      </p>
    </div>
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
