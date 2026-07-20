'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { supabaseImageLoader } from '@/shared/supabase/imageLoader'
import { GroupAvatar } from '@/shared/components/ui/GroupAvatar'
import { MagicEdit } from 'pixelarticons/react/MagicEdit'
import { Bell } from 'pixelarticons/react/Bell'
import { BellOff } from 'pixelarticons/react/BellOff'
import { Library } from 'pixelarticons/react/Library'
import { ChevronDown } from 'pixelarticons/react/ChevronDown'
import { Button } from '@/shared/components/ui/Button'
import { InviteCodeCard } from '@/shared/components/ui/InviteCodeCard'
import { UserCard, type MiniMember } from '@/shared/components/ui/UserCard'
import { useSheetDrag } from '@/shared/components/ui/sheet/useSheetDrag'
import { useChatRoomPeekStore } from '@/features/chat/store/chatRoomPeekStore'

export type { MiniMember }

interface SquadDetailsSheetProps {
  crewName:                string
  memberCount:             number
  crewImageUrl:            string | null
  crewBackgroundImageUrl?: string | null
  members:                 MiniMember[]
  onlineUserIds:           Set<string>
  crewXP:                  number
  crewLevel:               number
  xpProgress:              number
  totalMessages:           number
  inviteCode?:             string
  creatorId?:              string
  currentUserId:           string
  memberMsgCounts:         Map<string, number>
  loadingCounts:           boolean
  allMuted:                boolean
  memberPinnedVinyls?:     Record<string, { imageUrl: string | null; title: string | null }>
  /** Creator-only — opens the full-screen Manage Squad Profile page (owned by ChatInput). */
  onEditSquad:             () => void
  onTapMember:             (memberId: string) => void
  onNotif:                 () => void
  onLibrary:               () => void
  onLeave?:                () => void
  onClose:                 () => void
}

// ─── SquadDetailsSheet (Figma 596:8291 "body") ─────────────────────────────────
// Same overlay + transition as ChatRoomBrowseSheet — not a docked bottom-sheet
// panel anymore. `fixed left-0 right-0 top-0` down to `bottom: chatInputHeight`
// (leaving the composer visible below, same as the browse sheet), 85% black
// backdrop, opacity-only enter/exit (no y-slide), and the same drag-to-dismiss
// via `useSheetDrag` with elasticity zeroed out so the content doesn't visually
// translate while being pulled — only the release-triggered fade closes it.
// Tapping anywhere in the backdrop area (outside the header row, hero/invite
// card, and the member row) calls `onClose`, matching the browse sheet's "tap
// outside to dismiss" behavior; all three of those content blocks stop click
// propagation so taps inside them don't also bubble into the backdrop's onClose.
//
// Header row (Figma 599:3842, new in this revision) — crew name (plain title
// text, not inside the hero) + the action icon row: `MagicEdit` (creator-only),
// `Bell`/`BellOff`, `Library`, and a trailing `ChevronDown` that's an explicit
// close button (the icon row used to live inside the hero's top-right corner —
// moved out to this fixed header so it stays reachable regardless of scroll
// position, see the scrollable body below). `flex-shrink-0`, sits above the
// scrollable body and never scrolls with it — same "header never scrolls away"
// treatment as the Squad Updates page (`AnnouncementsSheet.tsx`).
//
// Body (hero+invite card, member row, Leave Squad) is wrapped in its own
// `flex-1 min-h-0 overflow-y-auto` region below the header — required both to
// let the body actually scroll when its content is taller than the available
// height, and for `useSheetDrag`'s `canDragFrom` ancestor-walk to find it: that
// walk stops at (excludes) the sheet root itself, so a scrollable root can never
// be detected as "the inner scroller" and drag-to-dismiss would hijack every
// vertical touch instead of letting the body scroll. Nesting the scrollable
// region one level below the root — the same shape `BottomSheet` callers and
// `AnnouncementsSheet` already use — is what makes the ancestor walk find it.
//
// Figma's hero+invite card is one rounded (8px, all four corners — not just the
// top two) `--color-surface-sheet` card, dropping the header's former close
// chevron (dismissal is backdrop-tap/drag now, same as the browse sheet) and the
// "Lv.{n} · {count} members" / XP-fraction text — the heading row is just
// avatar + name + "{totalMessages} total Squad msg." + the XP progress bar.
// `InviteCodeCard`'s border was also fixed to purple here (Figma 438:8098 always
// specified `border-[#a855f7]`; the shared component had drifted to a plain
// `border-border` gray) — see InviteCodeCard.tsx.
//
// Leave Squad isn't part of this Figma crop, but the app still needs a way out
// of a squad — kept as a plain flex child below the member row rather than a
// docked `SheetFooter`, since this overlay no longer has sheet chrome to dock a
// footer against (mirrors how the browse sheet's own sections are just flex
// children of the overlay, no docked footer either).
export function SquadDetailsSheet({
  crewName, crewImageUrl, crewBackgroundImageUrl, members, onlineUserIds,
  xpProgress, totalMessages, inviteCode, creatorId,
  currentUserId, memberMsgCounts, loadingCounts, allMuted, memberPinnedVinyls,
  onEditSquad, onTapMember, onNotif, onLibrary,
  onLeave, onClose,
}: SquadDetailsSheetProps) {
  const chatInputHeight = useChatRoomPeekStore((s) => s.chatInputHeight)

  // Pull-to-close drag that coexists with the member row's inner horizontal
  // scroll — the same gesture the standard BottomSheet/ChatRoomBrowseSheet use.
  const { sheetRef, dragProps } = useSheetDrag(onClose)

  // Re-sorting on every render (e.g. toggling the edit sheet) is wasted work
  // for a list that only actually needs re-ordering when membership, presence,
  // or message counts change.
  const sortedMembers = useMemo(() => [...members].sort((a, b) => {
    const aOnline = onlineUserIds.has(a.id) ? 1 : 0
    const bOnline = onlineUserIds.has(b.id) ? 1 : 0
    if (bOnline !== aOnline) return bOnline - aOnline
    return (memberMsgCounts.get(b.id) ?? 0) - (memberMsgCounts.get(a.id) ?? 0)
  }), [members, onlineUserIds, memberMsgCounts])

  return (
    <motion.div
      ref={sheetRef}
      className="fixed left-0 right-0 top-0 bg-black/85 flex flex-col"
      style={{
        bottom:     chatInputHeight,
        maxWidth:   480,
        marginLeft: 'auto',
        marginRight: 'auto',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.12 } }}
      exit={{ opacity: 0, transition: { duration: 0.2, ease: 'easeInOut' } }}
      {...dragProps}
      // Same override as ChatRoomBrowseSheet — the content shouldn't visually
      // translate while being pulled, just stay put and let the release-triggered
      // `exit` fade be the only close animation.
      dragElastic={{ top: 0, bottom: 0 }}
      onClick={onClose}
    >
      {/* Header row (Figma 599:3842) — crew name + action icons. Fixed above the
          scrollable body; see this component's top doc comment. */}
      <div
        className="flex items-center justify-between w-full flex-shrink-0"
        style={{
          gap:           16,
          paddingLeft:   'var(--space-5)',
          paddingRight:  'var(--space-5)',
          paddingTop:    'max(env(safe-area-inset-top), var(--space-5))',
          paddingBottom: 'var(--space-5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p
          className="font-body font-bold leading-none truncate uppercase min-w-0"
          style={{ fontSize: 'var(--text-md)', color: 'var(--color-secondary)', fontVariationSettings: '"opsz" 14' }}
        >
          {crewName}
        </p>
        <div className="flex items-center flex-shrink-0" style={{ gap: 16 }}>
          {currentUserId === creatorId && (
            <button
              onClick={onEditSquad}
              className="flex items-center justify-center"
              style={{ width: 24, height: 24 }}
              aria-label="Edit squad details"
            >
              <MagicEdit style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
            </button>
          )}
          <button
            onClick={onNotif}
            className="flex items-center justify-center"
            style={{ width: 24, height: 24, color: allMuted ? 'var(--color-muted)' : 'var(--color-primary)' }}
            aria-label={allMuted ? 'Notifications muted' : 'Notification settings'}
          >
            {allMuted
              ? <BellOff style={{ width: 24, height: 24 }} aria-hidden="true" />
              : <Bell style={{ width: 24, height: 24 }} aria-hidden="true" />}
          </button>
          <button
            onClick={onLibrary}
            className="flex items-center justify-center"
            style={{ width: 24, height: 24 }}
            aria-label="Squad glossary"
          >
            <Library style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
          </button>
          <button
            onClick={onClose}
            className="flex items-center justify-center"
            style={{ width: 24, height: 24 }}
            aria-label="Close squad details"
          >
            <ChevronDown style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Scrollable body — see this component's top doc comment for why this needs
          to be a nested region rather than making the root itself scrollable. */}
      <div
        className="flex-1 min-h-0 overflow-y-auto nexus-scroll flex flex-col w-full"
        style={{
          gap:           'var(--space-5)',
          paddingLeft:   'var(--space-5)',
          paddingRight:  'var(--space-5)',
          paddingBottom: 'var(--space-5)',
        }}
      >
        {/* Group card details (Figma 596:8296) — hero + invite, one rounded card */}
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

        {/* Member card row (Figma 596:8481) */}
        <div
          className="flex overflow-x-auto no-scrollbar nexus-scroll w-full flex-shrink-0"
          style={{ gap: 8 }}
          onClick={(e) => e.stopPropagation()}
        >
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
        </div>

        {onLeave && (
          <div className="w-full flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button variant="outlined" color="red" onClick={onLeave} className="w-full">
              Leave Squad
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  )
}
