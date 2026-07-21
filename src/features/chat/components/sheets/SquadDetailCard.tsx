'use client'

import { useMemo } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { supabaseImageLoader } from '@/shared/supabase/imageLoader'
import { GroupAvatar } from '@/shared/components/ui/GroupAvatar'
import { InviteCodeCard } from '@/shared/components/ui/InviteCodeCard'
import { UserCard, type MiniMember } from '@/shared/components/ui/UserCard'

export type { MiniMember }

// ─── SquadDetailCard + SquadMemberRow ──────────────────────────────────────────
// The hero+invite card and member-card row (Figma 596:8296 "group card details" /
// 596:8481 "member row") rendered by ChatRoomBrowseSheet's Group Details section
// (Figma 599:3931) — extracted into their own file rather than inlined into that
// component, since these previously also backed the now-removed standalone
// SquadDetailsSheet overlay.

interface SquadDetailCardProps {
  crewName:                string
  crewImageUrl:            string | null
  crewBackgroundImageUrl?: string | null
  totalMessages:           number
  xpProgress:              number
  inviteCode?:             string
}

// Group card details (Figma 596:8296) — hero + invite, one rounded card.
export function SquadDetailCard({
  crewName, crewImageUrl, crewBackgroundImageUrl, totalMessages, xpProgress, inviteCode,
}: SquadDetailCardProps) {
  return (
    <div
      className="flex flex-col w-full flex-shrink-0 rounded-[var(--x3,8px)] overflow-hidden"
      style={{ backgroundColor: 'var(--color-surface-sheet)' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Hero */}
      <div
        className="relative flex flex-col justify-end overflow-hidden flex-shrink-0"
        style={{ aspectRatio: '393 / 240', padding: 16 }}
      >
        {/* Background */}
        {crewBackgroundImageUrl ? (
          <div className="absolute inset-0 pointer-events-none">
            <Image
              src={crewBackgroundImageUrl}
              alt=""
              fill
              sizes="(max-width: 480px) 100vw, 480px"
              className="object-cover"
              loader={supabaseImageLoader}
            />
          </div>
        ) : (
          <div className="absolute inset-0 bg-[var(--color-surface)]" />
        )}
        {/* Gradient overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'var(--gradient-image-overlay)' }}
        />

        {/* Heading: avatar + name + total msg + XP bar */}
        <div className="relative flex items-end w-full" style={{ gap: 8 }}>
          <GroupAvatar imageUrl={crewImageUrl} name={crewName} size={40} />
          <div className="flex flex-col flex-1 min-w-0" style={{ gap: 4 }}>
            <p
              className="font-body font-black leading-none truncate uppercase"
              style={{ fontSize: 'var(--text-md)', color: 'var(--color-secondary)', fontVariationSettings: '"opsz" 14' }}
            >
              {crewName}
            </p>
            <div className="flex flex-col w-full" style={{ gap: 8 }}>
              <p className="font-silkscreen leading-none w-full" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
                {totalMessages.toLocaleString()} total Squad msg.
              </p>
              <div className="bg-[var(--color-surface)] overflow-hidden w-full" style={{ height: 4 }}>
                <motion.div
                  className="h-full bg-purple"
                  animate={{ width: `${xpProgress}%` }}
                  transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Invite section */}
      {inviteCode && (
        <div className="w-full flex-shrink-0" style={{ padding: 16 }}>
          <InviteCodeCard inviteCode={inviteCode} />
        </div>
      )}
    </div>
  )
}

// Gap between member cards — matches the Squads list row's CARD_GAP (ChatRoomBrowseSheet)
// so the two horizontally-scrollable card rows read as one consistent spacing rhythm.
// Also referenced by the trailing spacer's width calc below.
const MEMBER_ROW_GAP = 16

interface SquadMemberRowProps {
  members:             MiniMember[]
  onlineUserIds:       Set<string>
  memberMsgCounts:     Map<string, number>
  loadingCounts:       boolean
  creatorId?:          string
  memberPinnedVinyls?: Record<string, { imageUrl: string | null; title: string | null }>
  onTapMember:         (memberId: string) => void
}

// Member card row (Figma 596:8481) — horizontally-scrollable row of member UserCards,
// online members first, then by message count.
export function SquadMemberRow({
  members, onlineUserIds, memberMsgCounts, loadingCounts, creatorId, memberPinnedVinyls, onTapMember,
}: SquadMemberRowProps) {
  // Re-sorting on every render (e.g. toggling unrelated sheet state) is wasted work
  // for a list that only actually needs re-ordering when membership, presence, or
  // message counts change.
  const sortedMembers = useMemo(() => [...members].sort((a, b) => {
    const aOnline = onlineUserIds.has(a.id) ? 1 : 0
    const bOnline = onlineUserIds.has(b.id) ? 1 : 0
    if (bOnline !== aOnline) return bOnline - aOnline
    return (memberMsgCounts.get(b.id) ?? 0) - (memberMsgCounts.get(a.id) ?? 0)
  }), [members, onlineUserIds, memberMsgCounts])

  return (
    // Bleeds past the scroll container's own `--space-5` padding so the gutter is part
    // of the scrollable content instead of static ancestor padding — otherwise dragging
    // to either end leaves the first/last member card flush against the screen edge
    // with no breathing room.
    // Full-bleed is `width: calc(100% + --space-5*2)` + `marginLeft: -var(--space-5)` —
    // NOT `marginLeft`/`marginRight` both negative on a `flex-shrink-0` box whose width
    // resolves from its parent's `w-full`. Measured via a throwaway Playwright harness
    // rendering this exact component: `margin-right` never affects an element's OWN
    // rendered edges once its width is fixed (non-auto) — it only affects the gap to
    // whatever comes after it. With `marginLeft` alone doing the "bleed", the whole box
    // just SHIFTS left by `--space-5`: the left edge lands correctly (0), but the right
    // edge shifts left too, ending up short of the true viewport edge by `2 * --space-5`.
    // Expanding `width` by `--space-5*2` while shifting the box left by `--space-5` grows
    // the box symmetrically in both directions instead.
    // The gutter itself is two real flex-item spacers, NOT `paddingLeft`/`paddingRight`
    // on the scrolling element — trailing (end-side) padding on an `overflow-x`
    // container is unreliably included in `scrollWidth` across browsers. BOTH spacers
    // are `--space-5` minus `MEMBER_ROW_GAP`, not just the trailing one — flex `gap`
    // applies on either side of a spacer (between leading-spacer↔first-card, and
    // between last-card↔trailing-spacer), so each spacer only needs to make up the
    // *remainder* of `--space-5` after its own adjacent `gap` already contributes
    // `MEMBER_ROW_GAP` of it. Same fix as the Squads row in ChatRoomBrowseSheet — see
    // that component's own comment.
    <div
      className="flex overflow-x-auto no-scrollbar nexus-scroll flex-shrink-0"
      style={{
        gap:        MEMBER_ROW_GAP,
        width:      'calc(100% + var(--space-5) * 2)',
        marginLeft: 'calc(var(--space-5) * -1)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div aria-hidden="true" className="flex-shrink-0" style={{ width: `calc(var(--space-5) - ${MEMBER_ROW_GAP}px)` }} />
      {sortedMembers.map((m) => (
        <UserCard
          key={m.id}
          profile={m}
          msgCount={memberMsgCounts.get(m.id) ?? 0}
          loading={loadingCounts}
          isOnline={onlineUserIds.has(m.id)}
          isCreator={m.id === creatorId}
          vinyl={memberPinnedVinyls?.[m.id] ?? null}
          onTap={() => onTapMember(m.id)}
        />
      ))}
      <div aria-hidden="true" className="flex-shrink-0" style={{ width: `calc(var(--space-5) - ${MEMBER_ROW_GAP}px)` }} />
    </div>
  )
}
