'use client'

import { resolveMusicPlatform, PLATFORM_ICON_SRC } from '@/features/profile/components/vibesShared'
import type { PublicNote } from '@/types'

// ─── TitleBlock — eyebrow (optional) + title + artist ─────────────────────────
// Shared by CurrentVibeRow and VibesPlaylistSheet's PinnedVibeCard/VibeListRow so the
// "Currently vibing" eyebrow + title/artist split (via splitTitleArtist, vibesShared.tsx)
// isn't duplicated across all three call sites.

export function TitleBlock({ eyebrow, title, artist }: { eyebrow?: string; title: string; artist: string | null }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 justify-center" style={{ gap: 'var(--x2)' }}>
      {eyebrow && (
        <p className="font-silkscreen leading-none overflow-hidden text-ellipsis whitespace-nowrap w-full" style={{ fontSize: 'var(--mini)', color: 'var(--color-tertiary)' }}>
          {eyebrow}
        </p>
      )}
      <div className="flex flex-col w-full" style={{ gap: 'var(--x2)' }}>
        <p
          className="font-body font-semibold leading-none overflow-hidden text-ellipsis whitespace-nowrap"
          style={{ fontSize: 'var(--sm)', letterSpacing: '0.2px', color: 'var(--color-primary)', fontVariationSettings: '"opsz" 14' }}
        >
          {title}
        </p>
        {artist && (
          <p
            className="font-body font-light leading-tight overflow-hidden text-ellipsis whitespace-nowrap"
            style={{ fontSize: 'var(--xs)', color: 'var(--color-secondary)', fontVariationSettings: '"opsz" 14' }}
          >
            {artist}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── PlatformIcon — opens the source link ─────────────────────────────────────

export function PlatformIcon({ note }: { note: PublicNote }) {
  const platform = resolveMusicPlatform(note)
  if (!platform) return null
  return (
    <a
      href={note.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open in source app"
      className="flex-shrink-0 flex items-center justify-center"
      style={{ width: 24, height: 24 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={PLATFORM_ICON_SRC[platform]} alt="" aria-hidden style={{ width: '100%', height: '100%', display: 'block' }} />
    </a>
  )
}
