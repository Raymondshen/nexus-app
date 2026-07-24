'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  isMusicNote,
  splitTitleArtist,
  resolveMusicPlatform,
  resolveYtThumbnail,
  PLATFORM_ICON_SRC,
  VIBES_PINNED_KEY,
  VIBES_PIN_CHANGE_EVENT,
} from '@/features/profile/components/VibesGrid'
import { VinylComboArt } from '@/features/profile/components/VinylComboArt'
import type { PublicNote } from '@/types'

// ─── CurrentVibeRow — "Currently vibing" preview (Figma 684:15733) ────────────
// A persistent, always-visible preview of the profile owner's pinned vibe (falling back
// to their most-recent music note, same priority VibesGrid/HomeClient/chat use elsewhere)
// sitting above the Photos grid on the profile's main scroll — not a tab, so it's visible
// regardless of which of Photos/Vibes the swipeable tab content below is showing.
// Renders nothing if the owner has no music vibes yet (no fabricated placeholder state).
//
// Mirrors VibesGrid's own pinnedId derivation (device-cached VIBES_PINNED_KEY for the
// owner, else the DB-backed initialPinnedId) and stays live-in-sync with pin/unpin/remove
// actions taken inside VibesGrid — while both are mounted on the same profile screen —
// via the VIBES_PIN_CHANGE_EVENT window event, since the two components each hold their
// own independent pinnedId state rather than sharing one lifted store.

interface CurrentVibeRowProps {
  notes:           PublicNote[]
  isOwner:         boolean
  initialPinnedId: string | null
  /** Playlist icon tap — opens VibesPlaylistSheet (Figma 690:16468). */
  onOpenPlaylist:  () => void
}

export function CurrentVibeRow({ notes, isOwner, initialPinnedId, onOpenPlaylist }: CurrentVibeRowProps) {
  const musicNotes = useMemo(() => notes.filter(isMusicNote), [notes])

  const derivePinnedId = useCallback((): string | null => {
    if (!isOwner || typeof window === 'undefined') return initialPinnedId
    return localStorage.getItem(VIBES_PINNED_KEY) ?? initialPinnedId
  }, [isOwner, initialPinnedId])

  const [pinnedId, setPinnedId] = useState<string | null>(derivePinnedId)

  useEffect(() => {
    if (!isOwner) return
    function onPinChange(e: Event) {
      setPinnedId((e as CustomEvent<{ pinnedId: string | null }>).detail.pinnedId)
    }
    window.addEventListener(VIBES_PIN_CHANGE_EVENT, onPinChange)
    return () => window.removeEventListener(VIBES_PIN_CHANGE_EVENT, onPinChange)
  }, [isOwner])

  const current = useMemo(
    () => musicNotes.find(n => n.id === pinnedId) ?? musicNotes[0] ?? null,
    [musicNotes, pinnedId]
  )

  if (!current) return null

  const [title, artist] = splitTitleArtist(current.og_title ?? current.url)
  const platform = resolveMusicPlatform(current)
  const imgSrc = current.og_image_url ? resolveYtThumbnail(current.og_image_url) : null

  return (
    <div
      className="flex items-center w-full flex-shrink-0"
      style={{ gap: 'var(--x5)', paddingLeft: 'var(--md)', paddingRight: 'var(--md)', paddingTop: 'var(--x5)' }}
    >
      <VinylComboArt imgSrc={imgSrc} href={current.url} />

      {/* Title block */}
      <div className="flex flex-col flex-1 min-w-0 justify-center" style={{ gap: 'var(--x2)' }}>
        <p className="font-silkscreen leading-none overflow-hidden text-ellipsis whitespace-nowrap w-full" style={{ fontSize: 'var(--mini)', color: 'var(--color-tertiary)' }}>
          Currently vibing
        </p>
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

      {/* Platform icon — opens the link */}
      {platform && (
        <a
          href={current.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open in source app"
          className="flex-shrink-0 flex items-center justify-center"
          style={{ width: 24, height: 24 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={PLATFORM_ICON_SRC[platform]} alt="" aria-hidden style={{ width: '100%', height: '100%', display: 'block' }} />
        </a>
      )}

      {/* Playlist/queue icon — opens VibesPlaylistSheet. Figma 690:16320 replaced the
          earlier plain chevron (684:15733) with this list+note glyph — not a pixelarticons
          icon, so it's a static asset (public/icons/vibes-playlist.svg), same pattern as
          the social-*.svg platform badges. */}
      <button
        onClick={onOpenPlaylist}
        aria-label="Open playlist"
        className="flex-shrink-0 flex items-center justify-center appearance-none"
        style={{ width: 24, height: 24 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/vibes-playlist.svg" alt="" aria-hidden style={{ width: 20, height: 16, display: 'block' }} />
      </button>
    </div>
  )
}
