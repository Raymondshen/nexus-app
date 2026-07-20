'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { GroupAvatar } from '@/shared/components/ui/GroupAvatar'
import type { MemberProfile } from '@/features/chat/components/input/ChatInput'

interface ChatSquadDetailBarProps {
  crewImageUrl:  string | null | undefined
  crewName:      string
  members:       MemberProfile[]
  onlineUserIds: Set<string>
  onExpand:      () => void
  // Bumped by ChatInput's handleTopPan the instant a pan gesture on chatInputContainer
  // locks to that axis — each increment (0 is the "never fired" starting value,
  // never animated) replays that icon's swipe-hint pulse below. Only ever increments
  // while the dev-gated swipe gesture is enabled (see ChatInput's chatSwipeNavEnabled)
  // — for everyone else these stay 0 and the icons just sit at rest. verticalSwipeTick
  // hints the swipe-up-opens-SquadDetailsSheet gesture; horizontalSwipeTick hints
  // swipe-right-opens-ChatRoomBrowseSheet specifically (it only bumps for an actually
  // rightward drag with somewhere to browse — see handleTopPan).
  verticalSwipeTick?:   number
  horizontalSwipeTick?: number
}

// Shared top-to-bottom slide used by the crew image and name below — the incoming
// value enters from above, the outgoing one continues past its resting spot and out
// the bottom, so a swap reads as one continuous downward motion rather than a cut.
// `initial={false}` on each AnimatePresence keeps this from also playing on the very
// first mount of a plain room open — it only fires on an actual identity change (the
// chat-swipe-nav arrival transition — see ChatInput's barOverride mount-seeding effect).
const SLIDE_TRANSITION = { type: 'spring', stiffness: 170, damping: 21 } as const

// Figma 596:3356's "action btns" swipe-gesture hint icons (596:6986/596:7003) — a
// pixel-art arrow-in-a-frame glyph, not a pixelarticons icon (checked; none of the
// library's icons match this box+arrowhead mark), so the path data is reproduced
// here directly rather than as a static asset, since the fill needs to animate.
// Literal hex, not var(--color-muted)/var(--color-purple): Framer Motion needs real
// parseable colors to interpolate a `color` keyframe list — a raw CSS var() string
// can't be blended between keyframes.
const HINT_MUTED  = '#71717a' // --color-muted
const HINT_PURPLE = '#a855f7' // --color-purple
type PulseControls = ReturnType<typeof useAnimationControls>

// Figma's own keyframe timeline for these nodes (get_motion_context): y/x go
// 0 → ±4 → 0 → 0 over 300ms, linear, at times [0, .3331, .6763, 1]. Figma shows it
// looping forever as a preview; here it's replayed once per actual swipe (see
// verticalSwipeTick/horizontalSwipeTick) via controls.start, not left looping.
const HINT_TRANSITION = { duration: 0.3, times: [0, 0.3331, 0.6763, 1], ease: 'linear' as const }
const VERTICAL_PULSE   = { y: [0, -4, 0, 0], color: [HINT_MUTED, HINT_PURPLE, HINT_MUTED, HINT_MUTED], transition: HINT_TRANSITION }
const HORIZONTAL_PULSE = { x: [0, 4, 0, 0],  color: [HINT_MUTED, HINT_PURPLE, HINT_MUTED, HINT_MUTED], transition: HINT_TRANSITION }

// controls is optional so the same icon can render statically (Figma 596:7443's
// one-time banner in ChatInput — see that component) without needing a dummy
// AnimationControls that never starts.
export function SwipeHintIcon({ axis, controls }: { axis: 'vertical' | 'horizontal'; controls?: PulseControls }) {
  const d = axis === 'vertical'
    ? 'M1.33333 0H12V1.33333H1.33333V0ZM1.33333 12H12V13.3333H1.33333V12ZM0 1.33333H1.33333V12H0V1.33333ZM12 1.33333H13.3333V12H12V1.33333ZM6.04467 4.006H7.378V2.67267H6.04467V4.006ZM6.04467 10.6727H7.378V6.67267H6.04467V10.6727ZM4.71133 5.33933H8.71133V4.006H4.71133V5.33933ZM3.378 6.67267H10.0447V5.33933H3.378V6.67267Z'
    : 'M1.33333 0H12V1.33333H1.33333V0ZM1.33333 12H12V13.3333H1.33333V12ZM0 1.33333H1.33333V12H0V1.33333ZM12 1.33333H13.3333V12H12V1.33333ZM9.378 6.006V7.33933H10.7113V6.006H9.378ZM2.71133 6.006V7.33933H6.71133V6.006H2.71133ZM8.04467 4.67267V8.67267H9.378V4.67267H8.04467ZM6.71133 3.33933V10.006H8.04467V3.33933H6.71133Z'
  return (
    <motion.svg
      width={16}
      height={16}
      viewBox="0 0 13.3333 13.3333"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      initial={{ y: 0, x: 0, color: HINT_MUTED }}
      animate={controls}
      aria-hidden="true"
    >
      <path d={d} fill="currentColor" />
    </motion.svg>
  )
}

export function ChatSquadDetailBar({
  crewImageUrl, crewName, members, onlineUserIds,
  onExpand, verticalSwipeTick = 0, horizontalSwipeTick = 0,
}: ChatSquadDetailBarProps) {
  const onlineMembers = members.filter((m) => onlineUserIds.has(m.id))
  const verticalControls   = useAnimationControls()
  const horizontalControls = useAnimationControls()

  // 0 is the untouched starting value (no gesture has happened yet on this mount) —
  // only replay the pulse on an actual increment, never on mount itself.
  useEffect(() => {
    if (verticalSwipeTick > 0) verticalControls.start(VERTICAL_PULSE)
  }, [verticalSwipeTick]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (horizontalSwipeTick > 0) horizontalControls.start(HORIZONTAL_PULSE)
  }, [horizontalSwipeTick]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      className="flex relative cursor-pointer items-center justify-between w-full"
      onClick={onExpand}
    >
      {/* Crew image + name/level */}
      <div className="flex items-center flex-shrink-0 min-w-0" style={{ gap: 8 }}>
        <div className="relative flex-shrink-0" style={{ width: 24, height: 24 }}>
          <AnimatePresence initial={false}>
            <motion.div
              key={crewName}
              className="absolute inset-0"
              initial={{ y: -14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 14, opacity: 0 }}
              transition={SLIDE_TRANSITION}
            >
              <GroupAvatar imageUrl={crewImageUrl} name={crewName} size={24} />
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="flex flex-col min-w-0" style={{ gap: 2 }}>
          <div className="relative overflow-hidden" style={{ height: 16 }}>
            <AnimatePresence initial={false}>
              <motion.p
                key={crewName}
                className="absolute inset-0 font-body font-black text-secondary leading-none truncate"
                style={{ fontSize: 16, fontVariationSettings: '"opsz" 14' }}
                initial={{ y: -16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 16, opacity: 0 }}
                transition={SLIDE_TRANSITION}
              >
                {crewName.toUpperCase()}
              </motion.p>
            </AnimatePresence>
          </div>
          <p className="font-silkscreen text-tertiary leading-none" style={{ fontSize: 8 }}>
            {onlineMembers.length} Member online
          </p>
        </div>
      </div>

      {/* Online member avatars only — capped to ~6 visible at once, no overflow scroll;
          extra members past the maxWidth are simply clipped. Slides in from the top the
          moment members show as online (e.g. shortly
          after landing in a room, as presence heartbeats/broadcasts arrive) and slides
          out the same way if they drop to none (e.g. the outgoing side of a room-swipe,
          which has no presence data for the destination room to show). */}
      <AnimatePresence initial={false}>
        {onlineMembers.length > 0 && (
          <motion.div
            key="online-row"
            initial={{ y: -14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 14, opacity: 0 }}
            transition={SLIDE_TRANSITION}
            className="flex flex-1 min-w-0 items-center overflow-hidden"
            style={{ gap: 4, marginLeft: 16, marginRight: 16, maxWidth: 164 }}
            onClick={(e) => e.stopPropagation()}
          >
            {onlineMembers.map((m) => (
              <div key={m.id} className="relative flex-shrink-0">
                <UserAvatar avatarUrl={m.avatar_url as string | null} username={m.username} size={24} />
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#66bb6a] border-[1.5px] border-black" />
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* "Swipe" label + swipe-gesture hint icons (Figma 596:7302 "action btns") —
          purely decorative and NOT a tap-to-expand target: stops propagation so a
          tap here doesn't also open SquadDetailsSheet via the row's own onClick
          (same pattern as the online-avatars row above). Icons pulse (translate +
          mute→purple→mute) in place when ChatInput's handleTopPan detects the
          matching swipe direction; the label itself is static. */}
      <div
        className="flex items-center flex-shrink-0"
        style={{ gap: 4 }}
        aria-hidden="true"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-silkscreen text-muted text-right leading-none whitespace-nowrap" style={{ fontSize: 8 }}>
          Swipe
        </p>
        <SwipeHintIcon axis="vertical" controls={verticalControls} />
        <SwipeHintIcon axis="horizontal" controls={horizontalControls} />
      </div>
    </motion.div>
  )
}
