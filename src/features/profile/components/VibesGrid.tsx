'use client'

import { useState, useTransition, useEffect } from 'react'
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

// ─── VinylTrack — single spinning disc + title ────────────────────────────────

function VinylTrack({
  note,
  isOwner,
  onDelete,
}: {
  note:     PublicNote
  isOwner:  boolean
  onDelete: (id: string) => void
}) {
  const [, startDelete] = useTransition()

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    startDelete(async () => {
      await deleteNoteAction(note.id)
      onDelete(note.id)
    })
  }

  return (
    <div className="flex flex-col items-center w-full" style={{ minWidth: 0 }}>
      {/* Relative wrapper — positions delete button outside the spinning element */}
      <div className="relative flex-shrink-0" style={{ width: 105, height: 105 }}>

        {/* Spinning disc (as <a>) */}
        <a
          href={note.url}
          target="_blank"
          rel="noopener noreferrer"
          className="animate-vinyl absolute inset-0 overflow-hidden flex items-center justify-center"
          style={{ borderRadius: '50%' }}
          aria-label={note.og_title ?? 'Open link'}
        >
          {note.og_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={note.og_image_url}
              alt=""
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                objectFit: 'cover',
                pointerEvents: 'none',
              }}
            />
          ) : (
            <div style={{ position: 'absolute', inset: 0, background: '#1a1a1a' }} />
          )}

          {/* Center hole — rendered last so it sits on top of the image */}
          <div
            style={{
              position: 'absolute',
              width: 8, height: 8,
              borderRadius: '50%',
              background: 'black',
              border: '1px solid #27272a',
              flexShrink: 0,
            }}
          />
        </a>

        {/* Delete button — sibling of the spinning <a>, not inside it */}
        {isOwner && (
          <button
            onClick={handleDelete}
            aria-label="Remove vibe"
            style={{
              position: 'absolute', top: -4, right: -4, zIndex: 10,
              width: 18, height: 18,
              borderRadius: '50%',
              background: '#ef4444',
              border: '1px solid rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Close style={{ width: 10, height: 10, color: 'white' }} />
          </button>
        )}
      </div>

      {/* Title strip */}
      <div
        style={{
          marginTop: 4,
          borderTop: '1px solid var(--color-border)',
          borderBottom: '1px solid var(--color-border)',
          background: 'black',
          padding: '4px',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          className="font-silkscreen leading-none text-primary text-center"
          style={{
            fontSize: 'var(--text-mini)',
            display: 'block',
            width: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {note.og_title ?? note.url}
        </span>
      </div>
    </div>
  )
}

// ─── AddSlot — dashed circle placeholder ─────────────────────────────────────

function AddSlot({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center w-full"
      style={{ minWidth: 0 }}
      aria-label="Add music link"
    >
      <div
        style={{
          width: 100, height: 100,
          borderRadius: '50%',
          border: '1px dashed var(--color-border)',
          background: 'var(--color-surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {/* Pixel + icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <rect x="7" y="2" width="2" height="12" fill="var(--color-tertiary)" />
          <rect x="2" y="7" width="12" height="2" fill="var(--color-tertiary)" />
        </svg>
      </div>

      <div
        style={{
          marginTop: 4,
          borderTop: '1px solid var(--color-border)',
          borderBottom: '1px solid var(--color-border)',
          background: 'black',
          padding: '4px',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          className="font-silkscreen leading-none text-center"
          style={{
            fontSize: 'var(--text-mini)',
            color: 'var(--color-tertiary)',
            display: 'block',
            width: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          add a vibe
        </span>
      </div>
    </button>
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
                  height: 48,
                  background: 'var(--color-purple)',
                  boxShadow: '4px 4px 0 rgba(168,85,247,0.5)',
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
  initialNotes: PublicNote[]
  crews:        Array<{ id: string; name: string }>
  isOwner:      boolean
}

export function VibesGrid({ initialNotes, crews, isOwner }: VibesGridProps) {
  const [notes,   setNotes]   = useState<PublicNote[]>(() => initialNotes.filter(isMusicNote))
  const [showAdd, setShowAdd] = useState(false)

  function handleDelete(id: string) {
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  function handleAdd(note: PublicNote) {
    setNotes(prev => [note, ...prev])
  }

  const canAdd = isOwner && crews.length > 0

  // Build grid items: existing vibes + one add slot for the owner
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

  return (
    <>
      <div
        className="h-full overflow-y-auto nexus-scroll"
        style={{
          padding: '24px 16px',
          paddingBottom: 'max(env(safe-area-inset-bottom), 24px)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
          }}
        >
          {items.map((item) =>
            item === 'add' ? (
              <AddSlot key="__add" onClick={() => setShowAdd(true)} />
            ) : (
              <VinylTrack
                key={item.id}
                note={item}
                isOwner={isOwner}
                onDelete={handleDelete}
              />
            )
          )}
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
