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
  /** Fires on any tap on the bar — the caller (ChatInput) owns the actual toggle
   *  logic for whatever this opens/closes (ChatRoomBrowseSheet). */
  onTap:         () => void
  // Bumped by ChatInput's handleTopPan the instant a pan gesture on chatInputContainer
  // locks to the vertical axis — each increment (0 is the "never fired" starting
  // value, never animated) replays the swipe-hint icon's pulse below. Bumps
  // regardless of up/down, since down is a no-op at release but still worth the
  // pulse feedback (see handleTopPan).
  verticalSwipeTick?: number
}

// Shared crossfade used by the crew image, name, and online-count text below — a
// room switch (the chat-swipe-nav arrival transition — see ChatInput's barOverride
// mount-seeding effect) reads as a clean opacity swap rather than a slide, so the
// outgoing room's identity dissolves out while the incoming one dissolves in at the
// same spot (each lives in a `relative`+`absolute inset-0` wrapper so both can overlap
// mid-crossfade instead of shoving layout). `initial={false}` on each AnimatePresence
// keeps this from also playing on the very first mount of a plain room open — it only
// fires on an actual identity change.
const FADE_TRANSITION = { duration: 0.2, ease: 'easeInOut' } as const

// Separate, unrelated spring used only by the online-avatars row's own show/hide below
// (triggered by the member-online count crossing zero, not by a room switch) — kept
// distinct from FADE_TRANSITION so that room-switch crossfade and this presence-driven
// slide can be tuned independently.
const ONLINE_ROW_SLIDE_TRANSITION = { type: 'spring', stiffness: 170, damping: 21 } as const

// Figma 596:8403's "action btns" swipe-gesture hint icon (chevron_up 599:3910) — a
// pixel-art arrow-in-a-frame glyph, not a pixelarticons icon (checked; none of the
// library's icons match this box+arrowhead mark), so the path data is reproduced
// here directly rather than as a static asset, since the fill needs to animate. A
// horizontal counterpart used to sit next to this one, hinting a swipe-left-or-right
// gesture that also opened ChatRoomBrowseSheet — removed once swipe-up itself took
// over opening that sheet, leaving only this vertical glyph.
// Literal hex, not var(--color-muted)/var(--color-purple): Framer Motion needs real
// parseable colors to interpolate a `color` keyframe list — a raw CSS var() string
// can't be blended between keyframes.
const HINT_MUTED  = '#71717a' // --color-muted
const HINT_PURPLE = '#a855f7' // --color-purple
type PulseControls = ReturnType<typeof useAnimationControls>

// Figma's own keyframe timeline for this node (get_motion_context): y goes
// 0 → -4 → 0 → 0 over 300ms, linear, at times [0, .3331, .6763, 1]. Figma shows it
// looping forever as a preview; here it's replayed once per actual swipe (see
// verticalSwipeTick) via controls.start, not left looping.
const HINT_TRANSITION = { duration: 0.3, times: [0, 0.3331, 0.6763, 1], ease: 'linear' as const }
const SWIPE_HINT_PULSE = { y: [0, -4, 0, 0], color: [HINT_MUTED, HINT_PURPLE, HINT_MUTED, HINT_MUTED], transition: HINT_TRANSITION }

// The one-shot banner's own instance of this glyph (Figma 605:3639/605:3642) has a
// different keyframe timeline (get_motion_context): a continuous horizontal bounce,
// x 0 → 4 → 0 → 0 over 2s, linear, looping forever — not the tick-triggered vertical
// pulse above. Solid purple throughout (no color keyframes) — Figma's own frozen
// export of this instance is filled #A855F7, unlike the muted-by-default persistent
// indicator.
const HINT_LOOP_TRANSITION = { duration: 2, times: [0, 0.05, 0.1015, 1], ease: 'linear' as const, repeat: Infinity }
const SWIPE_HINT_LOOP = { x: [0, 4, 0, 0], transition: HINT_LOOP_TRANSITION }

// `controls` drives ChatSquadDetailBar's own tick-triggered vertical pulse below;
// `loop` instead drives the one-shot banner's (Figma 605:3639, ChatInput) continuous
// horizontal bounce — two different Figma instances of the same glyph with
// different motion specs, so they're mutually exclusive, not shared animation state.
export function SwipeHintIcon({ controls, loop = false }: { controls?: PulseControls; loop?: boolean }) {
  return (
    <motion.svg
      width={16}
      height={16}
      viewBox="0 0 13.3333 13.3333"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      initial={loop ? { x: 0, color: HINT_PURPLE } : { y: 0, color: HINT_MUTED }}
      animate={loop ? SWIPE_HINT_LOOP : controls}
      aria-hidden="true"
    >
      <path d="M1.33333 0H12V1.33333H1.33333V0ZM1.33333 12H12V13.3333H1.33333V12ZM0 1.33333H1.33333V12H0V1.33333ZM12 1.33333H13.3333V12H12V1.33333ZM6.04467 4.006H7.378V2.67267H6.04467V4.006ZM6.04467 10.6727H7.378V6.67267H6.04467V10.6727ZM4.71133 5.33933H8.71133V4.006H4.71133V5.33933ZM3.378 6.67267H10.0447V5.33933H3.378V6.67267Z" fill="currentColor" />
    </motion.svg>
  )
}

export function ChatSquadDetailBar({
  crewImageUrl, crewName, members, onlineUserIds,
  onTap, verticalSwipeTick = 0,
}: ChatSquadDetailBarProps) {
  const onlineMembers = members.filter((m) => onlineUserIds.has(m.id))
  const swipeHintControls = useAnimationControls()

  // 0 is the untouched starting value (no gesture has happened yet on this mount) —
  // only replay the pulse on an actual increment, never on mount itself.
  useEffect(() => {
    if (verticalSwipeTick > 0) swipeHintControls.start(SWIPE_HINT_PULSE)
  }, [verticalSwipeTick]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      className="flex relative cursor-pointer items-center justify-between w-full"
      style={{ gap: 8 }}
      onClick={onTap}
    >
      {/* Crew image + name/level — fixed 140px (Figma 599:4015 "groupHeader"), not
          flex-shrink-0-and-hope: a long crew name needs a real width to truncate
          against, and this also gives the row's outer `justify-between` a stable
          left anchor to measure the online-avatars/action-btns space against. */}
      <div className="flex items-center flex-shrink-0" style={{ gap: 8, width: 140 }}>
        <div className="relative flex-shrink-0" style={{ width: 24, height: 24 }}>
          <AnimatePresence initial={false}>
            <motion.div
              key={crewName}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={FADE_TRANSITION}
            >
              <GroupAvatar imageUrl={crewImageUrl} name={crewName} size={24} />
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="flex flex-col min-w-0" style={{ gap: 2 }}>
          <div className="relative overflow-hidden" style={{ height: 16 }}>
            <AnimatePresence initial={false}>
              {/* Figma 599:4018 — DM Sans Bold (700), not Black (900), and not
                  uppercased (crewName renders as typed, e.g. "Squad Sh*t"). */}
              <motion.p
                key={crewName}
                className="absolute inset-0 font-body font-bold text-secondary leading-none truncate"
                style={{ fontSize: 16, fontVariationSettings: '"opsz" 14' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={FADE_TRANSITION}
              >
                {crewName}
              </motion.p>
            </AnimatePresence>
          </div>
          <div className="relative overflow-hidden" style={{ height: 8 }}>
            <AnimatePresence initial={false}>
              {/* Keyed by crewName (not the online count) — a room switch crossfades
                  this label same as the image/name above; the count updating within
                  the same room (presence heartbeats/broadcasts arriving) just swaps
                  the text in place with no re-animation, since the key hasn't changed. */}
              <motion.p
                key={crewName}
                className="absolute inset-0 font-silkscreen text-tertiary leading-none truncate"
                style={{ fontSize: 8 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={FADE_TRANSITION}
              >
                {onlineMembers.length} Member online
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Online member avatars only — capped to ~6 visible at once, no overflow scroll;
          extra members past the maxWidth are simply clipped. Slides in from the top the
          moment members show as online (e.g. shortly
          after landing in a room, as presence heartbeats/broadcasts arrive) and slides
          out the same way if they drop to none (e.g. the outgoing side of a room-swipe,
          which has no presence data for the destination room to show). Purely decorative
          — no per-avatar tap action — so, unlike a real interactive child, it does NOT
          stop propagation: a tap here still bubbles up to the row's own onClick and opens
          ChatRoomBrowseSheet, same as tapping anywhere else on the bar. */}
      <AnimatePresence initial={false}>
        {onlineMembers.length > 0 && (
          <motion.div
            key="online-row"
            initial={{ y: -14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 14, opacity: 0 }}
            transition={ONLINE_ROW_SLIDE_TRANSITION}
            className="flex flex-1 min-w-0 items-center overflow-hidden"
            style={{ gap: 8, maxWidth: 164 }}
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

      {/* "Swipe / view" label (two lines, Figma 599:4030 — literally "Swipe<br/>view",
          a compact stand-in for "swipe up to view [details]") + swipe-gesture hint
          icon (Figma 596:7302 "action btns") — purely decorative, no action of its
          own, so a tap here bubbles up to the row's own onClick like the rest of the
          bar (same as the online-avatars row above) rather than stopping propagation.
          Icon pulses (translate + mute→purple→mute) in place when ChatInput's
          handleTopPan detects the swipe-up gesture; the label itself is static. A
          horizontal icon used to sit alongside this one hinting a swipe-left-or-right
          gesture — removed once swipe-up took over opening ChatRoomBrowseSheet (see
          ChatInput's handleTopPanEnd), leaving this the only swipe gesture on the bar. */}
      <div
        className="flex items-center flex-shrink-0"
        style={{ gap: 4 }}
        aria-hidden="true"
      >
        <p className="font-silkscreen text-muted text-right leading-none whitespace-nowrap" style={{ fontSize: 8 }}>
          Swipe
          <br />
          view
        </p>
        <SwipeHintIcon controls={swipeHintControls} />
      </div>
    </motion.div>
  )
}
