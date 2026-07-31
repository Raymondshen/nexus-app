'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { ChevronUp } from 'pixelarticons/react/ChevronUp'
import { ChevronDown } from 'pixelarticons/react/ChevronDown'
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
  /** Whether ChatRoomBrowseSheet (the thing this bar's `onTap` toggles) is
   *  currently open — flips the expand-hint chevron from up to down so it keeps
   *  pointing toward whatever tapping it again would do (open below vs. close
   *  back down). */
  isSheetOpen?:  boolean
}

// Shared top-to-bottom slide used by the crew image and name below — the incoming
// value enters from above, the outgoing one continues past its resting spot and out
// the bottom, so a swap reads as one continuous downward motion rather than a cut.
// `initial={false}` on each AnimatePresence keeps this from also playing on the very
// first mount of a plain room open — it only fires on an actual identity change (the
// chat-swipe-nav arrival transition — see ChatInput's barOverride mount-seeding effect).
const SLIDE_TRANSITION = { type: 'spring', stiffness: 170, damping: 21 } as const

// Figma 637:3886's own hint icon (642:7731 "chevron_up") is a plain pixelarticons
// ChevronUp. Figma's own keyframe timeline for this node (get_motion_context) loops
// it (y: 0 → -4 → 0 → 0, 300ms, linear, forever) — deliberately not reproduced here;
// this instance renders as a static icon, no animation, by request.

export function ChatSquadDetailBar({
  crewImageUrl, crewName, crewLevel, memberCount, members, onlineUserIds,
  onTap, isSheetOpen = false,
}: ChatSquadDetailBarProps) {
  const onlineMembers = members.filter((m) => onlineUserIds.has(m.id))

  return (
    <motion.div
      className="flex relative cursor-pointer items-center w-full"
      style={{ gap: 16 }}
      onClick={onTap}
    >
      {/* Crew image + name/level (Figma 645:8038 "groupHeader", supersedes the older
          599:4015 revision) — flex-1, splitting the row equally with the online-avatars
          block below rather than a fixed 140px column; min-w-0 lets a long crew name
          truncate instead of pushing past its share. */}
      <div className="flex items-center min-w-0" style={{ gap: 12, flex: '1 0 0' }}>
        <div className="relative flex-shrink-0" style={{ width: 32, height: 32 }}>
          <AnimatePresence initial={false}>
            <motion.div
              key={crewName}
              className="absolute inset-0"
              initial={{ y: -18, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 18, opacity: 0 }}
              transition={SLIDE_TRANSITION}
            >
              <GroupAvatar imageUrl={crewImageUrl} name={crewName} size={32} />
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="flex flex-col min-w-0" style={{ gap: 2 }}>
          <div className="relative overflow-hidden" style={{ height: 18 }}>
            <AnimatePresence initial={false}>
              {/* Figma 645:8041 — DM Sans SemiBold (600) sm (14px), 0.2px tracking —
                  a step down from the older 637:3891 revision's 16px Bold. Still
                  uppercased via CSS (crewName itself stays whatever case it was
                  typed in, e.g. "Squad Sh*t" renders as "SQUAD SH*T") by the same
                  standing request that overrode 637:3891's literal as-typed
                  rendering — this redesign doesn't reverse that. */}
              <motion.p
                key={crewName}
                className="absolute inset-0 font-body font-semibold text-primary truncate uppercase"
                style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14', letterSpacing: '0.2px', lineHeight: 'normal' }}
                initial={{ y: -18, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 18, opacity: 0 }}
                transition={SLIDE_TRANSITION}
              >
                {crewName}
              </motion.p>
            </AnimatePresence>
          </div>
          {/* Figma 645:8042 "metadata" — crew level + total member count, unchanged
              from the older 637:4349 revision (online status is conveyed purely by
              the avatar row's green dots, not restated here in text). */}
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

      {/* Online member avatars only (Figma 645:8048 "avatar row") — the same flex-1
          share as groupHeader above, replacing the older revision's fixed
          maxWidth:164 cap; overflow-hidden still clips whatever doesn't fit that
          share. Slides in from the top the moment members show as online (e.g.
          shortly after landing in a room, as presence heartbeats/broadcasts arrive)
          and slides out the same way if they drop to none (e.g. the outgoing side
          of a room-swipe, which has no presence data for the destination room to
          show). Purely decorative — no per-avatar tap action — so, unlike a real
          interactive child, it does NOT stop propagation: a tap here still bubbles
          up to the row's own onClick and opens ChatRoomBrowseSheet, same as tapping
          anywhere else on the bar. */}
      <AnimatePresence initial={false}>
        {onlineMembers.length > 0 && (
          <motion.div
            key="online-row"
            initial={{ y: -18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 18, opacity: 0 }}
            transition={SLIDE_TRANSITION}
            className="flex items-center overflow-hidden min-w-0"
            style={{ gap: 8, flex: '1 0 0' }}
          >
            {onlineMembers.map((m) => (
              <div key={m.id} className="relative flex-shrink-0">
                <UserAvatar avatarUrl={m.avatar_url as string | null} username={m.username} size={24} />
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border-[1.5px] border-black" style={{ background: 'var(--color-success)' }} />
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expand hint (Figma 645:8050 "chevron_up") — purely decorative, no action of
          its own, so a tap here bubbles up to the row's own onClick like the rest of
          the bar (same as the online-avatars row above) rather than stopping
          propagation. Static — no accompanying text label. Flips to ChevronDown
          while `isSheetOpen` (ChatRoomBrowseSheet is showing), so the hint always
          points toward what tapping it again does. */}
      <div className="flex-shrink-0" aria-hidden="true">
        {isSheetOpen
          ? <ChevronDown style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
          : <ChevronUp style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />}
      </div>
    </motion.div>
  )
}
