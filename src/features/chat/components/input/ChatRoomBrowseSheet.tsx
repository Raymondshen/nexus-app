'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SwipePreviewCard } from '@/features/chat/components/input/ChatRoomSwipePreview'
import { useChatRoomPeekStore, type RoomMeta } from '@/features/chat/store/chatRoomPeekStore'

// ─── ChatRoomBrowseSheet ────────────────────────────────────────────────────────
// Opened by swiping up anywhere on the chatInputContainer — see ChatInput's
// handleTopPan* for why that gesture now lives on the whole container (a single pan
// recognizer, not a second one layered on top of ChatSquadDetailBar's own) and why the
// swipe-up-to-expand-squad-details gesture that used to live at this same threshold
// was retired in favor of this (SquadDetailsSheet is still reachable via tap/chevron).
//
// Unlike ChatRoomSwipePreview (a live, drag-linked 3-card glimpse — releasing that
// drag either commits to the adjacent room or cancels the whole thing), this is a
// persistent overlay showing EVERY room in chatRoomOrder as a native horizontally-
// scrollable row. It stays open — independent of any drag — until the user taps a
// card (navigates there immediately) or taps the backdrop (dismisses, no navigation).
//
// Same Figma frame (577:4895) as ChatRoomSwipePreview, same container shell (dark
// scrim bottom-aligned above the input, `--space-5` padding/gap) and reuses the same
// `SwipePreviewCard`. The header's name is the room currently open (static — it
// doesn't track scrolling, unlike the equalizer below); every card is interactive (a
// real `<button>`, not `pointerEvents: none`) with no dragT-driven sizing — the room
// currently open is simply always border-highlighted, same as any other static list.
//
// Unlike ChatRoomSwipePreview's own equalizer (still the static Figma 582:3452
// decoration — that component has no scrollable list to track), THIS sheet's
// equalizer is live: it tracks native scroll position via a sliding window of up to
// EQUALIZER_WINDOW rooms centered on whichever card is currently scrolled into view
// (`focusedIndex`, updated on `onScroll`). Within that window: the focused room's own
// bar is purple + tall ("current page" — which card you're actively viewing, distinct
// from `currentRoomId`, the room you're actually chatting in, which only drives the
// header name + the one card's border highlight); any OTHER room in the window with
// unread messages gets a red bar (same height as an ordinary muted bar — only color
// differs, matching the original Figma spot state where purple and red never coincide
// on one bar); everything else stays muted. Each bar is a `layout`-animated
// motion.div inside an `AnimatePresence mode="popLayout"`, so when the window shifts
// by one room (scrolling past a card boundary), the remaining bars smoothly slide to
// their new slot instead of snapping — that slide is what reads as the equalizer
// "shifting left/right" with scroll direction; there's no separate direction state to
// track, Framer's layout diff already reflects it from the DOM reordering.
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

type BrowseRoom = RoomMeta & { id: string }

export function ChatRoomBrowseSheet({
  visible,
  rooms,
  currentRoomId,
  onSelectRoom,
  onClose,
}: {
  visible:       boolean
  rooms:         BrowseRoom[]
  currentRoomId: string
  onSelectRoom:  (id: string) => void
  onClose:       () => void
}) {
  const chatInputHeight = useChatRoomPeekStore((s) => s.chatInputHeight)
  const rowRef = useRef<HTMLDivElement>(null)
  const currentRoom = rooms.find((r) => r.id === currentRoomId)

  const indexOfCurrentRoom = () => Math.max(0, rooms.findIndex((r) => r.id === currentRoomId))
  const [focusedIndex, setFocusedIndex] = useState(indexOfCurrentRoom)

  // Re-center on the current room every time the sheet freshly opens — adjusted
  // during render (the "you might not need an effect" pattern, matching
  // ChatRoomSwipePreview's own selectedRole reset) rather than in a useEffect.
  const [prevVisible, setPrevVisible] = useState(visible)
  if (visible !== prevVisible) {
    setPrevVisible(visible)
    if (visible) setFocusedIndex(indexOfCurrentRoom())
  }

  // Scroll the row to match that same reset — a real DOM mutation, so this one does
  // need an effect (there's no way to set an element's scrollLeft during render).
  useLayoutEffect(() => {
    if (visible && rowRef.current) rowRef.current.scrollLeft = indexOfCurrentRoom() * CARD_STEP
    // Only re-run when the sheet opens, not on every rooms/currentRoomId identity
    // change — this is a one-time "snap to start" on open, not a continuous sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  function handleScroll() {
    const el = rowRef.current
    if (!el || rooms.length === 0) return
    const idx = Math.max(0, Math.min(rooms.length - 1, Math.round(el.scrollLeft / CARD_STEP)))
    setFocusedIndex((prev) => (prev === idx ? prev : idx))
  }

  const half = Math.floor(EQUALIZER_WINDOW / 2)
  const windowStart = Math.max(0, Math.min(focusedIndex - half, Math.max(0, rooms.length - EQUALIZER_WINDOW)))
  const equalizerRooms = rooms.slice(windowStart, windowStart + EQUALIZER_WINDOW)
  const focusedRoomId  = rooms[focusedIndex]?.id

  return (
    <AnimatePresence>
      {visible && rooms.length > 0 && (
        <motion.div
          key="room-browse-sheet"
          className="fixed left-0 right-0 top-0 bg-black/60 flex flex-col justify-end"
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
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.12 } }}
          exit={{ opacity: 0, transition: { duration: 0.08 } }}
          onClick={onClose}
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
            <ScrollEqualizerBars rooms={equalizerRooms} focusedRoomId={focusedRoomId} />
          </div>

          {/* Same horizontally-scrollable-row pattern SquadDetailsSheet's member card
              row already uses (overflow-x-auto no-scrollbar) — not a new one-off. */}
          <div
            ref={rowRef}
            onScroll={handleScroll}
            className="flex items-end overflow-x-auto no-scrollbar nexus-scroll w-full"
            style={{ gap: CARD_GAP }}
            onClick={(e) => e.stopPropagation()}
          >
            {rooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => onSelectRoom(room.id)}
                className="flex-shrink-0 appearance-none text-left active:opacity-80"
                aria-label={`Go to ${room.name}`}
              >
                <SwipePreviewCard room={room} selected={room.id === currentRoomId} />
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Live scroll-position indicator — see this file's top doc comment for the full
// purple/red/muted rules. `layout` + `AnimatePresence mode="popLayout"` is what makes
// the window shifting by one room (a scroll past a card boundary) read as the bars
// sliding over rather than snapping to a new set.
function ScrollEqualizerBars({ rooms, focusedRoomId }: { rooms: BrowseRoom[]; focusedRoomId: string | undefined }) {
  return (
    <div className="flex items-end flex-shrink-0" style={{ gap: 8 }}>
      <AnimatePresence mode="popLayout" initial={false}>
        {rooms.map((room) => {
          const isFocused = room.id === focusedRoomId
          const hasUnread = room.unreadCount > 0
          const color = isFocused ? 'var(--color-purple)' : hasUnread ? 'var(--red)' : 'var(--color-muted)'
          return (
            <motion.div
              key={room.id}
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
