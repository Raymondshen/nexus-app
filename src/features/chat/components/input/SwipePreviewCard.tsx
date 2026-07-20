'use client'

import { GroupAvatar } from '@/shared/components/ui/GroupAvatar'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { supabaseImageLoader } from '@/shared/supabase/imageLoader'
import type { RoomMeta } from '@/features/chat/store/chatRoomPeekStore'
import { Check } from 'pixelarticons/react/Check'
import { Message } from 'pixelarticons/react/Message'

// One 180px squad card (Figma 582:2892 default / 582:3150 selected) — cover photo +
// gradient + small avatar, name/level/member-count, up to 4 online-member avatars, and
// a status footer. Used by ChatRoomBrowseSheet (the swipe-left/right "browse every
// room" overlay) — extracted to its own file rather than living inside that component so
// the card's own Figma provenance/markup notes stay with the card, not the sheet.
// Markup/tokens mirror `UserCard.tsx` (the sole other "180px crew-ish card with a
// cover header" in the app) rather than reinventing this shape: same width/radius/
// border tokens, same supabaseImageLoader + `--gradient-image-overlay` cover
// treatment, same online-dot styling.
//
// Pinned styling (Figma 602:4170) — same flat `--color-purple` border `selected`
// already uses (Figma's own export is `border border-[#a855f7] border-solid`, a
// solid color, not a gradient ring — despite the file defining a "nexus gradient"
// style, that gradient is only used by the badge icon below, not the border). A
// small `--color-surface-sheet` badge (Figma's own `bg-[var(--surface-sheet)]`) sits
// top-right over the cover photo, mirroring the avatar's bottom-left placement. The
// badge icon is a pixel-art heart filled with the exact `--gradient-nexus` stops
// (#a855f7 → #d946ef) — not a pixelarticons glyph (none match this shape) and not
// renderable via `currentColor` (the fill is a two-stop gradient, not flat) — so
// it's a downloaded, committed static asset (`public/icons/pin-heart.svg`), same
// pattern as `SocialLinksRow`'s brand-mark SVGs.

// Matches UserAvatar's size=24 below — reserves the online-avatars row's height
// whether or not it actually has avatars to show, so every card in the horizontally-
// scrollable row renders at the same total height instead of the ones with no (or
// hidden) online members collapsing shorter. Same "reserved slot beats letting
// content collapse the row" pattern as SquadDetailsSheet's VINYL_PILL_HEIGHT/
// BlankTickerSlot (see that file's Figma 432:7827/432:8021 comment for the bug it
// fixed there).
const ONLINE_AVATARS_ROW_HEIGHT = 24

export function SwipePreviewCard({
  room, selected, pinned = false,
}: {
  room:     RoomMeta & { id: string }
  selected: boolean
  /** Figma 602:4170 — purple border + top-right heart badge. Defaults false for
   *  callers that don't track a pin (e.g. any future reuse outside ChatRoomBrowseSheet). */
  pinned?:  boolean
}) {
  const onlineMembers = room.onlineMembers.slice(0, 4)
  const hasUnread     = room.unreadCount > 0

  return (
    <div
      className="bg-black flex flex-col flex-shrink-0 overflow-hidden rounded-[var(--x3,8px)]"
      style={{
        width:       180,
        border:      '1px solid',
        borderColor: pinned || selected ? 'var(--color-purple)' : 'var(--color-border-hover)',
      }}
    >
      <div className="relative flex-shrink-0 w-full overflow-hidden" style={{ height: 120 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- full-bleed cover fill, same pattern as UserCard/ProfileHeroBackground */}
        <img
          src={supabaseImageLoader({ src: room.backgroundImageUrl ?? '/img/default_image.png', width: 360, quality: 90 })}
          alt=""
          aria-hidden
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'var(--gradient-image-overlay)' }} />
        <div className="absolute" style={{ left: 12, bottom: 12 }}>
          <GroupAvatar imageUrl={room.imageUrl} name={room.name} size={32} />
        </div>
        {pinned && (
          <div
            className="absolute flex items-center justify-center flex-shrink-0"
            style={{
              top:           12,
              right:         4,
              padding:       'var(--x2)',
              borderRadius:  'var(--x2)',
              background:    'var(--color-surface-sheet)',
              boxShadow:     '0px 0px 10px rgba(0,0,0,0.1)',
            }}
            aria-hidden="true"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static gradient-fill asset, next/image adds no value here */}
            <img src="/icons/pin-heart.svg" alt="" style={{ width: 16, height: 'auto', display: 'block' }} />
          </div>
        )}
      </div>

      <div className="flex flex-col w-full flex-shrink-0" style={{ padding: 12, gap: 8 }}>
        <div className="flex flex-col" style={{ gap: 4 }}>
          <p className="font-body font-bold text-secondary truncate leading-none" style={{ fontSize: 16, fontVariationSettings: '"opsz" 14' }}>
            {room.name}
          </p>
          <p className="font-silkscreen text-tertiary leading-none" style={{ fontSize: 'var(--text-mini)' }}>
            Lv.{room.level} · {room.memberCount} member
          </p>
        </div>
        {/* `selected` doubles as "is the currently-open room" here (see ChatRoomBrowseSheet's
            call site) — only that room's onlineMembers is live (ChatInput's onlineUserIds);
            every other card's is a one-shot user_presence snapshot from ensureRoomMeta that
            never updates again, so showing it would read as live when it's actually stale.
            The row itself always renders at ONLINE_AVATARS_ROW_HEIGHT — a blank reserved
            slot when there's nothing to show, so cards without avatars don't collapse
            shorter than their neighbors. */}
        <div className="flex items-center flex-shrink-0" style={{ gap: 8, height: ONLINE_AVATARS_ROW_HEIGHT }}>
          {selected && onlineMembers.map((m) => (
            <div key={m.id} className="relative flex-shrink-0">
              <UserAvatar avatarUrl={m.avatarUrl} username={m.username} size={24} />
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#66bb6a] border-[1.5px] border-black" />
            </div>
          ))}
        </div>
      </div>

      <div
        className="flex items-center border-t border-b border-border flex-shrink-0"
        style={{ gap: 8, paddingLeft: 8, paddingRight: 8, paddingTop: 12, paddingBottom: 12 }}
      >
        {hasUnread ? (
          <>
            <Message style={{ width: 8, height: 8, color: 'var(--red)', flexShrink: 0 }} aria-hidden="true" />
            <p className="font-silkscreen leading-none truncate" style={{ fontSize: 'var(--text-mini)', color: 'var(--red)' }}>
              {room.unreadCount} unread message{room.unreadCount === 1 ? '' : 's'}
            </p>
          </>
        ) : (
          <>
            <Check style={{ width: 8, height: 8, color: 'var(--color-muted)', flexShrink: 0 }} aria-hidden="true" />
            <p className="font-silkscreen text-muted leading-none truncate" style={{ fontSize: 'var(--text-mini)' }}>
              {room.lastMessagePreview || 'Nothing new'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
