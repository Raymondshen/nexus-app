'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { SwipePreviewCard, EqualizerBars } from '@/features/chat/components/input/ChatRoomSwipePreview'
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
// scrim bottom-aligned above the input, `--space-5` padding/gap) and same header row
// (name + equalizer bars) — reusing `SwipePreviewCard`/`EqualizerBars` from that file
// rather than a second copy, so the two surfaces read as one UI, not two similar-but-
// different ones. The header name here is just the room currently open (static — there's
// no drag-driven "selection" to crossfade between while freely scrolling a list), and
// every card is interactive (a real `<button>`, not `pointerEvents: none`) with no
// dragT-driven sizing — the room currently open is simply always border-highlighted,
// same as any other static list.
//
// Rooms not yet peeked/visited need their `RoomMeta` fetched before they can render a
// real card — ChatInput's own effect fires `ensureRoomMeta` for the whole list the
// moment this opens (deduped against whatever's already cached, same as everywhere
// else `ensureRoomMeta` is used), so a room is simply omitted from this list until
// that resolves rather than rendering a placeholder/skeleton card.
export function ChatRoomBrowseSheet({
  visible,
  rooms,
  currentRoomId,
  onSelectRoom,
  onClose,
}: {
  visible:       boolean
  rooms:         Array<RoomMeta & { id: string }>
  currentRoomId: string
  onSelectRoom:  (id: string) => void
  onClose:       () => void
}) {
  const chatInputHeight = useChatRoomPeekStore((s) => s.chatInputHeight)
  const currentRoom     = rooms.find((r) => r.id === currentRoomId)

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
            <EqualizerBars />
          </div>

          {/* Same horizontally-scrollable-row pattern SquadDetailsSheet's member card
              row already uses (overflow-x-auto no-scrollbar) — not a new one-off. */}
          <div
            className="flex items-end overflow-x-auto no-scrollbar nexus-scroll w-full"
            style={{ gap: 16 }}
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
