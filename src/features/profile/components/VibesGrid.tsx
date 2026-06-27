'use client'

import { useState, useTransition, useEffect, useRef, useMemo, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Close } from 'pixelarticons/react/Close'
import { addNoteAction, deleteNoteAction } from '@/app/(app)/profile/notes/actions'
import type { PublicNote } from '@/types'

// ─── Music platform validation ────────────────────────────────────────────────

const MUSIC_DOMAINS = new Set([
  'youtube.com',
  'youtu.be',
  'music.youtube.com',
  'music.apple.com',
  'open.spotify.com',
  'spotify.com',
  'soundcloud.com',
])

function normHost(h: string) {
  return h.replace(/^www\./, '')
}

function isMusicUrl(url: string): boolean {
  try {
    return MUSIC_DOMAINS.has(normHost(new URL(url).hostname))
  } catch {
    return false
  }
}

function isMusicNote(n: PublicNote): boolean {
  return !!n.source_domain && MUSIC_DOMAINS.has(normHost(n.source_domain))
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
      className="relative flex flex-col items-center min-w-0 flex-1 overflow-hidden"
      style={{ height: 105 }}
      onPointerDown={isOwner ? onPointerDown : undefined}
      onPointerUp={isOwner ? cancelPress : undefined}
      onPointerLeave={isOwner ? cancelPress : undefined}
    >
      {/* Disc + glow wrapper — explicit 105×105 block so the glow can position against it */}
      <div className="relative flex-shrink-0" style={{ width: 105, height: 105 }}>

        {/* Ambient glow for pinned track — blurred album art behind the disc */}
        {isPinned && imgSrc && (
          <motion.div
            className="absolute pointer-events-none"
            style={{ inset: '-13px', borderRadius: '50%', overflow: 'hidden' }}
            animate={{ opacity: [0.5, 0.85, 0.5], scale: [0.9, 1.0, 0.9] }}
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
      </div>

      {/* Glass label — transparent overlay at disc bottom; text floats over the spinning art */}
      <div
        className="absolute bottom-0 left-0 w-full flex flex-col items-center justify-center"
        style={{ padding: 8 }}
      >
        <p
          className="font-silkscreen leading-none text-primary text-center w-full"
          style={{ fontSize: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {note.og_title ?? note.url}
        </p>
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

// ─── AddSlot — empty dashed disc placeholder ─────────────────────────────────

function AddSlot({ onClick }: { onClick: () => void }) {
  return (
    <div className="relative flex flex-col items-center min-w-0 flex-1">
      <button
        onClick={onClick}
        className="relative flex items-center justify-center overflow-hidden flex-shrink-0"
        style={{
          width:        105,
          height:       105,
          borderRadius: 56,
          background:   'var(--color-surface)',
          border:       '1px dashed var(--color-border)',
        }}
        aria-label="Add music link"
      >
        {/* Pixel + icon — 24×24 outer, icon at inset ~16.67% */}
        <div className="relative overflow-hidden flex-shrink-0" style={{ width: 24, height: 24 }}>
          <div className="absolute" style={{ inset: '16.67%' }}>
            <svg
              viewBox="0 0 14 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden
              style={{ width: '100%', height: '100%' }}
            >
              <rect x="6"  y="0"  width="2" height="14" fill="var(--color-tertiary)" />
              <rect x="0"  y="6"  width="14" height="2" fill="var(--color-tertiary)" />
            </svg>
          </div>
        </div>
      </button>
    </div>
  )
}

// ─── AddVibeSheet — bottom sheet for adding a music link ─────────────────────

function AddVibeSheet({
  isOpen,
  onClose,
  onAdd,
  crews,
}: {
  isOpen:  boolean
  onClose: () => void
  onAdd:   (note: PublicNote) => void
  crews:   Array<{ id: string; name: string }>
}) {
  const [url,    setUrl]    = useState('')
  const [crewId, setCrewId] = useState(crews[0]?.id ?? '')
  const [error,  setError]  = useState<string | null>(null)
  const [adding, startAdd]  = useTransition()

  useEffect(() => {
    if (!isOpen) return
    setUrl('')
    setError(null)
    if (crews.length > 0) setCrewId(crews[0].id)
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleAdd() {
    const trimmed = url.trim()
    if (!trimmed) { setError('Paste a link first'); return }
    if (!isMusicUrl(trimmed)) {
      setError('Only YouTube, Spotify, Apple Music, or SoundCloud')
      return
    }
    if (!crewId) { setError('Join a squad first to save vibes'); return }

    startAdd(async () => {
      const result = await addNoteAction(crewId, trimmed)
      if (result.error) { setError('Failed to add — try again'); return }
      if (result.note) {
        onAdd(result.note)
        onClose()
      }
    })
  }

  return (
    <AnimatePresence>
      {isOpen && (
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
            <div className="flex flex-col" style={{ gap: 20, padding: 24 }}>

              {/* Header */}
              <div className="flex items-center justify-between">
                <p
                  className="font-body font-bold text-primary"
                  style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}
                >
                  Add a Vibe
                </p>
                <button onClick={onClose} aria-label="Close">
                  <Close style={{ width: 20, height: 20, color: 'var(--color-tertiary)' }} />
                </button>
              </div>

              {/* Accepted platforms hint */}
              <p
                className="font-silkscreen leading-relaxed"
                style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}
              >
                YouTube · Spotify · Apple Music · SoundCloud
              </p>

              {/* URL input */}
              <div
                className="bg-black border flex items-center overflow-hidden"
                style={{ borderColor: 'var(--color-border-hover)', height: 48, paddingLeft: 12, paddingRight: 12 }}
              >
                <input
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setError(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
                  placeholder="Paste a music link..."
                  autoFocus
                  className="flex-1 bg-transparent font-body font-normal text-primary placeholder:text-tertiary focus:outline-none leading-normal"
                  style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
                />
              </div>

              {/* Crew selector — only shown when user is in multiple squads */}
              {crews.length > 1 && (
                <div className="flex flex-col" style={{ gap: 8 }}>
                  <p
                    className="font-body font-medium text-primary tracking-[0.2px] leading-normal"
                    style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
                  >
                    Save to Squad
                  </p>
                  <div
                    className="bg-black border flex items-center overflow-hidden"
                    style={{ borderColor: 'var(--color-border-hover)', height: 48, paddingLeft: 12, paddingRight: 12 }}
                  >
                    <select
                      value={crewId}
                      onChange={(e) => setCrewId(e.target.value)}
                      className="flex-1 bg-transparent font-body font-normal text-primary focus:outline-none appearance-none cursor-pointer"
                      style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
                    >
                      {crews.map(c => (
                        <option key={c.id} value={c.id} style={{ background: '#111' }}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <p className="font-pixel" style={{ fontSize: 8, color: '#ef4444' }}>{error}</p>
              )}

              {/* Add button */}
              <button
                onClick={handleAdd}
                disabled={adding || !url.trim()}
                className="w-full flex items-center justify-center disabled:opacity-50"
                style={{
                  height:     48,
                  background: 'var(--color-purple)',
                  boxShadow:  '4px 4px 0 rgba(168,85,247,0.5)',
                }}
              >
                <span
                  className="font-silkscreen leading-none text-primary whitespace-nowrap"
                  style={{ fontSize: 'var(--text-xs)' }}
                >
                  {adding ? '...' : 'ADD VIBE'}
                </span>
              </button>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ─── VibesGrid (main export) ──────────────────────────────────────────────────

export interface VibesGridProps {
  initialVinyls: PublicNote[]
  crews:         Array<{ id: string; name: string }>
  isOwner:       boolean
}

export function VibesGrid({ initialVinyls, crews, isOwner }: VibesGridProps) {
  const [vinyls,  setVinyls]  = useState<PublicNote[]>(() => initialVinyls.filter(isMusicNote))
  const [showAdd, setShowAdd] = useState(false)
  const [pinnedId, setPinnedId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(VIBES_PINNED_KEY)
  })

  function handleAdd(vinyl: PublicNote) {
    setVinyls(prev => [vinyl, ...prev])
  }

  function handleTogglePin(vinylId: string) {
    setPinnedId(prev => {
      const next = prev === vinylId ? null : vinylId
      if (next) localStorage.setItem(VIBES_PINNED_KEY, next)
      else localStorage.removeItem(VIBES_PINNED_KEY)
      return next
    })
  }

  function handleRemove(vinylId: string) {
    setVinyls(prev => prev.filter(v => v.id !== vinylId))
    if (pinnedId === vinylId) {
      setPinnedId(null)
      localStorage.removeItem(VIBES_PINNED_KEY)
    }
    deleteNoteAction(vinylId)
  }

  const canAdd = isOwner && crews.length > 0

  // Pinned vinyl always floats to the first slot
  const orderedVinyls = useMemo(() => {
    if (!pinnedId) return vinyls
    const idx = vinyls.findIndex(v => v.id === pinnedId)
    if (idx <= 0) return vinyls
    const arr = [...vinyls]
    arr.unshift(arr.splice(idx, 1)[0])
    return arr
  }, [vinyls, pinnedId])

  const items: Array<PublicNote | 'add'> = [
    ...orderedVinyls,
    ...(canAdd ? (['add'] as const) : []),
  ]

  if (items.length === 0) {
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

  // Chunk items into rows of 3
  const rows: Array<typeof items> = []
  for (let i = 0; i < items.length; i += 3) {
    rows.push(items.slice(i, i + 3))
  }

  return (
    <>
      <div
        className="h-full overflow-y-auto nexus-scroll"
        style={{
          paddingTop:    24,
          paddingLeft:   16,
          paddingRight:  16,
          paddingBottom: 'max(env(safe-area-inset-bottom), 24px)',
        }}
      >
        <div className="flex flex-col w-full" style={{ gap: 8 }}>
          {rows.map((row, ri) => (
            <div
              key={ri}
              className="flex items-start w-full flex-shrink-0"
              style={{ gap: 8 }}
            >
              {row.map((item) =>
                item === 'add' ? (
                  <AddSlot key="__add" onClick={() => setShowAdd(true)} />
                ) : (
                  <VinylTrack
                    key={item.id}
                    note={item}
                    isPinned={pinnedId === item.id}
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

      <AddVibeSheet
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        onAdd={handleAdd}
        crews={crews}
      />
    </>
  )
}
