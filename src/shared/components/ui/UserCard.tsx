'use client'

import { supabaseImageLoader } from '@/shared/supabase/imageLoader'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { PixelSprite, spriteInfoFor } from '@/shared/components/game/PixelSprite'
import { Crown } from 'pixelarticons/react/Crown'
import { LinkPill } from '@/shared/components/ui/LinkPill'
import { TickerBanner, TICKER_HEIGHT_SMALL } from '@/shared/components/banners/TickerBanner'

const CLASS_LABELS: Record<string, string> = {
  berserker: 'Berserker', sage: 'Sage', ghost: 'Ghost', hype_man: 'Hype Man',
  the_voice: 'The Voice', meme_lord: 'Meme Lord', mage: 'Mage', warrior: 'Warrior',
  rogue: 'Rogue', healer: 'Healer', archer: 'Archer',
}

export type MiniMember = {
  id:             string
  username:       string
  avatar_url:     string | null
  avatar_class:   string | null | undefined
  background_url: string | null
  status?:        string | null
}

// LinkPill's own natural height (12px disc + 4px padding × 2, Figma 438:8053) — used to
// reserve its slot even when a member has no vinyl, so every card in a row is the same
// height without depending on the row's align-items:stretch.
const VINYL_PILL_HEIGHT = 20

// Mirrors TickerBanner's own outer wrapper (border-t/border-b, px-2, py-12) so a blank slot
// looks like a real ticker's chrome, matching Figma 432:7827's full-height card (438:8058)
// instead of collapsing like the shorter no-status card (432:8008). Height is pinned to
// TICKER_HEIGHT_SMALL (the "x1" size variant this card uses — Figma 189:1785) rather than
// left to emerge from padding/line-height — the member row (SquadDetailsSheet) stretches
// every card to its tallest sibling (flex align-items:stretch), and since no child carries
// flex-grow, even a sub-pixel mismatch between this and TickerBanner's real content height
// collapses into visible blank space below the ticker on some platforms (observed on iOS
// PWA). Same fix already applied to the vinyl pill via VINYL_PILL_HEIGHT.
function BlankTickerSlot() {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden border-t border-b border-border px-2"
      style={{ height: TICKER_HEIGHT_SMALL, paddingTop: 12, paddingBottom: 12, flexShrink: 0 }}
    >
      <span className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)' }}>&nbsp;</span>
    </div>
  )
}

// Shared member card (Figma 356:3503 / 432:8008) — used by SquadDetailsSheet's Members
// section and HomeClient's read-only squad details sheet (Figma 470:5082). Same card
// exactly, just fed from different data-fetch paths per call site.
export function UserCard({
  profile, msgCount, loading, isOnline, isCreator, vinyl, onTap,
}: {
  profile: MiniMember; msgCount: number; loading: boolean; isOnline: boolean
  isCreator?: boolean
  vinyl?: { imageUrl: string | null; title: string | null } | null
  onTap?: () => void
}) {
  const spriteInfo = spriteInfoFor(profile.avatar_class ?? null)
  const initial    = profile.username[0]?.toUpperCase() ?? '?'
  const classLabel = profile.avatar_class ? (CLASS_LABELS[profile.avatar_class] ?? profile.avatar_class) : 'Unknown'

  return (
    <div
      className="flex flex-col flex-shrink-0 bg-black border border-[var(--color-border-hover)] rounded-[var(--x3,8px)] overflow-hidden active:opacity-70 transition-opacity"
      style={{ width: 180, gap: 12, cursor: onTap ? 'pointer' : undefined }}
      onClick={onTap}
    >
      {/* Background header + avatar */}
      <div
        className="relative flex flex-col items-start justify-end flex-shrink-0 w-full overflow-hidden rounded-tl-[7px] rounded-tr-[7px]"
        style={{ height: 108, padding: 12 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- full-bleed cover fill, same pattern as ProfileHeroBackground/ManageUserProfile's hero */}
        <img
          src={supabaseImageLoader({ src: profile.background_url ?? '/img/default_image.png', width: 540, quality: 90 })}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
        />
        <div
          className="absolute inset-0 pointer-events-none rounded-tl-[7px] rounded-tr-[7px]"
          style={{ background: 'var(--gradient-image-overlay)' }}
        />
        <div className="relative flex-shrink-0">
          <UserAvatar avatarUrl={profile.avatar_url} username={profile.username} size={32} />
          {isOnline && (
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#66bb6a] border-[1.5px] border-black" />
          )}
        </div>
      </div>

      {/* Name + class/admin/sprite row + vinyl pill */}
      <div className="flex flex-col w-full flex-shrink-0" style={{ paddingLeft: 12, paddingRight: 12, gap: 8 }}>
        <p
          className="font-body font-bold text-primary truncate leading-none w-full"
          style={{ fontSize: 16, fontVariationSettings: '"opsz" 14' }}
        >
          {profile.username}
        </p>

        <div className="flex items-center flex-shrink-0" style={{ gap: 8 }}>
          {isCreator && (
            <Crown style={{ width: 12, height: 12, color: 'var(--color-coins)', flexShrink: 0 }} aria-hidden="true" />
          )}
          <div className="flex items-center justify-center overflow-hidden flex-shrink-0" style={{ width: 12, height: 12 }}>
            {spriteInfo ? (
              <PixelSprite spriteId={spriteInfo.id} nativePx={spriteInfo.nativePx} scale={0.5625} animate />
            ) : (
              <span className="font-pixel text-[6px] text-purple">{initial}</span>
            )}
          </div>
          <p className="font-silkscreen leading-none whitespace-nowrap" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
            {loading ? '...' : `${classLabel} · ${msgCount.toLocaleString()} msg.`}
          </p>
        </div>

        {/* Vinyl pill slot — always reserved (Figma 432:7827 vs 432:8008: every card in
            the row is the same total height regardless of which members have one). */}
        {vinyl && (vinyl.imageUrl || vinyl.title) ? (
          <LinkPill type="vinyl" imageUrl={vinyl.imageUrl} title={vinyl.title} />
        ) : (
          <div aria-hidden="true" style={{ height: VINYL_PILL_HEIGHT }} />
        )}
      </div>

      {/* Status ticker slot — always reserved, same reasoning as the vinyl pill slot. */}
      {profile.status ? <TickerBanner text={profile.status} size="small" /> : <BlankTickerSlot />}
    </div>
  )
}
