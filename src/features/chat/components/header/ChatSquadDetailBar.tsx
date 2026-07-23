'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { ChevronUp } from 'pixelarticons/react/ChevronUp'
import { User } from 'pixelarticons/react/User'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { GroupAvatar } from '@/shared/components/ui/GroupAvatar'
import type { MemberProfile } from '@/features/chat/components/input/ChatInput'

interface ChatSquadDetailBarProps {
  crewImageUrl:  string | null | undefined
  crewName:      string
  crewLevel:     number
  memberCount:   number
  members:       MemberProfile[]
  onlineUserIds: Set<string>
  /** Fires on any tap on the bar — the caller (ChatInput) owns the actual toggle
   *  logic for whatever this opens/closes (ChatRoomBrowseSheet). */
  onTap:         () => void
}

// Shared top-to-bottom slide used by the crew image and name below — the incoming
// value enters from above, the outgoing one continues past its resting spot and out
// the bottom, so a swap reads as one continuous downward motion rather than a cut.
// `initial={false}` on each AnimatePresence keeps this from also playing on the very
// first mount of a plain room open — it only fires on an actual identity change (the
// chat-swipe-nav arrival transition — see ChatInput's barOverride mount-seeding effect).
const SLIDE_TRANSITION = { type: 'spring', stiffness: 170, damping: 21 } as const

// Figma 605:3639/605:3642's one-shot swipe-hint banner (ChatInput) uses this glyph —
// a pixel-art arrow-in-a-frame mark, not a pixelarticons icon (checked; none of the
// library's icons match this box+arrowhead shape), so the path data is reproduced
// here directly. A continuous horizontal bounce (get_motion_context): x
// 0 → 4 → 0 → 0 over 2s, linear, looping forever, solid purple throughout.
const HINT_LOOP_TRANSITION = { duration: 2, times: [0, 0.05, 0.1015, 1], ease: 'linear' as const, repeat: Infinity }
const SWIPE_HINT_LOOP = { x: [0, 4, 0, 0], transition: HINT_LOOP_TRANSITION }

export function SwipeHintIcon() {
  return (
    <motion.svg
      width={16}
      height={16}
      viewBox="0 0 13.3333 13.3333"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      initial={{ x: 0, color: '#a855f7' }}
      animate={SWIPE_HINT_LOOP}
      aria-hidden="true"
    >
      <path d="M1.33333 0H12V1.33333H1.33333V0ZM1.33333 12H12V13.3333H1.33333V12ZM0 1.33333H1.33333V12H0V1.33333ZM12 1.33333H13.3333V12H12V1.33333ZM6.04467 4.006H7.378V2.67267H6.04467V4.006ZM6.04467 10.6727H7.378V6.67267H6.04467V10.6727ZM4.71133 5.33933H8.71133V4.006H4.71133V5.33933ZM3.378 6.67267H10.0447V5.33933H3.378V6.67267Z" fill="currentColor" />
    </motion.svg>
  )
}

// Figma 637:3886's own hint icon (642:7731 "chevron_up") is a plain pixelarticons
// ChevronUp, not the box-and-arrow glyph above — a genuinely different Figma
// instance from the one-shot banner's, verified by diffing the exported path data.
// Figma's own keyframe timeline for this node (get_motion_context) loops it
// (y: 0 → -4 → 0 → 0, 300ms, linear, forever) — deliberately not reproduced here;
// this instance renders as a static icon, no animation, by request.

export function ChatSquadDetailBar({
  crewImageUrl, crewName, crewLevel, memberCount, members, onlineUserIds,
  onTap,
}: ChatSquadDetailBarProps) {
  const onlineMembers = members.filter((m) => onlineUserIds.has(m.id))

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
              {/* Figma 637:3891 — DM Sans Bold (700), not Black (900), primary color
                  (not secondary), and not uppercased (crewName renders as typed,
                  e.g. "Squad Sh*t"). */}
              <motion.p
                key={crewName}
                className="absolute inset-0 font-body font-bold text-primary leading-none truncate"
                style={{ fontSize: 16, fontVariationSettings: '"opsz" 14' }}
                initial={{ y: -16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 16, opacity: 0 }}
                transition={SLIDE_TRANSITION}
              >
                {crewName}
              </motion.p>
            </AnimatePresence>
          </div>
          {/* Figma 637:4349 "metadata" — crew level + total member count, replacing
              the former "{N} Member online" line (online status is now conveyed
              purely by the avatar row's green dots, not restated here in text). */}
          <div className="flex items-center" style={{ gap: 4 }}>
            <p className="font-silkscreen text-tertiary leading-none" style={{ fontSize: 'var(--text-xxs)' }}>
              Lv.{crewLevel}
            </p>
            <div className="w-[2px] h-[2px] bg-border-hover flex-shrink-0" aria-hidden="true" />
            <div className="flex items-center" style={{ gap: 4 }}>
              <User style={{ width: 12, height: 12, color: 'var(--color-tertiary)' }} aria-hidden="true" />
              <p className="font-silkscreen text-tertiary leading-none" style={{ fontSize: 'var(--text-xxs)' }}>
                {memberCount}
              </p>
            </div>
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
            transition={SLIDE_TRANSITION}
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

      {/* Swipe-gesture hint (Figma 637:3886 "chevron_up") — purely decorative, no
          action of its own, so a tap here bubbles up to the row's own onClick like
          the rest of the bar (same as the online-avatars row above) rather than
          stopping propagation. Static — no accompanying text label. */}
      <div className="flex-shrink-0" aria-hidden="true">
        <ChevronUp style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
      </div>
    </motion.div>
  )
}
