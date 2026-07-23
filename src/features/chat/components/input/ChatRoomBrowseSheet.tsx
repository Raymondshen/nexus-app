'use client'

import { Close } from 'pixelarticons/react/Close'
import { MagicEdit } from 'pixelarticons/react/MagicEdit'
import { Bell } from 'pixelarticons/react/Bell'
import { BellOff } from 'pixelarticons/react/BellOff'
import { Library } from 'pixelarticons/react/Library'
import { PageHeader } from '@/shared/components/ui/PageHeader'
import { Button } from '@/shared/components/ui/Button'
import { SquadDetailCard, SquadMemberRow, type MiniMember } from '@/features/chat/components/sheets/SquadDetailCard'
import { useSheetDrag } from '@/shared/components/ui/sheet/useSheetDrag'
import { useChatRoomPeekStore } from '@/features/chat/store/chatRoomPeekStore'
import { motion, AnimatePresence } from 'framer-motion'

// ─── ChatRoomBrowseSheet — Group Details (Figma 642:7848 "chat - default") ───
// Opened two ways, both toggle onto the same sheet: a vertical, up-only pan
// gesture anywhere on chatInputContainer (decided at release — see ChatInput's
// handleTopPanEnd), or a plain tap on ChatSquadDetailBar (its own `onTap`,
// which just toggles ChatInput's `showRoomBrowser` state — a second tap while
// it's open closes it).
//
// This sheet is now solely the current room's own Group Details — the card +
// member row + Leave Squad button for whichever room this sheet was opened
// FROM. Quick-switching rooms and the Notifications feed used to live here too
// (Figma 589:3619) but moved to their own standalone page, ChatSquadsPage.tsx
// (`/chat/[crewId]/squads`, reached via ChatFloatingNav's Menu button) — see
// that file's own doc comment for the split rationale and for
// NotificationPreviewCard/ScrollEqualizerBars/etc., which moved with it into
// SquadsListShared.tsx rather than staying here unused. Renders nothing when
// `squadDetail` is null (the DM screen — a DM has no group/squad to show
// details for; that used to still open this sheet showing just the
// Notifications+Squads content, which no longer lives here either).
//
// Header: the shared `PageHeader`, `variant="sheet"` `titleColor="primary"` —
// same component/props shape ChatSquadsPage.tsx's own header uses, just with
// the current room's name as the title instead of "Squads", and a 4-icon
// `right` instead of a bare Close. No decorative leading icon (Figma 642:7848
// has none, unlike the older combined sheet's ChevronRight-before-title). All
// four action icons — `MagicEdit` (creator-only), `Bell`/`BellOff`, `Library`,
// `Close` — stay visible/tappable at all times now: the old scroll-position
// fade (MagicEdit/Library dimmed until the user scrolled past
// Notifications/Squads onto Group Details) no longer applies since Group
// Details is the only content left. Icon order (`MagicEdit, Bell, Library,
// Close`) matches Figma 642:7848 exactly — verified by diffing each icon's
// exported SVG path against its pixelarticons equivalent; this is a genuine
// reorder from the previous `MagicEdit, Library, Bell, Close`. The header row
// is wrapped in its own `stopPropagation` div since the sheet root's own
// `onClick={onClose}` would otherwise also fire on every header button tap —
// harmless for Close (already idempotent) but wrong for Notif, which should
// open `NotifSheet` on top without dismissing this sheet underneath.
//
// Body: plain `overflow-y-auto` scroll, no `scroll-snap-type` (that existed
// only to snap between the now-removed Notifications+Squads page and this
// one) — just the card + member row + Leave Squad button in normal document
// flow. No "Group Details" section label above the card either — Figma
// 642:7848 goes straight from header to card with no redundant label, same
// reasoning ChatSquadsPage.tsx's own header doesn't repeat "Squads" as a body
// label.
export interface SquadDetailInfo {
  crewName:                string
  crewImageUrl:            string | null
  crewBackgroundImageUrl?: string | null
  totalMessages:           number
  xpProgress:              number
  inviteCode?:             string
  creatorId?:              string
  members:                 MiniMember[]
  onlineUserIds:           Set<string>
  memberMsgCounts:         Map<string, number>
  loadingCounts:           boolean
  memberPinnedVinyls?:     Record<string, { imageUrl: string | null; title: string | null }>
  onTapMember:             (memberId: string) => void
  /** Figma 642:7998 "leave squad" — optional; omitted (button hidden) if the
   *  caller has no leave flow to offer. */
  onLeave?:                () => void
}

export function ChatRoomBrowseSheet({
  visible,
  squadDetail,
  currentUserId,
  allMuted,
  onEditSquad,
  onNotif,
  onLibrary,
  onClose,
}: {
  visible:       boolean
  /** Detail card + member row for the current room — null on the DM screen,
   *  in which case this component renders nothing at all. */
  squadDetail:   SquadDetailInfo | null
  /** Compared against `squadDetail.creatorId` to gate the header's MagicEdit icon. */
  currentUserId: string
  /** Drives the header's Bell/BellOff icon. */
  allMuted:      boolean
  /** Header MagicEdit tap (creator only) — opens Manage Squad Profile. */
  onEditSquad:   () => void
  /** Header Bell/BellOff tap — opens NotifSheet on top, this sheet stays open. */
  onNotif:       () => void
  /** Header Library tap — navigates to the squad's definitions page. */
  onLibrary:     () => void
  onClose:       () => void
}) {
  const chatInputHeight = useChatRoomPeekStore((s) => s.chatInputHeight)

  // Pull-to-close — see useSheetDrag's own doc comment.
  const { sheetRef, dragProps } = useSheetDrag(onClose)

  if (!squadDetail) return null

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="room-browse-sheet"
          ref={sheetRef}
          className="fixed left-0 right-0 top-0 bg-black/95 flex flex-col"
          style={{
            bottom:     chatInputHeight,
            maxWidth:   480,
            marginLeft:  'auto',
            marginRight: 'auto',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.2, ease: 'easeInOut' } }}
          exit={{ opacity: 0, transition: { duration: 0.2, ease: 'easeInOut' } }}
          {...dragProps}
          // Override useSheetDrag's own bottom elasticity (1 = follows the finger 1:1,
          // what BottomSheet's panel wants) down to 0 — this sheet
          // shouldn't visually translate while being pulled at all, just stay put and let
          // the release-triggered `exit` fade (above) be the only close animation.
          dragElastic={{ top: 0, bottom: 0 }}
          onClick={onClose}
        >
          <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <PageHeader
              title={squadDetail.crewName}
              variant="sheet"
              titleColor="primary"
              right={
                <div className="flex items-center flex-shrink-0" style={{ gap: 16 }}>
                  {currentUserId === squadDetail.creatorId && (
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
                    type="button"
                    onClick={onNotif}
                    className="flex-shrink-0 appearance-none flex items-center justify-center"
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
                    type="button"
                    onClick={onClose}
                    className="flex-shrink-0 appearance-none flex items-center justify-center"
                    style={{ width: 24, height: 24 }}
                    aria-label="Close"
                  >
                    <Close style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
                  </button>
                </div>
              }
            />
          </div>

          <div
            className="flex flex-col w-full min-h-0 overflow-y-auto nexus-scroll"
            style={{
              gap:            'var(--space-5)',
              flex:           '1 1 auto',
              paddingLeft:    'var(--space-5)',
              paddingRight:   'var(--space-5)',
              paddingBottom:  'var(--space-5)',
            }}
          >
            <SquadDetailCard
              crewName={squadDetail.crewName}
              crewImageUrl={squadDetail.crewImageUrl}
              crewBackgroundImageUrl={squadDetail.crewBackgroundImageUrl}
              totalMessages={squadDetail.totalMessages}
              xpProgress={squadDetail.xpProgress}
              inviteCode={squadDetail.inviteCode}
            />
            <SquadMemberRow
              members={squadDetail.members}
              onlineUserIds={squadDetail.onlineUserIds}
              memberMsgCounts={squadDetail.memberMsgCounts}
              loadingCounts={squadDetail.loadingCounts}
              creatorId={squadDetail.creatorId}
              memberPinnedVinyls={squadDetail.memberPinnedVinyls}
              onTapMember={squadDetail.onTapMember}
            />

            {squadDetail.onLeave && (
              <div className="w-full flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <Button variant="outlined" color="red" onClick={squadDetail.onLeave} className="w-full">
                  Leave Squad
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
