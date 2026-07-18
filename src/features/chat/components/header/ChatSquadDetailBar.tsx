'use client'

import { motion, AnimatePresence } from 'framer-motion'
import type { PanInfo } from 'framer-motion'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { GroupAvatar } from '@/shared/components/ui/GroupAvatar'
import { ChevronUp } from 'pixelarticons/react/ChevronUp'
import type { MemberProfile } from '@/features/chat/components/input/ChatInput'

interface ChatSquadDetailBarProps {
  crewImageUrl:  string | null | undefined
  crewName:      string
  crewLevel:     number
  memberCount:   number
  members:       MemberProfile[]
  onlineUserIds: Set<string>
  onExpand:      () => void
  onPanStart?:   () => void
  onPan?:        (_: PointerEvent, info: PanInfo) => void
  onPanEnd:      (_: PointerEvent, info: PanInfo) => void
}

// Top-to-bottom slide used by the online-avatars row below — it enters from above when
// members show as online (e.g. shortly after landing in a room, as presence
// heartbeats/broadcasts arrive) and exits the same way if they drop to none.
// `initial={false}` keeps this from also playing on the row's very first mount.
const SLIDE_TRANSITION = { type: 'spring', stiffness: 170, damping: 21 } as const

export function ChatSquadDetailBar({
  crewImageUrl, crewName, crewLevel, memberCount, members, onlineUserIds,
  onExpand, onPanStart, onPan, onPanEnd,
}: ChatSquadDetailBarProps) {
  const onlineMembers = members.filter((m) => onlineUserIds.has(m.id))

  return (
    <motion.div
      className="flex relative cursor-pointer items-center justify-between w-full"
      style={{ touchAction: 'pan-x' }}
      onPanStart={onPanStart}
      onPan={onPan}
      onPanEnd={onPanEnd}
      onClick={onExpand}
    >
      {/* Crew image + name/level */}
      <div className="flex items-center flex-shrink-0 min-w-0" style={{ gap: 8 }}>
        <div className="relative flex-shrink-0" style={{ width: 24, height: 24 }}>
          <GroupAvatar imageUrl={crewImageUrl} name={crewName} size={24} />
        </div>
        <div className="flex flex-col min-w-0" style={{ gap: 2 }}>
          <p
            className="font-body font-black text-secondary leading-none truncate"
            style={{ fontSize: 16, fontVariationSettings: '"opsz" 14', height: 16 }}
          >
            {crewName.toUpperCase()}
          </p>
          <p className="font-silkscreen text-tertiary leading-none" style={{ fontSize: 8 }}>
            Lv.{crewLevel} · {memberCount} member
          </p>
        </div>
      </div>

      {/* Online member avatars only — up to 6 visible at once, scroll horizontally for
          more. Slides in from the top the moment members show as online (e.g. shortly
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
            className="flex flex-1 min-w-0 items-center overflow-x-auto nexus-scroll no-scrollbar"
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

      {/* Expand chevron */}
      <button
        onClick={(e) => { e.stopPropagation(); onExpand() }}
        className="flex items-center justify-center flex-shrink-0"
        style={{ width: 24, height: 24 }}
        aria-label="Show squad details"
      >
        <ChevronUp style={{ width: 24, height: 24, color: 'var(--color-tertiary)' }} aria-hidden="true" />
      </button>
    </motion.div>
  )
}
