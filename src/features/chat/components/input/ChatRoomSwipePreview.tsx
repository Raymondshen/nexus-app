'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { GroupAvatar } from '@/shared/components/ui/GroupAvatar'

// ─── ChatRoomSwipePreview (Figma 577:5113 "Frame 276") ─────────────────────────
// Shown mid room-swipe drag (ChatInput's isRoomSwiping) — absolutely positioned by
// the caller directly above the squad+input bordered box (bottom-full) so it
// overlaps the bottom of the message history, giving a quick visual hint of which
// room(s) a continued swipe would land on. Up to 3 avatars: the current room
// (large, 24px) plus up to 2 more rooms further along in the drag direction (small,
// 16px each) — ChatInput derives this list from chatRoomOrder + drag direction and
// passes it down already ordered current-first (see its handleTopPan).
//
// The strip's own show/hide is NOT Figma motion data — get_motion_context only
// animates the 3 avatars' continuous idle bounce (below), not an enter/exit for the
// container itself. So the mount/unmount transition here is a plain fade+slide
// AnimatePresence, matching the mention-menu/slash-command-menu pattern already used
// elsewhere in ChatInput. Released or cancelled mid-drag (isRoomSwiping flips back
// to false) plays that same transition in reverse via `exit`, leaving the strip
// fully hidden again — nothing lingers on screen once the gesture ends.
//
// Per-avatar bounce loop below is verbatim from get_motion_context (nodes
// 577:5117/577:5121/577:5125, one shared 2s-looped timeline cohort rooted at
// 577:4893) — a staggered "hop up from below" that repeats for as long as the strip
// stays mounted. Values/times are the exact keyframe data Figma returned; only the
// per-slot `initialY`/`values`/`times` differ, factored here instead of copy-pasted
// three times (see the implement-motion skill's "factor out repeated motion" rule).
const BOUNCE_TRACKS = [
  { initialY: 32, values: [32, 0, 0],     times: [0, 0.051, 1] },
  { initialY: 28, values: [28, 28, 0, 0], times: [0, 0.025, 0.076, 1] },
  { initialY: 28, values: [28, 28, 0, 0], times: [0, 0.051, 0.102, 1] },
] as const

export interface SwipePreviewAvatar {
  id:       string
  imageUrl: string | null
  name:     string
  large:    boolean
}

export function ChatRoomSwipePreview({ visible, avatars }: { visible: boolean; avatars: SwipePreviewAvatar[] }) {
  return (
    <AnimatePresence>
      {visible && avatars.length > 0 && (
        <motion.div
          key="room-swipe-preview"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.12 }}
          className="absolute bottom-full left-0 right-0 flex items-center overflow-hidden"
          style={{
            gap:           8,
            paddingLeft:   'var(--space-5)',
            paddingRight:  'var(--space-5)',
            paddingTop:    'var(--space-3)',
            paddingBottom: 'var(--space-3)',
            pointerEvents: 'none',
          }}
        >
          {avatars.slice(0, 3).map((avatar, i) => {
            const track = BOUNCE_TRACKS[i]
            return (
              <motion.div
                key={avatar.id}
                className="flex-shrink-0"
                initial={{ y: track.initialY }}
                animate={{ y: [...track.values] }}
                transition={{ y: { duration: 2, times: [...track.times], ease: 'linear', repeat: Infinity } }}
              >
                <GroupAvatar imageUrl={avatar.imageUrl} name={avatar.name} size={avatar.large ? 24 : 16} />
              </motion.div>
            )
          })}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
