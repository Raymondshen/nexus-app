'use client'

import { useState, useTransition, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Close } from 'pixelarticons/react/Close'
import { addNoteAction } from '@/app/(app)/profile/notes/actions'
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

// ─── VinylTrack — spinning disc + floating title label ───────────────────────
//
// Structure (matches Figma node 329:3298):
//   track  — relative, flex-col, items-center, flex-1
//     disc  — the spinning <a>: 105×105, rounded-[56px], flex center, p-8, overflow-hidden
//       img  — absolute inset-0, object-cover (album art)
//       hole — relative in flex flow, 8×8, black, bordered (center vinyl hole)
//     label — absolute bottom-0 left-0, w-[115px], p-8, transparent bg (glass effect)
//       p   — silkscreen 8px, truncated, centered
//     ×btn  — absolute top-right, owner only

function VinylTrack({
  note,
}: {
  note: PublicNote
}) {
  return (
    // Track column — relative so the label can be positioned inside
    <div className="relative flex flex-col items-center min-w-0 flex-1 overflow-hidden">

      {/* Ambient fill — blurred copy of the same image colors the space around the disc */}
      {note.og_image_url && (
        <div
          aria-hidden
          style={{
            position:           'absolute',
            inset:              -20,
            backgroundImage:    `url(${note.og_image_url})`,
            backgroundSize:     'cover',
            backgroundPosition: 'center',
            filter:             'blur(24px) saturate(1.3)',
            opacity:            0.9,
          }}
        />
      )}

      {/* Spinning disc — the <a> IS the disc container */}
      <a
        href={note.url}
        target="_blank"
        rel="noopener noreferrer"
        className="animate-vinyl relative flex items-center justify-center overflow-hidden flex-shrink-0"
        style={{
          width:        105,
          height:       105,
          borderRadius: 56,
        }}
        aria-label={note.og_title ?? 'Open link'}
      >
        {/* Album art — fills the entire disc */}
        {note.og_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={note.og_image_url}
            alt=""
            style={{
              position:      'absolute',
              inset:         0,
              width:         '100%',
              height:        '100%',
              objectFit:     'cover',
              pointerEvents: 'none',
              borderRadius:  56,
              maxWidth:      'none',
            }}
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: 'var(--color-surface)', borderRadius: 56 }} />
        )}

        {/* Center hole — relative (in-flow), centered by parent flex */}
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

      {/* Title label — transparent glass overlay at bottom of track */}
      {/* bg: rgba(0,0,0,0) = fully transparent; text floats over the spinning disc */}
      <div
        className="absolute bottom-0 left-0 flex flex-col items-center justify-center"
        style={{
          width:      115,
          padding:    8,
          background: 'rgba(0,0,0,0)',
        }}
      >
        <p
          className="font-silkscreen leading-none text-primary text-center w-full"
          style={{
            fontSize:     8,
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
            wordBreak:    'break-word',
          }}
        >
          {note.og_title ?? note.url}
        </p>
      </div>

    </div>
  )
}

// ─── AddSlot — empty dashed disc placeholder (no label, same size as disc) ───
//
// Matches Figma node 329:3311:
//   105×105 circle, bg-surface, border-dashed border-border, overflow-clip
//   pixel + icon: 24×24 wrapper, icon at inset-[16.67%]

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
          <div
            className="absolute"
            style={{ inset: '16.67%' }}
          >
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
//
// Outer layout matches Figma node 285:1866 / 285:1867:
//   body  — pt-24 px-16, flex-col gap-8 (the outer padding + row gaps)
//   rows  — flex gap-8 items-start overflow-clip shrink-0 w-full
//   tracks — flex-1 flex-col items-center (filled by VinylTrack / AddSlot)

export interface VibesGridProps {
  initialNotes: PublicNote[]
  crews:        Array<{ id: string; name: string }>
  isOwner:      boolean
}

export function VibesGrid({ initialNotes, crews, isOwner }: VibesGridProps) {
  const [notes,   setNotes]   = useState<PublicNote[]>(() => initialNotes.filter(isMusicNote))
  const [showAdd, setShowAdd] = useState(false)

  function handleAdd(note: PublicNote) {
    setNotes(prev => [note, ...prev])
  }

  const canAdd = isOwner && crews.length > 0

  // Build flat item list: filled notes + optional add slot at end
  const items: Array<PublicNote | 'add'> = [
    ...notes,
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

  // Chunk items into rows of 3 to match Figma row-based flex layout
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
        {/* Outer flex-col: gap-8 between rows (matches Figma inner content container) */}
        <div className="flex flex-col w-full" style={{ gap: 8 }}>
          {rows.map((row, ri) => (
            // Row: flex gap-8 items-start overflow-clip shrink-0 w-full
            <div
              key={ri}
              className="flex items-start w-full overflow-hidden flex-shrink-0"
              style={{ gap: 8 }}
            >
              {row.map((item, ci) =>
                item === 'add' ? (
                  <AddSlot key="__add" onClick={() => setShowAdd(true)} />
                ) : (
                  <VinylTrack
                    key={item.id}
                    note={item}
                  />
                )
              )}
              {/* Pad incomplete last row so tracks stay left-aligned and same width */}
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
