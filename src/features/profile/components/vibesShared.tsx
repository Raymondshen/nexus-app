'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { deleteNoteAction, reorderNotesAction } from '@/app/(app)/profile/notes/actions'
import { updatePinnedVinylAction } from '@/app/(app)/profile/actions'
import { MUSIC_DOMAINS as MUSIC_DOMAINS_LIST } from '@/shared/constants/config'
import type { PublicNote } from '@/types'

// ─── Music platform validation ────────────────────────────────────────────────
// This file no longer renders a grid (see useVibesState below) — it's the shared home
// for Vibes data/pin/remove/reorder logic and a handful of small helpers consumed by
// CurrentVibeRow, VibesPlaylistSheet, VinylComboArt, AddVibeForm, and UploadOptionsSheet.

const MUSIC_DOMAINS = new Set(MUSIC_DOMAINS_LIST)

function normHost(h: string) {
  return h.replace(/^(www|m)\./, '')
}

export function isMusicUrl(url: string): boolean {
  try {
    return MUSIC_DOMAINS.has(normHost(new URL(url).hostname))
  } catch {
    return false
  }
}

export function isMusicNote(n: PublicNote): boolean {
  return !!n.source_domain && MUSIC_DOMAINS.has(normHost(n.source_domain))
}

/** Splits "Song · Artist" (the separator og-preview.ts appends for YouTube/Spotify/Apple
 *  Music) into a title/subtitle pair; falls back to the whole string with no subtitle. */
export function splitTitleArtist(ogTitle: string): [string, string | null] {
  const idx = ogTitle.indexOf(' · ')
  if (idx === -1) return [ogTitle, null]
  return [ogTitle.slice(0, idx), ogTitle.slice(idx + 3)]
}

// ─── Source-platform badge (Figma 559:6341's "social_icons") ─────────────────
// Only the 3 platforms with a Figma-supplied brand mark get a badge — Apple Music /
// SoundCloud notes (still valid vibes, see MUSIC_DOMAINS) simply render without one.

export type MusicPlatform = 'youtube' | 'youtube_music' | 'spotify'

export const PLATFORM_ICON_SRC: Record<MusicPlatform, string> = {
  youtube:       '/icons/social-youtube.svg',
  youtube_music: '/icons/social-youtube-music.svg',
  spotify:       '/icons/social-spotify.svg',
}

export function resolveMusicPlatform(note: PublicNote): MusicPlatform | null {
  let host = note.source_domain ? normHost(note.source_domain) : ''
  if (!host) {
    try { host = normHost(new URL(note.url).hostname) } catch { return null }
  }
  if (host === 'music.youtube.com') return 'youtube_music'
  if (host === 'youtube.com' || host === 'youtu.be') return 'youtube'
  if (host === 'spotify.com' || host === 'open.spotify.com') return 'spotify'
  return null
}

// oEmbed's default thumbnail_url is hqdefault (480×360, 4:3, black-bar padding for
// non-4:3 videos). Every consumer of this now displays at 56px or smaller (VinylComboArt's
// tile, its own ~20px label clip) — mqdefault (320×180, no bars for widescreen videos) is
// plenty and a fraction of the bytes; there's no remaining 108px-tile consumer that would
// justify maxresdefault's 1280×720.
export function resolveYtThumbnail(url: string): string {
  try {
    if (new URL(url).hostname !== 'i.ytimg.com') return url
  } catch { return url }
  return url.replace(/\/(hq|mq|sd|maxres|)default\.jpg(\?.*)?$/, '/mqdefault.jpg')
}

export function ytFallback(url: string): string {
  // mqdefault is nearly universally available, but fall back to hqdefault (oEmbed's own
  // default, effectively always present) on the rare 404.
  return url.replace('/mqdefault.jpg', '/hqdefault.jpg')
}

// Exported so any other mounted surface for the SAME profile (e.g. ProfileClient's
// CurrentVibeRow preview) can read/derive the same pinned vibe without duplicating the
// key, and stay live-in-sync via VIBES_PIN_CHANGE_EVENT below.
export const VIBES_PINNED_KEY = 'nexus_vibes_pinned'
export const VIBES_PIN_CHANGE_EVENT = 'nexus-vibes-pin-change'

// Shared `useState` initializer for pinnedId — used by both useVibesState (which then
// owns writes: togglePin/remove call setPinnedId directly and dispatch
// VIBES_PIN_CHANGE_EVENT) and CurrentVibeRow (which only ever reads, via its own
// listener effect for that same event — the two aren't quite symmetric enough to share
// a single hook, but the derivation itself is identical).
export function derivePinnedNoteId(isOwner: boolean, initialPinnedId: string | null): string | null {
  // VIBES_PINNED_KEY is a device-scoped cache of the signed-in user's OWN pinned vinyl —
  // only relevant when viewing your own profile. Viewing another member's profile must
  // use their DB-backed initialPinnedId only, or the viewer's own cached pin (almost
  // never one of the target's note ids) silently overrides it, making the member's
  // actual pinned vinyl render as a square card instead of the spinning disc.
  if (!isOwner || typeof window === 'undefined') return initialPinnedId
  // localStorage takes precedence for same-session changes; fall back to DB value
  return localStorage.getItem(VIBES_PINNED_KEY) ?? initialPinnedId
}

// ─── VinylActionSheet — long-press context menu ───────────────────────────────

// Used by VibesPlaylistSheet's rows (Figma 690:16468). Portals to document.body (same
// pattern as MessageBubble's ChatSheetReact/PinDurationSheet etc.) rather than rendering
// in place: VibesPlaylistSheet renders this nested inside its own BottomSheet, whose
// motion.div has an active `transform` — a transformed ancestor becomes the containing
// block for `position: fixed` descendants, so without the portal this sheet's
// "fixed inset-0"/"fixed bottom-0" were being positioned relative to that BottomSheet's
// box instead of the viewport, rendering behind/clipped by its own Add Music section
// instead of overlaying the whole screen.
export function VinylActionSheet({
  note,
  isPinned,
  isOwner,
  onTogglePin,
  onRemove,
  onClose,
}: {
  note:        PublicNote
  isPinned:    boolean
  isOwner:     boolean
  onTogglePin: () => void
  onRemove:    () => void
  onClose:     () => void
}) {
  // document.body doesn't exist during SSR, so this must flip after mount, not during
  // the initial render — see MessageBubble's identical `mounted` gate for createPortal.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe createPortal mount flag, same pattern as MessageBubble
    setMounted(true)
  }, [])
  if (!mounted) return null

  return createPortal(
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 z-[60] bg-black/60"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[70] bg-[var(--color-surface-sheet)] rounded-tl-[16px] rounded-tr-[16px]"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 400) onClose() }}
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'max(28px, env(safe-area-inset-bottom))' }}
      >
        <div className="flex flex-col" style={{ padding: 24, gap: 4 }}>

          {/* Track title eyebrow */}
          {note.og_title && (
            <p
              className="font-silkscreen leading-none text-tertiary"
              style={{ fontSize: 'var(--text-mini)', marginBottom: 12 }}
            >
              {note.og_title}
            </p>
          )}

          {/* Open Link */}
          <button
            className="flex items-center text-left w-full"
            style={{ height: 48 }}
            onClick={() => { window.open(note.url, '_blank', 'noopener,noreferrer'); onClose() }}
          >
            <span
              className="font-body font-medium text-primary"
              style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
            >
              Open Link
            </span>
          </button>

          {/* Pin / Unpin — owner only */}
          {isOwner && (
            <button
              className="flex items-center text-left w-full"
              style={{ height: 48 }}
              onClick={() => { onTogglePin(); onClose() }}
            >
              <span
                className="font-body font-medium"
                style={{
                  fontSize:              'var(--text-sm)',
                  fontVariationSettings: '"opsz" 14',
                  color: isPinned ? 'var(--color-danger)' : 'var(--color-purple)',
                }}
              >
                {isPinned ? 'Unpin' : 'Pin as Favorite'}
              </span>
            </button>
          )}

          {/* Remove — owner only */}
          {isOwner && (
            <button
              className="flex items-center text-left w-full"
              style={{ height: 48 }}
              onClick={() => { onRemove(); onClose() }}
            >
              <span
                className="font-body font-medium"
                style={{
                  fontSize:              'var(--text-sm)',
                  fontVariationSettings: '"opsz" 14',
                  color:                 'var(--color-danger)',
                }}
              >
                Remove Vibe
              </span>
            </button>
          )}

        </div>
      </motion.div>
    </>,
    document.body
  )
}

// ─── useVibesState — shared data/pin/remove/reorder logic ────────────────────
// Backs VibesPlaylistSheet (the current, only Vibes UI — Figma 690:16468). Owns the
// vinyls array, pinnedId, and every mutation (add/pin/remove/reorder), including
// persistence (localStorage + server actions) and cross-component sync via
// VIBES_PIN_CHANGE_EVENT.

export interface VibesState {
  orderedVinyls: PublicNote[]
  pinnedId:      string | null
  addVibe:       (note: PublicNote) => void
  togglePin:     (vinylId: string) => void
  remove:        (vinylId: string) => void
  /** Tap-and-hold drag reorder (VibesPlaylistSheet) — takes the NON-pinned notes in
   *  their new order and persists the full renumbering via reorderNotesAction. */
  reorder:       (newRestOrder: PublicNote[]) => void
}

export function useVibesState(initialVinyls: PublicNote[], isOwner: boolean, initialPinnedId: string | null): VibesState {
  const [vinyls, setVinyls] = useState<PublicNote[]>(() => initialVinyls.filter(isMusicNote))

  const [pinnedId, setPinnedId] = useState<string | null>(() => derivePinnedNoteId(isOwner, initialPinnedId))

  // Persists a pin change to localStorage + the DB and notifies any other mounted
  // surface for this same profile (e.g. ProfileClient's CurrentVibeRow preview) via
  // VIBES_PIN_CHANGE_EVENT, since that preview has its own independent pinnedId state.
  const persistPinned = useCallback((next: string | null) => {
    if (next) localStorage.setItem(VIBES_PINNED_KEY, next)
    else localStorage.removeItem(VIBES_PINNED_KEY)
    updatePinnedVinylAction(next)
    window.dispatchEvent(new CustomEvent(VIBES_PIN_CHANGE_EVENT, { detail: { pinnedId: next } }))
  }, [])

  const addVibe = useCallback((note: PublicNote) => {
    setVinyls(prev => [note, ...prev])
  }, [])

  const togglePin = useCallback((vinylId: string) => {
    setPinnedId(prev => {
      const next = prev === vinylId ? null : vinylId
      persistPinned(next)
      return next
    })
  }, [persistPinned])

  const remove = useCallback((vinylId: string) => {
    setVinyls(prev => prev.filter(v => v.id !== vinylId))
    setPinnedId(prev => {
      if (prev !== vinylId) return prev
      persistPinned(null)
      return null
    })
    deleteNoteAction(vinylId)
  }, [persistPinned])

  // Pinned vinyl always floats to the first slot
  const orderedVinyls = useMemo(() => {
    if (!pinnedId) return vinyls
    const idx = vinyls.findIndex(v => v.id === pinnedId)
    if (idx <= 0) return vinyls
    const arr = [...vinyls]
    arr.unshift(arr.splice(idx, 1)[0])
    return arr
  }, [vinyls, pinnedId])

  // The pinned note's own position in `vinyls` never matters for display (orderedVinyls
  // always floats it to the front regardless), so a reorder only needs to splice the
  // dragged non-pinned order back in — persisted positions are 0..N-1 over just that
  // subset, matching what reorderNotesAction writes.
  const reorder = useCallback((newRestOrder: PublicNote[]) => {
    setVinyls(prev => {
      const pinned = prev.find(v => v.id === pinnedId)
      return pinned ? [pinned, ...newRestOrder] : newRestOrder
    })
    reorderNotesAction(newRestOrder.map(v => v.id))
  }, [pinnedId])

  return { orderedVinyls, pinnedId, addVibe, togglePin, remove, reorder }
}
