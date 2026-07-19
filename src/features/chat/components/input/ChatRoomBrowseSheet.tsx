'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { PanInfo } from 'framer-motion'
import { Plus } from 'pixelarticons/react/Plus'
import { SwipePreviewCard } from '@/features/chat/components/input/SwipePreviewCard'
import { useChatRoomPeekStore, type RoomMeta } from '@/features/chat/store/chatRoomPeekStore'

// ─── ChatRoomBrowseSheet (Figma 589:3619 "body") ───────────────────────────────
// Opened by swiping up anywhere on the chatInputContainer — see ChatInput's
// handleTopPanEnd for the gesture itself (a single pan recognizer on the whole
// container). This is the sole way to quick-switch rooms from inside a chat room
// now — SquadDetailsSheet stays reachable via tap on the bar / its chevron, unrelated
// to this gesture.
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
// or swipe down anywhere in the sheet past a small threshold (handlePanEnd below).
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
const EQUALIZER_WINDOW = 7
const CREATE_SQUAD_ID  = 'create-squad'

// Downward swipe anywhere in the sheet closes it — same style of threshold check as
// ChatInput's own swipe-up-to-open (a discrete check at pan end, not a live drag-
// linked visual), for consistency between the gesture that opens this and the one
// that closes it.
const SWIPE_CLOSE_OFFSET_PX = 50
const SWIPE_CLOSE_VELOCITY  = 300

// Per-card "rise up from below" entrance (Figma 589:3630, nodes 589:3631/589:3826) —
// plays once per card, every time this sheet freshly opens (each open is a fresh mount
// inside the AnimatePresence below, so `initial`/`animate` replay naturally with no
// manual reset needed — unlike focusedIndex above, which persists across renders and
// does need one). CARD_SLIDE_Y (236) is verbatim from Figma's `initialY` and matches
// this card shape's own natural rendered height, so a card slides up from fully
// hidden below its resting spot rather than an arbitrary offset. Figma only animated
// the first two visual slots (Create Squad, then the first room card) with a growing
// stagger between them (0.1005 vs 0.1505 of a 2s clip = a +0.05 fraction / 100ms hold
// added per slot) — generalized here to every card via `index * CARD_SLIDE_STAGGER_S`
// rather than hand-coding two special cases, so any list length gets the same
// cascading reveal. Deliberately NOT looped (Figma's own `repeat: Infinity` is
// dropped) — a repeating "rise up" here would read the same way the avatar-bounce's
// looping once did before that was fixed to a one-shot entrance: a card that keeps
// re-sliding while the sheet sits open reads as flicker, not entrance.
// `overflow-hidden` on each button wrapper below clips the transient slide-through
// instead of letting it spill past the row/sheet edges.
const CARD_SLIDE_Y          = 236
const CARD_SLIDE_STAGGER_S  = 0.1
const CARD_SLIDE_DURATION_S = 0.2

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
  const currentRoom = rooms.find((r) => r.id === currentRoomId)

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

  function handlePanEnd(_: PointerEvent, info: PanInfo) {
    if (info.offset.y > SWIPE_CLOSE_OFFSET_PX || info.velocity.y > SWIPE_CLOSE_VELOCITY) onClose()
  }

  const half = Math.floor(EQUALIZER_WINDOW / 2)
  const windowStart = Math.max(0, Math.min(focusedIndex - half, Math.max(0, items.length - EQUALIZER_WINDOW)))
  const equalizerItems = items.slice(windowStart, windowStart + EQUALIZER_WINDOW)
  const focusedItemId  = items[focusedIndex] ? itemId(items[focusedIndex]) : undefined

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="room-browse-sheet"
          className="fixed left-0 right-0 top-0 bg-black/80 flex flex-col justify-end"
          style={{
            bottom:        chatInputHeight,
            maxWidth:      480,
            marginLeft:    'auto',
            marginRight:   'auto',
            gap:           'var(--space-5)',
            paddingLeft:   'var(--space-5)',
            paddingRight:  'var(--space-5)',
            paddingTop:    'var(--space-5)',
            paddingBottom: 'var(--space-5)',
            // Lets the browser keep handling the row's native horizontal scroll
            // directly instead of Framer's pan gesture racing it — onPanEnd below
            // only needs to see vertical drags, and a small y-offset from an
            // otherwise-horizontal scroll gesture never crosses SWIPE_CLOSE_OFFSET_PX.
            touchAction:   'pan-x',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.12 } }}
          exit={{ opacity: 0, transition: { duration: 0.08 } }}
          onClick={onClose}
          onPanEnd={handlePanEnd}
        >
          <div className="flex items-center justify-between w-full">
            {currentRoom && (
              <p
                className="font-silkscreen text-primary leading-none truncate min-w-0"
                style={{ fontSize: 'var(--text-md)' }}
              >
                {currentRoom.name}
              </p>
            )}
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
            {items.map((item, i) => {
              const slideTransition = { delay: i * CARD_SLIDE_STAGGER_S, duration: CARD_SLIDE_DURATION_S, ease: 'linear' as const }
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
                    <motion.div
                      className="flex flex-col items-center justify-center h-full rounded-[var(--x3,8px)]"
                      style={{
                        gap:             8,
                        border:          '1px dashed',
                        borderColor:     'var(--color-border-hover)',
                        backgroundColor: 'var(--color-background)',
                      }}
                      initial={{ y: CARD_SLIDE_Y }}
                      animate={{ y: 0 }}
                      transition={slideTransition}
                    >
                      <Plus style={{ width: 24, height: 24, color: 'var(--color-tertiary)', flexShrink: 0 }} aria-hidden="true" />
                      <p
                        className="font-body font-medium text-tertiary text-center truncate w-full"
                        style={{ fontSize: 14, fontVariationSettings: '"opsz" 14', paddingLeft: 12, paddingRight: 12 }}
                      >
                        Create Squad
                      </p>
                    </motion.div>
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
                  <motion.div initial={{ y: CARD_SLIDE_Y }} animate={{ y: 0 }} transition={slideTransition}>
                    <SwipePreviewCard room={room} selected={room.id === currentRoomId} />
                  </motion.div>
                </button>
              )
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
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
              animate={{ opacity: 1, height: isFocused ? 16 : 8 }}
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
