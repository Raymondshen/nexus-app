'use client'

import { motion, AnimatePresence, useTransform } from 'framer-motion'
import type { MotionValue } from 'framer-motion'
import { GroupAvatar } from '@/shared/components/ui/GroupAvatar'
import { useChatRoomPeekStore } from '@/features/chat/store/chatRoomPeekStore'

// ─── ChatRoomSwipePreview (Figma 577:5113 "Frame 276") ─────────────────────────
// Shown mid room-swipe drag (ChatInput's isRoomSwiping) — absolutely positioned by
// the caller directly above the squad+input bordered box (bottom-full) so it
// overlaps the bottom of the message history, giving a quick visual hint of which
// room a continued swipe would land on. Always up to 3 avatars in fixed, direction-
// independent chatRoomOrder position — previous room, this room, next room, always
// in that left-to-right order — never reshuffled by which way the drag is heading;
// only each slot's SIZE responds to that (see `dragT`). Either end slot can be
// absent at a chatRoomOrder boundary, in which case fewer than 3 render.
//
// Also renders a dark scrim (`bg-black/60`, same tone as the kick-confirmation sheet's
// backdrop elsewhere in ChatInput) over the message log while visible, so the strip
// reads as floating above the log rather than blending into whatever message content
// happens to be scrolled behind it. Sized against `chatInputHeight` (chatRoomPeekStore)
// so its bottom edge lands exactly at the top of the real input box, not underneath it
// — same measurement ChatRoomPeekLayer already uses to inset its own ghost preview.
// `pointerEvents: none` on both this and the avatar strip below — neither should
// intercept touches; the drag they're reacting to is owned by ChatSquadDetailBar.
//
// The strip's own mount-in is NOT Figma motion data — get_motion_context only animates
// the 3 avatars' continuous idle bounce (below), not an enter/exit for the container
// itself. So the container's own fade-in is a plain, quick AnimatePresence transition,
// matching the mention-menu/slash-command-menu pattern already used elsewhere in
// ChatInput (sped up from that pattern's usual 0.12s to 0.08s, per explicit request to
// make this particular one snappier). Release/cancel (isRoomSwiping flips back to
// false) is deliberately NOT the same transition played backward — see the per-avatar
// `exit` below for what actually plays.
//
// Per-avatar entrance below is verbatim from get_motion_context's `times` fractions
// (nodes 577:5117/577:5121/577:5125, one shared timeline cohort rooted at 577:4893)
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
// finished sliding down before the strip actually disappears, rather than fading
// while (or before) the slide is still visibly in progress.
// Sizes per the design-system spacing scale (.claude/skills/design-system/spacing.md
// / globals.css): large = var(--x13) = 48px, small = var(--x11) = 40px. GroupAvatar's
// `size` prop is typed as a plain number, so these are the resolved pixel values, not
// the CSS var strings — kept as named constants (rather than bare 48/40 below) so the
// x13/x11 intent stays visible at the call site.
const LARGE_SIZE   = 48
const SMALL_SIZE   = 40
const BASE_SIZE    = LARGE_SIZE
const SMALL_SCALE  = SMALL_SIZE / LARGE_SIZE
const BOUNCE_DURATION_S = 1
const BOUNCE_TRACKS = [
  { initialY: 32, values: [32, 0, 0],     times: [0, 0.051, 1] },
  { initialY: 28, values: [28, 28, 0, 0], times: [0, 0.025, 0.076, 1] },
  { initialY: 28, values: [28, 28, 0, 0], times: [0, 0.051, 0.102, 1] },
] as const
const EXIT_DURATION_S = 0.35
const EXIT_MAX_SETTLE_FRACTION = Math.max(...BOUNCE_TRACKS.map((t) => t.times[t.times.length - 2]))
const EXIT_TOTAL_S = EXIT_DURATION_S * (1 + EXIT_MAX_SETTLE_FRACTION)
const EXIT_FADE_S  = 0.12

export interface SwipePreviewAvatar {
  id:       string
  imageUrl: string | null
  name:     string
  role:     'prev' | 'current' | 'next'
}

// role -> which BOUNCE_TRACKS entry plays under it. 'current' always carries the
// original "large" node's stagger (577:5117, index 0); 'prev'/'next' get the two
// "small" nodes (577:5121/577:5125) — fixed but otherwise arbitrary, since the two
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
  // scrim's bottom edge lines up exactly with the top of the real input box instead of
  // running underneath it.
  const chatInputHeight = useChatRoomPeekStore((s) => s.chatInputHeight)

  return (
    <AnimatePresence>
      {visible && slots.length > 0 && (
        <motion.div
          key="room-swipe-overlay-backdrop"
          className="fixed left-0 right-0 top-0 bg-black/60"
          style={{
            bottom:        chatInputHeight,
            maxWidth:      480,
            marginLeft:    'auto',
            marginRight:   'auto',
            pointerEvents: 'none',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.08 } }}
          exit={{ opacity: 0, transition: { duration: EXIT_FADE_S, delay: EXIT_TOTAL_S - EXIT_FADE_S } }}
        />
      )}
      {visible && slots.length > 0 && (
        <motion.div
          key="room-swipe-preview"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.08 } }}
          exit={{ opacity: 0, transition: { duration: EXIT_FADE_S, delay: EXIT_TOTAL_S - EXIT_FADE_S } }}
          className="absolute bottom-full left-0 right-0 flex items-center"
          style={{
            gap:           8,
            paddingLeft:   'var(--space-5)',
            paddingRight:  'var(--space-5)',
            paddingTop:    'var(--space-3)',
            paddingBottom: 'var(--space-3)',
            pointerEvents: 'none',
          }}
        >
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
        </motion.div>
      )}
    </AnimatePresence>
  )
}
