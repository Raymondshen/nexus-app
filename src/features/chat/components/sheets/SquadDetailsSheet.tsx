'use client'

import { motion } from 'framer-motion'
import { PageHeader } from '@/shared/components/ui/PageHeader'
import { MagicEdit } from 'pixelarticons/react/MagicEdit'
import { Bell } from 'pixelarticons/react/Bell'
import { BellOff } from 'pixelarticons/react/BellOff'
import { Library } from 'pixelarticons/react/Library'
import { ChevronDown } from 'pixelarticons/react/ChevronDown'
import { Button } from '@/shared/components/ui/Button'
import { SquadDetailCard, SquadMemberRow, type MiniMember } from '@/features/chat/components/sheets/SquadDetailCard'
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
// Header row (Figma 599:3842, new in this revision) — the shared `PageHeader`,
// `variant="sheet"` (Figma 599:7818 — bold non-uppercase DM Sans title, no back
// chevron), title = crew name, `right` = the action icon row: `MagicEdit`
// (creator-only), `Bell`/`BellOff`, `Library`, and a trailing `ChevronDown` that's
// an explicit close button (the icon row used to live inside the hero's top-right
// corner — moved out to this fixed header so it stays reachable regardless of
// scroll position, see the scrollable body below). Wrapped in its own
// `stopPropagation` div since PageHeader itself doesn't own that — without it, a
// tap on Bell/Library/MagicEdit would bubble up into the backdrop's own
// `onClick={onClose}` and close the sheet out from under the action. `flex-shrink-0`,
// sits above the scrollable body and never scrolls with it — same "header never
// scrolls away" treatment as the Squad Updates page (`AnnouncementsSheet.tsx`).
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
// The hero+invite card and the member row are both extracted into
// `SquadDetailCard`/`SquadMemberRow` (`SquadDetailCard.tsx`, same folder) —
// `ChatRoomBrowseSheet` (Figma 599:3931) reuses the exact same two components
// below its own Squads section, so don't re-inline this markup here again if it
// ever needs touching; edit the shared file instead.
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
      {/* Header row (Figma 599:3842) — shared PageHeader, crew name + action icons.
          Fixed above the scrollable body; see this component's top doc comment. */}
      <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <PageHeader
          title={crewName}
          variant="sheet"
          right={
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
          }
        />
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
        <SquadDetailCard
          crewName={crewName}
          crewImageUrl={crewImageUrl}
          crewBackgroundImageUrl={crewBackgroundImageUrl}
          totalMessages={totalMessages}
          xpProgress={xpProgress}
          inviteCode={inviteCode}
        />

        <SquadMemberRow
          members={members}
          onlineUserIds={onlineUserIds}
          memberMsgCounts={memberMsgCounts}
          loadingCounts={loadingCounts}
          creatorId={creatorId}
          memberPinnedVinyls={memberPinnedVinyls}
          onTapMember={onTapMember}
        />

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
