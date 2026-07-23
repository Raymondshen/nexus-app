'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BottomSheet } from '@/shared/components/ui/sheet/BottomSheet'
import { SheetActionButton } from '@/shared/components/ui/SheetActionButton'
import type { RoomMeta } from '@/features/chat/store/chatRoomPeekStore'

// ─── SquadsListShared ───────────────────────────────────────────────────────
// The Squads-row/Notifications pieces ChatRoomBrowseSheet used to own directly,
// before that sheet was simplified to solely show the current room's own Group
// Details (see that file's own doc comment for the split rationale). Room
// browsing/switching lives on its own page now — ChatSquadsPage.tsx
// (`/chat/[crewId]/squads`, reached via ChatFloatingNav's Menu button) — and
// this module is what it imports rather than duplicating: card layout math,
// the Notifications card + its empty state, the scroll-position equalizer, and
// the long-press Pin/Leave Squad sheet.

export const CARD_WIDTH  = 180
export const CARD_GAP    = 16
export const CARD_STEP   = CARD_WIDTH + CARD_GAP
export const EQUALIZER_WINDOW = 10
export const CREATE_SQUAD_ID  = 'create-squad'

// Long-press timing for a room card's Pin Squad sheet — same 500ms threshold
// ChatSheetReact/MessageBubble already use for their own long-press-opened sheets.
export const PIN_LONG_PRESS_MS = 500

export type BrowseRoom = RoomMeta & { id: string }

// One unified list item — Create Squad or a room — so scroll tracking, the
// equalizer, and the "which index is the current room" math all treat Create
// Squad exactly like any other card rather than special-casing it as a
// bolted-on leading slot.
export type BrowseItem =
  | { kind: 'create' }
  | { kind: 'room'; room: BrowseRoom }

export function itemId(item: BrowseItem): string {
  return item.kind === 'create' ? CREATE_SQUAD_ID : item.room.id
}

// Notifications card (Figma 589:5145 "home - chatCardPreview") — whichever room
// has unread messages and received one most recently is the caller's job to
// pick (see ChatSquadsPage's own `notifRoom` computation). Figma's card has no
// avatar — just the room name + unread count on one row, and the latest
// message preview below.
export function NotificationPreviewCard({ room, onTap }: { room: BrowseRoom; onTap: () => void }) {
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

// Shown in place of NotificationPreviewCard when no room has unread messages.
// Figma 599:3932 — no card chrome here (unlike the unread card's
// `--color-surface-sheet` box): just the sleeping-ghost sprite + muted copy.
export function NoNotificationsCard() {
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
// looped continuously via setInterval — the only sprite in the app still doing
// frame-cycling (ChatRoomPeekLayer's own ghost placeholder used to animate the
// same way but is now a single static frame), not worth a shared sprite-loop
// abstraction for just one consumer.
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

// Live scroll-position indicator (Figma 589:3622). `layout` + `AnimatePresence
// mode="popLayout"` is what makes the window shifting by one item (a scroll
// past a card boundary) read as the bars sliding over rather than snapping to
// a new set. Per-bar rules:
//   - color: `--color-primary` if that bar's room is `currentRoomId` (fixed to
//     that room's own position, never changes with scroll); else red if that
//     room has unread messages; else muted (Create Squad's bar is always
//     muted). Primary always wins over red/muted for the current room's bar.
//   - height: tall (16) only for whichever bar is currently FOCUSED (scrolled
//     into view) — independent of color, so a bar can be tall AND primary,
//     tall AND red, or tall AND muted.
export function ScrollEqualizerBars({
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
          const color = isCurrent ? 'var(--color-primary)' : hasUnread ? 'var(--red)' : 'var(--color-muted)'
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

// Pin/Leave Squad — the sheet a room card's long-press opens (see
// PIN_LONG_PRESS_MS above), Figma 605:3830 "chat - sheetAddMedia". Same
// minimal shell as ChatSheetReact's own long-press-opened sheet (BottomSheet +
// dismissOnPointerDown, since the opening gesture is itself a
// long-press/touch-hold): a bold "What would you like to do?" header, a Pin
// Squad `SheetActionButton` with an explanatory caption underneath, and a
// Leave Squad `SheetActionButton` below that.
//
// Pin Squad has no "unpin" path from here — matches the caption's own "one
// squad is always pinned", a real DB-enforced invariant (see the
// pin_squad_invariant migration: backfilled for every existing account, kept
// true going forward by create_crew/join_crew auto-pinning a user's first
// squad and leave_crew re-picking a replacement if the pinned squad is left) —
// unpinning entirely isn't offered, only switching the pin to a DIFFERENT
// squad. So when the long-pressed card is already the pinned one, the button
// is disabled outright (`SheetActionButton`'s `disabled` prop, which also
// renders its label/icon in `--color-tertiary`) — the heart icon swaps to a
// flat tertiary-filled variant (`pin-heart-tertiary.svg`) for the same reason
// `pin-heart.svg` itself is a static asset rather than a pixelarticons glyph:
// it's a raster/vector file with its own baked-in fill, not driven by
// `currentColor`.
//
// Both action icons are pixel-art assets exported straight from this Figma
// node (`public/icons/pin-heart.svg`, `pin-door.svg`) rather than
// pixelarticons glyphs — the heart's fill is the two-stop `--gradient-nexus`
// gradient (not flat, so `currentColor` can't reproduce it) and neither shape
// has a pixelarticons match.
export function RoomPinSheet({
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
