'use client'

import { useState } from 'react'
import { motion, AnimatePresence, useTransform, useMotionValueEvent } from 'framer-motion'
import type { MotionValue } from 'framer-motion'
import { GroupAvatar } from '@/shared/components/ui/GroupAvatar'
import { useChatRoomPeekStore } from '@/features/chat/store/chatRoomPeekStore'

// ─── ChatRoomSwipePreview (Figma 577:4895 "body") ──────────────────────────────
// Shown mid room-swipe drag (ChatInput's isRoomSwiping) — one `position: fixed`
// region spanning from the top of the screen down to the top of the real input box
// (bottom: chatInputHeight, same measurement ChatRoomPeekLayer uses to inset its own
// ghost preview), giving a quick visual hint of which room a continued swipe would
// land on. This single region is BOTH the dark scrim over the message log (`bg-black/60`,
// same tone as the kick-confirmation sheet's backdrop elsewhere in ChatInput) AND the
// flex container centering its own content (avatar row + squad name) inside it, per
// Figma's own "Body" node (`flex flex-col items-center justify-center size-full`) —
// unlike the strip's earlier bottom-pinned placement, the content now sits centered
// in the middle of the dimmed area, not hugging the input's edge. `pointerEvents: none`
// throughout — this never intercepts touches; the drag it's reacting to is owned by
// ChatSquadDetailBar.
//
// Always up to 3 avatars in fixed, direction-independent chatRoomOrder position —
// previous room, this room, next room, always in that left-to-right order — never
// reshuffled by which way the drag is heading; only each slot's SIZE responds to that
// (see `dragT`). Either end slot can be absent at a chatRoomOrder boundary, in which
// case fewer than 3 render.
//
// Below the avatar row, a Silkscreen squad-name label shows whichever room is
// currently "selected" — current by default, flipping to prev/next once `dragT`
// crosses ±0.5 (past the halfway point toward that neighbor) — see `selectedRole`.
// This crossfades between names (AnimatePresence, mode="wait") as selection changes;
// unlike the avatar bounce below, this isn't Figma motion data (the Figma frame only
// shows one static name), it's this component's own behavior per explicit request.
//
// The container's own fade-in is a plain, quick AnimatePresence transition, matching
// the mention-menu/slash-command-menu pattern already used elsewhere in ChatInput
// (sped up from that pattern's usual 0.12s to 0.08s, per explicit request to make this
// particular one snappier). Release/cancel (isRoomSwiping flips back to false) is
// deliberately NOT the same transition played backward — see the per-avatar `exit`
// below for what actually plays.
//
// Per-avatar entrance below is verbatim from get_motion_context's `times` fractions
// (nodes 577:5492/577:5496/577:5500, one shared timeline cohort rooted at 577:4893)
// — a staggered "hop up from below" that settles at y:0 and stays there. Plays ONCE
// per mount, not on a `repeat: Infinity` loop — looping it read as the avatars
// flickering up and down for as long as the strip was on screen, which is wrong: the
// hop is meant as a one-time "arriving" entrance, and the strip should otherwise sit
// still until release. Only the absolute duration was compressed (Figma's literal 2s
// down to 1s, per explicit request to speed it up) — the shape (relative
// stagger/hold timing) is untouched.
//
// Release/cancel plays each avatar's own `exit` — a reverse hop, sliding back down to
// that same track's `initialY` — rather than an instant disappear. Its delay reuses
// each track's own settle-fraction (times[times.length-2], the point where the
// entrance keyframes originally reached rest) as that avatar's exit stagger delay too,
// so the retreat preserves the same relative order/spacing the entrance arrived in:
// `current` (fastest to arrive) is first to leave, `next` (slowest to arrive) is last.
// The container's own fade-out is delayed until EXIT_TOTAL_S — every avatar has
// finished sliding down before the strip actually disappears — but that fade itself is
// deliberately quick (EXIT_FADE_S) rather than a slow crossfade, so the strip doesn't
// visibly linger once the slide is done.
//
// `overflow-hidden` on the avatar row clips any avatar that slides past the row's own
// bounds instead of letting it render outside that box as it moves — a self-contained
// clip (the row has no vertical padding of its own, per Figma), not tied to the input's
// edge the way it was before this component's content was centered rather than
// bottom-pinned.
//
// Sizes per the design-system spacing scale (.claude/skills/design-system/spacing.md
// / globals.css) and Figma 577:4895's own avatar sizes: large = var(--x15) = 56px,
// small = var(--x11) = 40px. GroupAvatar's `size` prop is typed as a plain number, so
// these are the resolved pixel values, not the CSS var strings — kept as named
// constants (rather than bare 56/40 below) so the x15/x11 intent stays visible at the
// call site.
const LARGE_SIZE   = 56
const SMALL_SIZE   = 40
const BASE_SIZE    = LARGE_SIZE
const SMALL_SCALE  = SMALL_SIZE / LARGE_SIZE
const BOUNCE_DURATION_S = 1
const BOUNCE_TRACKS = [
  { initialY: 48,     values: [48, 0, 0],             times: [0, 0.051, 1] },
  { initialY: 39.853, values: [39.853, 39.853, 0, 0], times: [0, 0.025, 0.076, 1] },
  { initialY: 39.536, values: [39.536, 39.536, 0, 0], times: [0, 0.051, 0.102, 1] },
] as const
const EXIT_DURATION_S = 0.35
const EXIT_MAX_SETTLE_FRACTION = Math.max(...BOUNCE_TRACKS.map((t) => t.times[t.times.length - 2]))
const EXIT_TOTAL_S = EXIT_DURATION_S * (1 + EXIT_MAX_SETTLE_FRACTION)
const EXIT_FADE_S  = 0.06
// How far past center `dragT` (-1..1) has to cross before the squad-name label
// switches to that neighbor — past the halfway point toward committing to it.
const SELECTION_THRESHOLD = 0.5

export interface SwipePreviewAvatar {
  id:       string
  imageUrl: string | null
  name:     string
  role:     'prev' | 'current' | 'next'
}

// role -> which BOUNCE_TRACKS entry plays under it. 'current' always carries the
// original "large" node's stagger (577:5492, index 0); 'prev'/'next' get the two
// "small" nodes (577:5496/577:5500) — fixed but otherwise arbitrary, since the two
// small tracks only differ from each other by a slightly different phase offset.
const BOUNCE_TRACK_BY_ROLE = {
  current: BOUNCE_TRACKS[0],
  prev:    BOUNCE_TRACKS[1],
  next:    BOUNCE_TRACKS[2],
} as const

interface ChatRoomSwipePreviewProps {
  visible: boolean
  slots:   SwipePreviewAvatar[]
  // Signed room-swipe drag progress, -1..1 (see ChatInput's swipeDragT) — 0 at rest
  // (current large, prev/next small); negative while dragging toward the next room
  // (next grows toward full size, current shrinks); positive toward the previous
  // room (prev grows, current shrinks) — exactly one of prev/next ever grows at a
  // time, tied continuously to whichever direction is actually being dragged toward,
  // reaching full size exactly as the drag crosses into commit range (see ChatInput's
  // SWIPE_COMMIT_PX). A MotionValue, not a number prop, so this live 60fps-during-
  // drag update never re-renders ChatInput — only this component's own transforms.
  dragT: MotionValue<number>
}

export function ChatRoomSwipePreview({ visible, slots, dragT }: ChatRoomSwipePreviewProps) {
  const currentScale = useTransform(dragT, [-1, 0, 1], [SMALL_SCALE, 1, SMALL_SCALE])
  const nextScale     = useTransform(dragT, [-1, 0, 1], [1, SMALL_SCALE, SMALL_SCALE])
  const prevScale     = useTransform(dragT, [-1, 0, 1], [SMALL_SCALE, SMALL_SCALE, 1])
  const scaleByRole = { current: currentScale, next: nextScale, prev: prevScale }
  // Same live-measured squad-bar+input height ChatRoomPeekLayer already insets its own
  // ghost preview by (see that store field's own doc comment) — reused here so this
  // region's bottom edge lines up exactly with the top of the real input box instead of
  // running underneath it.
  const chatInputHeight = useChatRoomPeekStore((s) => s.chatInputHeight)

  // Which room's name is shown below the avatars — updates only on threshold crossing
  // (not every drag frame), so this is plain React state rather than another
  // MotionValue: a name swap is a rare, discrete event, not a 60fps visual.
  const [selectedRole, setSelectedRole] = useState<SwipePreviewAvatar['role']>('current')
  useMotionValueEvent(dragT, 'change', (v) => {
    const next = v <= -SELECTION_THRESHOLD ? 'next' : v >= SELECTION_THRESHOLD ? 'prev' : 'current'
    setSelectedRole((prev) => (prev === next ? prev : next))
  })
  // Reset to 'current' at the start of every fresh gesture — `dragT` resets to 0 too
  // (ChatInput's handleTopPanStart), but without this, a gesture that last ended
  // selected on prev/next would keep showing that stale name for an instant before
  // the next drag's own movement corrects it. Adjusted during render (the "you might
  // not need an effect" pattern), not in a useEffect — this only reacts to `visible`
  // transitioning, not to every render, since `prevVisible` is only updated here too.
  const [prevVisible, setPrevVisible] = useState(visible)
  if (visible !== prevVisible) {
    setPrevVisible(visible)
    if (visible) setSelectedRole('current')
  }

  const selectedSlot = slots.find((s) => s.role === selectedRole) ?? slots.find((s) => s.role === 'current')

  return (
    <AnimatePresence>
      {visible && slots.length > 0 && (
        <motion.div
          key="room-swipe-preview"
          className="fixed left-0 right-0 top-0 bg-black/60 flex flex-col items-center justify-center"
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
            pointerEvents: 'none',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.08 } }}
          exit={{ opacity: 0, transition: { duration: EXIT_FADE_S, delay: EXIT_TOTAL_S - EXIT_FADE_S } }}
        >
          <div className="flex items-center overflow-hidden" style={{ gap: 16 }}>
            {slots.map((slot) => {
              const track = BOUNCE_TRACK_BY_ROLE[slot.role]
              return (
                // Layout box stays fixed at BASE_SIZE regardless of role/dragT — only a
                // `scale` transform changes, so the row's gap/spacing never reflows as
                // avatars grow/shrink; the size change is purely a paint-time transform.
                <motion.div
                  key={slot.id}
                  className="flex-shrink-0"
                  style={{ width: BASE_SIZE, height: BASE_SIZE, scale: scaleByRole[slot.role] }}
                >
                  <motion.div
                    initial={{ y: track.initialY }}
                    animate={{
                      y: [...track.values],
                      transition: { y: { duration: BOUNCE_DURATION_S, times: [...track.times], ease: 'linear' } },
                    }}
                    exit={{
                      y: track.initialY,
                      transition: { duration: EXIT_DURATION_S, delay: track.times[track.times.length - 2] * EXIT_DURATION_S, ease: 'easeIn' },
                    }}
                  >
                    <GroupAvatar imageUrl={slot.imageUrl} name={slot.name} size={BASE_SIZE} />
                  </motion.div>
                </motion.div>
              )
            })}
          </div>

          {selectedSlot && (
            <AnimatePresence mode="wait">
              <motion.p
                key={selectedSlot.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="font-silkscreen text-primary text-center leading-none truncate w-full min-w-0"
                style={{ fontSize: 'var(--text-md)' }}
              >
                {selectedSlot.name}
              </motion.p>
            </AnimatePresence>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
