'use client'

import { useState, useLayoutEffect, useRef, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { deleteNoteAction } from '@/app/(app)/profile/notes/actions'
import { updatePinnedVinylAction } from '@/app/(app)/profile/actions'
import { MUSIC_DOMAINS as MUSIC_DOMAINS_LIST } from '@/shared/constants/config'
import type { PublicNote } from '@/types'

// ─── Music platform validation ────────────────────────────────────────────────

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

function isMusicNote(n: PublicNote): boolean {
  return !!n.source_domain && MUSIC_DOMAINS.has(normHost(n.source_domain))
}

// ─── Source-platform badge (Figma 559:6341's "social_icons") ─────────────────
// Only the 3 platforms with a Figma-supplied brand mark get a badge — Apple Music /
// SoundCloud notes (still valid vibes, see MUSIC_DOMAINS) simply render without one.

type MusicPlatform = 'youtube' | 'youtube_music' | 'spotify'

const PLATFORM_ICON_SRC: Record<MusicPlatform, string> = {
  youtube:       '/icons/social-youtube.svg',
  youtube_music: '/icons/social-youtube-music.svg',
  spotify:       '/icons/social-spotify.svg',
}

function resolveMusicPlatform(note: PublicNote): MusicPlatform | null {
  let host = note.source_domain ? normHost(note.source_domain) : ''
  if (!host) {
    try { host = normHost(new URL(note.url).hostname) } catch { return null }
  }
  if (host === 'music.youtube.com') return 'youtube_music'
  if (host === 'youtube.com' || host === 'youtu.be') return 'youtube'
  if (host === 'spotify.com' || host === 'open.spotify.com') return 'spotify'
  return null
}

// YouTube hqdefault thumbnails are 480×360 (4:3) with black bars baked in.
// Upgrade to maxresdefault (1280×720, 16:9, no bars) at render time.
function resolveYtThumbnail(url: string): string {
  try {
    if (new URL(url).hostname !== 'i.ytimg.com') return url
  } catch { return url }
  return url.replace(/\/(hq|mq|sd|)default\.jpg(\?.*)?$/, '/maxresdefault.jpg')
}

function ytFallback(url: string): string {
  // maxresdefault may 404 for older videos — fall back to mqdefault (320×180, 16:9)
  return url.replace('/maxresdefault.jpg', '/mqdefault.jpg')
}

const VIBES_PINNED_KEY = 'nexus_vibes_pinned'

// ─── VinylActionSheet — long-press context menu ───────────────────────────────

function VinylActionSheet({
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
  return (
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
    </>
  )
}

// ─── VinylTrackLabel — scrolling ticker so "Song · Artist" isn't clipped ─────
// Same measure-then-scroll approach as LinkPill's vinyl type: static text if it fits the
// disc's label width, otherwise a two-copy horizontal ticker loop.

function VinylTrackLabel({ text }: { text: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const measureRef   = useRef<HTMLSpanElement>(null)
  const [textWidth, setTextWidth]   = useState(0)
  const [availWidth, setAvailWidth] = useState(0)

  useLayoutEffect(() => {
    if (measureRef.current)   setTextWidth(measureRef.current.scrollWidth)
    if (containerRef.current) setAvailWidth(containerRef.current.clientWidth)
  }, [text])

  const needsTicker = availWidth > 0 && textWidth > availWidth
  const tickerDur   = Math.max(4, (textWidth / 60) * 3)

  return (
    <div ref={containerRef} style={{ width: '100%', overflow: 'hidden' }}>
      {/* Off-viewport span used only for measuring rendered text width */}
      <span
        ref={measureRef}
        aria-hidden
        className="font-silkscreen"
        style={{ fontSize: 8, whiteSpace: 'nowrap', position: 'fixed', left: -9999, top: 0, visibility: 'hidden', pointerEvents: 'none' }}
      >
        {text}
      </span>

      {needsTicker ? (
        <motion.div
          className="flex"
          animate={{ x: [0, -(textWidth + 16)] }}
          transition={{ duration: tickerDur, repeat: Infinity, ease: 'linear', repeatType: 'loop' }}
        >
          <span className="font-silkscreen leading-none text-primary" style={{ fontSize: 8, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {text}
          </span>
          <span className="font-silkscreen leading-none text-primary" style={{ fontSize: 8, whiteSpace: 'nowrap', paddingLeft: 16, flexShrink: 0 }}>
            {text}
          </span>
        </motion.div>
      ) : (
        <p
          className="font-silkscreen leading-none text-primary text-center w-full"
          style={{ fontSize: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {text}
        </p>
      )}
    </div>
  )
}

// ─── VinylTrack — spinning disc + floating title label (Figma 329:3298) ──────

function VinylTrack({
  note,
  isPinned,
  isOwner,
  onTogglePin,
  onRemove,
}: {
  note:        PublicNote
  isPinned:    boolean
  isOwner:     boolean
  onTogglePin: () => void
  onRemove:    () => void
}) {
  const [showActions, setShowActions] = useState(false)
  const [imgSrc, setImgSrc] = useState<string | null>(() =>
    note.og_image_url ? resolveYtThumbnail(note.og_image_url) : null
  )
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firedRef  = useRef(false)

  const handleImgError = useCallback(() => {
    setImgSrc(prev => {
      if (!prev) return prev
      if (prev.includes('/maxresdefault.jpg')) return ytFallback(prev)
      return prev
    })
  }, [])

  function onPointerDown() {
    firedRef.current = false
    timerRef.current = setTimeout(() => {
      firedRef.current = true
      setShowActions(true)
    }, 500)
  }

  function cancelPress() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }

  function handleLinkClick(e: React.MouseEvent) {
    if (firedRef.current) { e.preventDefault(); firedRef.current = false }
  }

  return (
    <div
      className="relative flex flex-col items-center min-w-0 flex-1"
      onPointerDown={isOwner ? onPointerDown : undefined}
      onPointerUp={isOwner ? cancelPress : undefined}
      onPointerLeave={isOwner ? cancelPress : undefined}
    >
      {/* Outer cell — same aspect-square footprint as AlbumCard's tile so pinned/unpinned rows line up */}
      <div className="relative flex-shrink-0 w-full" style={{ aspectRatio: '1' }}>

        {/* Disc + label — inset from the cell so the circle reads visibly smaller than the
            square cards around it, standing out instead of matching their footprint edge-to-edge */}
        <div className="absolute" style={{ inset: '7%' }}>

          {/* Ambient glow for pinned track — blurred album art behind the disc */}
          {isPinned && imgSrc && (
            <motion.div
              className="absolute pointer-events-none"
              style={{ inset: '-6px', borderRadius: '50%', overflow: 'hidden' }}
              animate={{ opacity: [0.5, 0.8, 0.5], scale: [0.97, 1.0, 0.97] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imgSrc}
                alt=""
                aria-hidden
                style={{
                  width:         '100%',
                  height:        '100%',
                  objectFit:     'cover',
                  filter:        'blur(12px) saturate(1.8) brightness(1.1)',
                  transform:     'scale(1.2)',
                  pointerEvents: 'none',
                }}
              />
            </motion.div>
          )}

          {/* Spinning disc */}
          <a
            href={note.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleLinkClick}
            className={`${isPinned ? 'animate-vinyl' : ''} absolute inset-0 flex items-center justify-center overflow-hidden`}
            style={{ borderRadius: 56 }}
            aria-label={note.og_title ?? 'Open link'}
          >
            {/* Album art — fills the circle */}
            {imgSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imgSrc}
                alt=""
                onError={handleImgError}
                style={{
                  position:       'absolute',
                  inset:          0,
                  width:          '100%',
                  height:         '100%',
                  objectFit:      'cover',
                  objectPosition: 'center',
                  pointerEvents:  'none',
                  borderRadius:   56,
                  maxWidth:       'none',
                }}
              />
            ) : (
              <div style={{ position: 'absolute', inset: 0, background: 'var(--color-surface)', borderRadius: 56 }} />
            )}

            {/* Glossy reflection — diagonal light streak, rotates with the disc for a light-catching sweep */}
            <div
              aria-hidden
              style={{
                position:      'absolute',
                inset:         0,
                borderRadius:  56,
                background:    'linear-gradient(115deg, transparent 22%, rgba(255,255,255,0.05) 34%, rgba(255,255,255,0.45) 46%, rgba(255,255,255,0.08) 56%, transparent 68%)',
                mixBlendMode:  'overlay',
                pointerEvents: 'none',
              }}
            />

            {/* Glass gradient — darkens bottom so label text is legible */}
            <div
              aria-hidden
              style={{
                position:     'absolute',
                inset:        0,
                borderRadius: 56,
                background:   'linear-gradient(to bottom, rgba(0,0,0,0) 40%, rgba(0,0,0,0.75) 100%)',
                pointerEvents:'none',
              }}
            />

            {/* Center hole — in-flow, centered by parent flex */}
            <div
              className="relative flex-shrink-0"
              style={{
                width:        8,
                height:       8,
                borderRadius: 56,
                background:   'var(--color-background)',
                border:       '1px solid var(--color-border)',
              }}
            />
          </a>

          {/* Glass label — floats over the darkened bottom of the disc */}
          <div
            className="absolute bottom-0 left-0 w-full flex flex-col items-center justify-center"
            style={{ padding: 8 }}
          >
            <VinylTrackLabel text={note.og_title ?? note.url} />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showActions && (
          <VinylActionSheet
            note={note}
            isPinned={isPinned}
            isOwner={isOwner}
            onTogglePin={onTogglePin}
            onRemove={onRemove}
            onClose={() => setShowActions(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── AlbumCard — square album-art tile (Figma 559:6341 "album image") ────────
// Used for every non-pinned vinyl; the pinned track keeps the circular VinylTrack
// treatment above. Static (no ticker) title label + a top-right source-platform badge.

function AlbumCard({
  note,
  isOwner,
  onTogglePin,
  onRemove,
}: {
  note:        PublicNote
  isOwner:     boolean
  onTogglePin: () => void
  onRemove:    () => void
}) {
  const [showActions, setShowActions] = useState(false)
  const [imgSrc, setImgSrc] = useState<string | null>(() =>
    note.og_image_url ? resolveYtThumbnail(note.og_image_url) : null
  )
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firedRef = useRef(false)
  const platform = useMemo(() => resolveMusicPlatform(note), [note])

  const handleImgError = useCallback(() => {
    setImgSrc(prev => {
      if (!prev) return prev
      if (prev.includes('/maxresdefault.jpg')) return ytFallback(prev)
      return prev
    })
  }, [])

  function onPointerDown() {
    firedRef.current = false
    timerRef.current = setTimeout(() => {
      firedRef.current = true
      setShowActions(true)
    }, 500)
  }

  function cancelPress() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }

  function handleLinkClick(e: React.MouseEvent) {
    if (firedRef.current) { e.preventDefault(); firedRef.current = false }
  }

  return (
    <div
      className="relative flex flex-col min-w-0 flex-1"
      onPointerDown={isOwner ? onPointerDown : undefined}
      onPointerUp={isOwner ? cancelPress : undefined}
      onPointerLeave={isOwner ? cancelPress : undefined}
    >
      <a
        href={note.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleLinkClick}
        className="relative block w-full overflow-hidden flex-shrink-0"
        style={{ aspectRatio: '1' }}
        aria-label={note.og_title ?? 'Open link'}
      >
        {imgSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgSrc}
            alt=""
            onError={handleImgError}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', pointerEvents: 'none' }}
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: 'var(--color-surface)' }} />
        )}

        {/* Diagonal gradient — darkens the bottom-left corner for label legibility */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(45deg, rgba(17,17,17,0.4) 0%, rgba(17,17,17,0) 60%)' }}
        />

        {/* Source-platform badge */}
        {platform && (
          <div className="absolute pointer-events-none" style={{ top: 8, right: 8, width: 16, height: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={PLATFORM_ICON_SRC[platform]} alt="" aria-hidden style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
        )}

        {/* Track title */}
        <p
          className="absolute font-silkscreen leading-none text-primary overflow-hidden text-ellipsis whitespace-nowrap pointer-events-none"
          style={{ left: 4, right: 8, bottom: 12, fontSize: 8 }}
        >
          {note.og_title ?? note.url}
        </p>
      </a>

      <AnimatePresence>
        {showActions && (
          <VinylActionSheet
            note={note}
            isPinned={false}
            isOwner={isOwner}
            onTogglePin={onTogglePin}
            onRemove={onRemove}
            onClose={() => setShowActions(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── VibesGrid (main export) ──────────────────────────────────────────────────
// Adding a vibe now happens exclusively through UploadOptionsSheet (opened from the
// floating pill's "+" button) — see VibesGridHandle.addVibe below. There is no more
// in-grid add tile or standalone add sheet.

export interface VibesGridHandle {
  /** Prepends an already-saved vibe to grid state — used by UploadOptionsSheet's inline "Add Vibes" section. */
  addVibe: (note: PublicNote) => void
}

export interface VibesGridProps {
  initialVinyls:   PublicNote[]
  isOwner:         boolean
  initialPinnedId?: string | null
  /** Extra scroll bottom-padding so the last row isn't hidden under a floating overlay (e.g. ProfileClient's pill). */
  bottomInset?:    number
}

export const VibesGrid = forwardRef<VibesGridHandle, VibesGridProps>(function VibesGrid(
  { initialVinyls, isOwner, initialPinnedId = null, bottomInset = 0 },
  ref
) {
  const [vinyls,  setVinyls]  = useState<PublicNote[]>(() => initialVinyls.filter(isMusicNote))

  useImperativeHandle(ref, () => ({
    addVibe: (note) => setVinyls(prev => [note, ...prev]),
  }), [])
  const [pinnedId, setPinnedId] = useState<string | null>(() => {
    // VIBES_PINNED_KEY is a device-scoped cache of the signed-in user's OWN pinned
    // vinyl — only relevant when viewing your own profile. Viewing another member's
    // profile must use their DB-backed initialPinnedId only, or the viewer's own
    // cached pin (almost never one of the target's note ids) silently overrides it,
    // making the member's actual pinned vinyl render as a square card instead of
    // the spinning disc.
    if (!isOwner || typeof window === 'undefined') return initialPinnedId
    // localStorage takes precedence for same-session changes; fall back to DB value
    return localStorage.getItem(VIBES_PINNED_KEY) ?? initialPinnedId
  })

  function handleTogglePin(vinylId: string) {
    setPinnedId(prev => {
      const next = prev === vinylId ? null : vinylId
      if (next) localStorage.setItem(VIBES_PINNED_KEY, next)
      else localStorage.removeItem(VIBES_PINNED_KEY)
      updatePinnedVinylAction(next)
      return next
    })
  }

  function handleRemove(vinylId: string) {
    setVinyls(prev => prev.filter(v => v.id !== vinylId))
    if (pinnedId === vinylId) {
      setPinnedId(null)
      localStorage.removeItem(VIBES_PINNED_KEY)
      updatePinnedVinylAction(null)
    }
    deleteNoteAction(vinylId)
  }

  // Pinned vinyl always floats to the first slot
  const orderedVinyls = useMemo(() => {
    if (!pinnedId) return vinyls
    const idx = vinyls.findIndex(v => v.id === pinnedId)
    if (idx <= 0) return vinyls
    const arr = [...vinyls]
    arr.unshift(arr.splice(idx, 1)[0])
    return arr
  }, [vinyls, pinnedId])

  if (orderedVinyls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full" style={{ gap: 8, padding: '48px 16px' }}>
        <p
          className="font-silkscreen text-center"
          style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}
        >
          No vibes yet
        </p>
      </div>
    )
  }

  // Chunk into rows of 3
  const rows: Array<typeof orderedVinyls> = []
  for (let i = 0; i < orderedVinyls.length; i += 3) {
    rows.push(orderedVinyls.slice(i, i + 3))
  }

  return (
    <div
      className="h-full overflow-y-auto nexus-scroll"
      style={{
        paddingTop:    16,
        paddingLeft:   16,
        paddingRight:  16,
        paddingBottom: `max(calc(env(safe-area-inset-bottom) + ${bottomInset}px), ${16 + bottomInset}px)`,
      }}
    >
      <div className="flex flex-col w-full" style={{ gap: 4 }}>
        {rows.map((row, ri) => (
          <div
            key={ri}
            className="flex items-start w-full flex-shrink-0"
            style={{ gap: 4 }}
          >
            {row.map((item) =>
              pinnedId === item.id ? (
                <VinylTrack
                  key={item.id}
                  note={item}
                  isPinned
                  isOwner={isOwner}
                  onTogglePin={() => handleTogglePin(item.id)}
                  onRemove={() => handleRemove(item.id)}
                />
              ) : (
                <AlbumCard
                  key={item.id}
                  note={item}
                  isOwner={isOwner}
                  onTogglePin={() => handleTogglePin(item.id)}
                  onRemove={() => handleRemove(item.id)}
                />
              )
            )}
            {/* Pad incomplete last row so tracks stay left-aligned at consistent width */}
            {row.length === 1 && <div className="flex-1 min-w-0" />}
            {row.length === 1 && <div className="flex-1 min-w-0" />}
            {row.length === 2 && <div className="flex-1 min-w-0" />}
          </div>
        ))}
      </div>
    </div>
  )
})
