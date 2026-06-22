'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus } from 'pixelarticons/react/Plus'
import { Button } from '@/components/ui/Button'
import { addNoteAction, fetchMoreNotesAction, deleteNoteAction } from './actions'
import type { PublicNote } from '@/types'

// ─── Local types ──────────────────────────────────────────────────────────────

interface PendingNote {
  id:            string
  crew_id:       string
  created_by:    string
  url:           string
  og_title:      null
  og_image_url:  null
  source_domain: null
  created_at:    string
  pending:       true
}

type GridNote = PublicNote | PendingNote

// ─── NoteCard ─────────────────────────────────────────────────────────────────

function NoteCard({
  note,
  failed,
  onImageError,
  onLongPress,
}: {
  note:         PublicNote
  failed:       boolean
  onImageError: () => void
  onLongPress:  (note: PublicNote) => void
}) {
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasMoved     = useRef(false)
  const didLongPress = useRef(false)

  function cancelPress() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    hasMoved.current    = false
    didLongPress.current = false
    timerRef.current = setTimeout(() => {
      if (!hasMoved.current) {
        didLongPress.current = true
        onLongPress(note)
      }
    }, 500)
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (Math.abs(e.movementX) > 3 || Math.abs(e.movementY) > 3) {
      hasMoved.current = true
      cancelPress()
    }
  }

  function handlePointerUp() {
    cancelPress()
    if (!didLongPress.current && !hasMoved.current) {
      window.open(note.url, '_blank', 'noopener,noreferrer')
    }
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    onLongPress(note)
  }

  const hasImage = !!note.og_image_url && !failed

  return (
    <div
      role="button"
      tabIndex={0}
      className="select-none"
      style={{ aspectRatio: '1 / 1', position: 'relative', overflow: 'hidden', background: '#111118', cursor: 'pointer', touchAction: 'manipulation', flexShrink: 0 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={cancelPress}
      onContextMenu={handleContextMenu}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') window.open(note.url, '_blank', 'noopener,noreferrer') }}
    >
      {hasImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={note.og_image_url!}
          alt=""
          aria-hidden
          loading="lazy"
          draggable={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
          onError={onImageError}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #1a0d2e 0%, #111118 100%)' }} />
      )}

      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 55%)', pointerEvents: 'none' }} />

      {note.og_title && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '6px 8px', pointerEvents: 'none' }}>
          <p
            className="font-body font-semibold"
            style={{ margin: 0, fontSize: 10, color: '#fff', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontVariationSettings: '"opsz" 10' }}
          >
            {note.og_title}
          </p>
        </div>
      )}

      {note.source_domain && (
        <div style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.65)', padding: '2px 4px', pointerEvents: 'none' }}>
          <span className="font-silkscreen" style={{ fontSize: 7, color: 'rgba(255,255,255,0.55)', lineHeight: 1 }}>
            {note.source_domain}
          </span>
        </div>
      )}
    </div>
  )
}

function PendingNoteCard() {
  return <div className="bg-border animate-pulse" style={{ aspectRatio: '1 / 1', flexShrink: 0 }} />
}

function AddPlaceholderCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-border flex items-center justify-center"
      style={{ aspectRatio: '1 / 1', flexShrink: 0, opacity: 0.6 }}
      aria-label="Add a link"
    >
      <Plus style={{ width: 20, height: 20, color: 'var(--color-tertiary)' }} aria-hidden="true" />
    </button>
  )
}

// ─── Note action sheet ────────────────────────────────────────────────────────

function NoteActionSheet({
  note,
  isCreator,
  deleting,
  onClose,
  onOpen,
  onDelete,
}: {
  note:      PublicNote
  isCreator: boolean
  deleting:  boolean
  onClose:   () => void
  onOpen:    () => void
  onDelete:  () => void
}) {
  return (
    <>
      <motion.div
        className="fixed inset-0 z-[60] bg-black/60"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[70] bg-black border-t border-border"
        style={{ maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', paddingBottom: 'max(28px, env(safe-area-inset-bottom))' }}
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 400) onClose() }}
        onClick={(e) => e.stopPropagation()}
      >
        {(note.og_title || note.source_domain) && (
          <div className="flex flex-col" style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--color-border)', gap: 2 }}>
            {note.og_title && (
              <p className="font-body font-semibold text-primary leading-snug" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
                {note.og_title}
              </p>
            )}
            {note.source_domain && (
              <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
                {note.source_domain}
              </p>
            )}
          </div>
        )}
        <div className="flex flex-col" style={{ padding: '8px 0' }}>
          <button onClick={onOpen} className="w-full flex items-center text-left" style={{ padding: '14px 16px' }}>
            <span className="font-body font-medium text-primary" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>Open Link</span>
          </button>
          {isCreator && (
            <button onClick={onDelete} disabled={deleting} className="w-full flex items-center text-left disabled:opacity-40" style={{ padding: '14px 16px' }}>
              <span className="font-body font-medium" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14', color: 'var(--color-danger)' }}>
                {deleting ? 'Removing…' : 'Remove Note'}
              </span>
            </button>
          )}
        </div>
      </motion.div>
    </>
  )
}

// ─── Add note sheet ───────────────────────────────────────────────────────────

function AddNoteSheet({
  crews,
  filterCrewId,
  onClose,
  onAdd,
}: {
  crews:         Array<{ id: string; name: string }>
  filterCrewId?: string
  onClose:       () => void
  onAdd:         (crewId: string, url: string) => Promise<string | null>
}) {
  const defaultCrewId = filterCrewId ?? crews[0]?.id ?? ''
  const [selectedCrewId, setSelectedCrewId] = useState(defaultCrewId)
  const [addUrl,         setAddUrl]         = useState('')
  const [adding,         setAdding]         = useState(false)
  const [addError,       setAddError]       = useState<string | null>(null)

  async function handleAdd() {
    const url = addUrl.trim()
    if (!url || adding) return
    setAdding(true)
    const err = await onAdd(selectedCrewId, url)
    setAdding(false)
    if (err) { setAddError(err); return }
    setAddUrl('')
    onClose()
  }

  return (
    <>
      <motion.div
        className="fixed inset-0 z-[60] bg-black/60"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[70] bg-black border-t border-border flex flex-col"
        style={{ maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', paddingBottom: 'max(28px, env(safe-area-inset-bottom))' }}
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 400) onClose() }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col" style={{ gap: 16, padding: 24 }}>
          <p className="font-body font-bold text-primary leading-none" style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}>
            Add to Board
          </p>

          {!filterCrewId && crews.length > 1 && (
            <div className="flex flex-col" style={{ gap: 8 }}>
              <p className="font-body font-medium text-primary" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>Crew</p>
              <div className="relative bg-black border h-[48px] flex items-center overflow-hidden px-3 w-full" style={{ borderColor: 'var(--color-border-hover)' }}>
                <select
                  value={selectedCrewId}
                  onChange={(e) => setSelectedCrewId(e.target.value)}
                  className="flex-1 bg-transparent font-body font-normal text-primary focus:outline-none appearance-none leading-normal"
                  style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
                >
                  {crews.map(crew => (
                    <option key={crew.id} value={crew.id} style={{ background: '#000' }}>{crew.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="flex flex-col" style={{ gap: 8 }}>
            <p className="font-body font-medium text-primary" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>URL</p>
            <div
              className="bg-black border h-[48px] flex items-center overflow-hidden px-3 w-full"
              style={{ borderColor: addError ? 'var(--color-danger)' : 'var(--color-border-hover)' }}
            >
              <input
                type="url"
                value={addUrl}
                onChange={(e) => { setAddUrl(e.target.value); setAddError(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
                placeholder="https://..."
                autoFocus
                className="flex-1 bg-transparent font-body font-normal text-primary placeholder:text-tertiary focus:outline-none leading-normal"
                style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
              />
            </div>
            {addError && <p className="font-pixel text-[8px]" style={{ color: 'var(--color-danger)' }}>{addError}</p>}
          </div>

          <Button onClick={handleAdd} disabled={!addUrl.trim() || adding} loading={adding} className="w-full">
            ADD TO BOARD
          </Button>
        </div>
      </motion.div>
    </>
  )
}

// ─── NotesGrid ────────────────────────────────────────────────────────────────

export interface NotesGridProps {
  userId:        string
  initialNotes:  PublicNote[]
  crews:         Array<{ id: string; name: string }>
  filterCrewId?: string
}

export function NotesGrid({ userId, initialNotes, crews, filterCrewId }: NotesGridProps) {
  const [notes,        setNotes]        = useState<GridNote[]>(initialNotes)
  const [hasMore,      setHasMore]      = useState(initialNotes.length === 30)
  const [loadingMore,  setLoadingMore]  = useState(false)
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())
  const [activeNote,   setActiveNote]   = useState<PublicNote | null>(null)
  const [deleting,     setDeleting]     = useState(false)
  const [showAddSheet, setShowAddSheet] = useState(false)

  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<() => void>(() => {})

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    const cursor = notes.filter(n => !('pending' in n && n.pending)).at(-1)?.created_at
    if (!cursor) return
    setLoadingMore(true)
    try {
      const more = await fetchMoreNotesAction(cursor, filterCrewId)
      setNotes(prev => [...prev, ...more])
      setHasMore(more.length === 30)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, notes, filterCrewId])

  useEffect(() => { loadMoreRef.current = loadMore }, [loadMore])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMoreRef.current() },
      { rootMargin: '200px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore])

  async function handleAdd(crewId: string, url: string): Promise<string | null> {
    const tempId = `pending-${Date.now()}`
    const pending: PendingNote = {
      id: tempId, crew_id: crewId, created_by: userId,
      url, og_title: null, og_image_url: null, source_domain: null,
      created_at: new Date().toISOString(), pending: true,
    }
    setNotes(prev => [pending, ...prev])
    try {
      const result = await addNoteAction(crewId, url)
      if (result.error || !result.note) {
        setNotes(prev => prev.filter(n => n.id !== tempId))
        return result.error ?? 'Failed to add note'
      }
      setNotes(prev => prev.map(n => n.id === tempId ? { ...result.note! } : n))
      return null
    } catch {
      setNotes(prev => prev.filter(n => n.id !== tempId))
      return 'Something went wrong'
    }
  }

  async function handleDelete() {
    if (!activeNote || deleting) return
    const noteId  = activeNote.id
    const removed = notes.find(n => n.id === noteId)
    setNotes(prev => prev.filter(n => n.id !== noteId))
    setActiveNote(null)
    setDeleting(true)
    try {
      const result = await deleteNoteAction(noteId)
      if (result.error && removed) setNotes(prev => [removed, ...prev.filter(n => n.id !== noteId)])
    } finally {
      setDeleting(false)
    }
  }

  function markImageFailed(noteId: string) {
    setFailedImages(prev => new Set(prev).add(noteId))
  }

  const isEmpty = crews.length === 0

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <div className="flex-1 overflow-y-auto nexus-scroll">
        {isEmpty ? (
          <div className="flex items-center justify-center" style={{ padding: 48 }}>
            <p className="font-silkscreen text-center" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)', lineHeight: 2 }}>
              JOIN A CREW TO START COLLECTING LINKS
            </p>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, padding: 4 }}>
              {notes.map(note =>
                'pending' in note && note.pending
                  ? <PendingNoteCard key={note.id} />
                  : (
                    <NoteCard
                      key={note.id}
                      note={note as PublicNote}
                      failed={failedImages.has(note.id)}
                      onImageError={() => markImageFailed(note.id)}
                      onLongPress={(n) => setActiveNote(n)}
                    />
                  )
              )}
              <AddPlaceholderCard onClick={() => setShowAddSheet(true)} />
            </div>
            {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
            {loadingMore && (
              <div className="flex justify-center" style={{ paddingTop: 16 }}>
                <div className="flex items-center gap-1">
                  {[0, 150, 300].map(d => (
                    <span key={d} className="inline-block w-1 h-1 bg-border animate-bounce" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        <div style={{ height: 'max(env(safe-area-inset-bottom), 24px)' }} />
      </div>

      <AnimatePresence>
        {activeNote && (
          <NoteActionSheet
            note={activeNote}
            isCreator={activeNote.created_by === userId}
            deleting={deleting}
            onClose={() => setActiveNote(null)}
            onOpen={() => { window.open(activeNote.url, '_blank', 'noopener,noreferrer'); setActiveNote(null) }}
            onDelete={handleDelete}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddSheet && (
          <AddNoteSheet
            crews={crews}
            filterCrewId={filterCrewId}
            onClose={() => setShowAddSheet(false)}
            onAdd={handleAdd}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
