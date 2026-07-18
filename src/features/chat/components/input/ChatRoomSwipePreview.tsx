'use client'

import { motion, AnimatePresence, useTransform } from 'framer-motion'
import type { MotionValue } from 'framer-motion'
import { GroupAvatar } from '@/shared/components/ui/GroupAvatar'

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
// The strip's own show/hide is NOT Figma motion data — get_motion_context only
// animates the 3 avatars' continuous idle bounce (below), not an enter/exit for the
// container itself. So the mount/unmount transition here is a plain fade+slide
// AnimatePresence, matching the mention-menu/slash-command-menu pattern already used
// elsewhere in ChatInput (sped up from that pattern's usual 0.12s to 0.08s, per
// explicit request to make this particular one snappier). Released or cancelled
// mid-drag (isRoomSwiping flips back to false) plays that same transition in
// reverse via `exit`, leaving the strip fully hidden again.
//
// Per-avatar bounce loop below is verbatim from get_motion_context's `times`
// fractions (nodes 577:5117/577:5121/577:5125, one shared timeline cohort rooted at
// 577:4893) — a staggered "hop up from below" that repeats for as long as the strip
// stays mounted. Only the absolute loop duration was compressed (Figma's literal 2s
// down to 1s, also per explicit request to speed it up) — the shape (relative
// stagger/hold timing) is untouched.
const BASE_SIZE    = 24
const SMALL_SCALE  = 16 / 24
const BOUNCE_DURATION_S = 1
const BOUNCE_TRACKS = [
  { initialY: 32, values: [32, 0, 0],     times: [0, 0.051, 1] },
  { initialY: 28, values: [28, 28, 0, 0], times: [0, 0.025, 0.076, 1] },
  { initialY: 28, values: [28, 28, 0, 0], times: [0, 0.051, 0.102, 1] },
] as const

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

  return (
    <AnimatePresence>
      {visible && slots.length > 0 && (
        <motion.div
          key="room-swipe-preview"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.08 }}
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
                  animate={{ y: [...track.values] }}
                  transition={{ y: { duration: BOUNCE_DURATION_S, times: [...track.times], ease: 'linear', repeat: Infinity } }}
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
