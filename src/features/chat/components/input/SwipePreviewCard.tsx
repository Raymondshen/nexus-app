'use client'

import { GroupAvatar } from '@/shared/components/ui/GroupAvatar'
import { supabaseImageLoader } from '@/shared/supabase/imageLoader'
import type { RoomMeta } from '@/features/chat/store/chatRoomPeekStore'
import { User } from 'pixelarticons/react/User'

// One 180×240 squad card (Figma 674:14650 pinned / 674:14663 default) — full-bleed
// cover photo + `--gradient-image-overlay` scrim (see the design-system skill's
// gradients.md — same token `SquadDetailCard`'s hero uses for this exact
// "bottom-anchored text over a full cover image" shape, not a hand-rolled rgba
// gradient) with avatar/name/level/member-count anchored to the bottom. Used by
// ChatRoomBrowseSheet (the swipe-left/right "browse every room" overlay) —
// extracted to its own file rather than living inside that component so the card's
// own Figma provenance/markup notes stay with the card, not the sheet.
//
// This replaced an earlier two-zone design (a 120px photo header, then a separate
// solid-background info block below it with online-member avatars and an
// unread-message footer strip) — none of that survived into 674:14650/674:14663,
// which show only avatar+name+level+count over the full image. There's no more
// per-card online-avatars row or unread-message strip; the equalizer bars in
// ChatRoomBrowseSheet's header already surface unread state per room.
//
// Pinned styling merges what used to be two independent indicators (a
// `--color-primary` border for the currently-open room, and a badge for the pinned
// room with no border effect of its own) into one: only the pinned room gets a
// border now, in `--color-purple`, plus the top-right badge — confirmed against
// this design, which shows the border and badge only ever appearing together. The
// badge icon is a pixel-art heart filled with the exact `--gradient-nexus` stops
// (#a855f7 → #d946ef) — not a pixelarticons glyph (none match this shape) and not
// renderable via `currentColor` (the fill is a two-stop gradient, not flat) — so
// it's a downloaded, committed static asset (`public/icons/pin-heart.svg`), same
// pattern as `SocialLinksRow`'s brand-mark SVGs.
//
// A separate `isCurrent` border was reinstated on top of that merge (Figma's
// current export doesn't show this state, but it's explicit product direction):
// the room you're actually chatting in — `ChatRoomBrowseSheet`'s `currentRoomId` —
// gets a `--color-tertiary` border when it isn't also the pinned room. Pinned
// still wins outright (purple + badge) if a room is both current and pinned; the
// two states are mutually exclusive borders, never combined/doubled.

export function SwipePreviewCard({
  room, pinned = false, isCurrent = false,
}: {
  room:      RoomMeta & { id: string }
  /** Figma 674:14650 — top-right badge AND the card's purple border (see this
   *  file's own doc comment for why these two merged). Defaults false for callers
   *  that don't track a pin (e.g. any future reuse outside ChatRoomBrowseSheet). */
  pinned?:   boolean
  /** The room actually open in chat right now — tertiary border, badge-less.
   *  Ignored (no border) when `pinned` is also true. */
  isCurrent?: boolean
}) {
  return (
    <div
      className="relative flex-shrink-0 overflow-hidden rounded-[var(--x3,8px)]"
      style={{
        width:  180,
        height: 240,
        border: pinned
          ? '1px solid var(--color-purple)'
          : isCurrent
            ? '1px solid var(--color-tertiary)'
            : 'none',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- full-bleed cover fill, same pattern as UserCard/ProfileHeroBackground */}
      <img
        src={supabaseImageLoader({ src: room.backgroundImageUrl ?? '/img/default_image.png', width: 360, quality: 90 })}
        alt=""
        aria-hidden
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'var(--gradient-image-overlay)' }} />

      <div className="relative flex flex-col h-full justify-between" style={{ padding: 16 }}>
        <div className="flex justify-end w-full flex-shrink-0">
          {pinned && (
            <div
              className="flex items-center justify-center flex-shrink-0 rounded-[var(--x2,4px)]"
              style={{ width: 24, height: 24, background: 'var(--color-background)' }}
              aria-hidden="true"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- static gradient-fill asset, next/image adds no value here */}
              <img src="/icons/pin-heart.svg" alt="" style={{ width: 12, height: 'auto', display: 'block' }} />
            </div>
          )}
        </div>

        <div className="flex items-center w-full flex-shrink-0" style={{ gap: 8 }}>
          <GroupAvatar imageUrl={room.imageUrl} name={room.name} size={32} />
          <div className="flex flex-col flex-1 min-w-0" style={{ gap: 4 }}>
            <p className="font-body font-bold text-primary truncate leading-none" style={{ fontSize: 16, fontVariationSettings: '"opsz" 14' }}>
              {room.name}
            </p>
            <div className="flex items-center flex-shrink-0" style={{ gap: 4 }}>
              <span className="font-silkscreen text-secondary leading-none whitespace-nowrap" style={{ fontSize: 'var(--text-mini)' }}>
                Lv.{room.level}
              </span>
              <span className="flex-shrink-0 rounded-full bg-[var(--color-secondary)]" style={{ width: 2, height: 2 }} aria-hidden="true" />
              <User style={{ width: 12, height: 12, color: 'var(--color-secondary)', flexShrink: 0 }} aria-hidden="true" />
              <span className="font-silkscreen text-secondary leading-none whitespace-nowrap" style={{ fontSize: 'var(--text-mini)' }}>
                {room.memberCount}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
