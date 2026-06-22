'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus } from 'pixelarticons/react/Plus'
import { Close } from 'pixelarticons/react/Close'
import { Button } from '@/components/ui/Button'
import {
  addNoteAction,
  fetchMoreNotesAction,
  fetchMoreNotesGlobalAction,
  deleteNoteAction,
  moveToSectionAction,
  createSectionAction,
  deleteSectionAction,
} from './actions'
import type { PublicNote, BoardSection } from '@/types'

// ─── Local types ──────────────────────────────────────────────────────────────

interface PendingNote {
  id:            string
  crew_id:       string
  created_by:    string
  url:           string
  og_title:      null
  og_image_url:  null
  source_domain: null
  section_id:    string | null
  created_at:    string
  pending:       true
}

type GridNote = PublicNote | PendingNote

function isPending(n: GridNote): n is PendingNote {
  return 'pending' in n && (n as PendingNote).pending === true
}

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
    hasMoved.current = false; didLongPress.current = false
    timerRef.current = setTimeout(() => {
      if (!hasMoved.current) { didLongPress.current = true; onLongPress(note) }
    }, 500)
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (Math.abs(e.movementX) > 3 || Math.abs(e.movementY) > 3) { hasMoved.current = true; cancelPress() }
  }
  function handlePointerUp() {
    cancelPress()
    if (!didLongPress.current && !hasMoved.current) window.open(note.url, '_blank', 'noopener,noreferrer')
  }

  const hasImage = !!note.og_image_url && !failed

  return (
    <div
      role="button" tabIndex={0} className="select-none"
      style={{ aspectRatio: '1 / 1', position: 'relative', overflow: 'hidden', background: '#111118', cursor: 'pointer', touchAction: 'manipulation', flexShrink: 0 }}
      onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp} onPointerCancel={cancelPress}
      onContextMenu={(e) => { e.preventDefault(); onLongPress(note) }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') window.open(note.url, '_blank', 'noopener,noreferrer') }}
    >
      {hasImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={note.og_image_url!} alt="" aria-hidden loading="lazy" draggable={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
          onError={onImageError}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #1a0d2e 0%, #111118 100%)' }} />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 55%)', pointerEvents: 'none' }} />
      {note.og_title && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '6px 8px', pointerEvents: 'none' }}>
          <p className="font-body font-semibold" style={{ margin: 0, fontSize: 10, color: '#fff', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontVariationSettings: '"opsz" 10' }}>
            {note.og_title}
          </p>
        </div>
      )}
      {note.source_domain && (
        <div style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.65)', padding: '2px 4px', pointerEvents: 'none' }}>
          <span className="font-silkscreen" style={{ fontSize: 7, color: 'rgba(255,255,255,0.55)', lineHeight: 1 }}>{note.source_domain}</span>
        </div>
      )}
    </div>
  )
}

function PendingNoteCard() {
  return <div className="bg-border animate-pulse" style={{ aspectRatio: '1 / 1', flexShrink: 0 }} />
}

function AddCard({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center justify-center" aria-label="Add card"
      style={{ aspectRatio: '1 / 1', flexShrink: 0, background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.1)' }}>
      <Plus style={{ width: 16, height: 16, color: 'var(--color-tertiary)' }} aria-hidden="true" />
    </button>
  )
}

// ─── Section block ────────────────────────────────────────────────────────────

function SectionBlock({
  sectionId, name, notes, pending, failed, viewerId, isCreator,
  onNoteImageError, onNoteLongPress, onAddCard, onDeleteSection,
}: {
  sectionId:        string | null
  name:             string
  notes:            PublicNote[]
  pending:          PendingNote[]
  failed:           Set<string>
  viewerId:         string
  isCreator:        boolean
  onNoteImageError: (id: string) => void
  onNoteLongPress:  (note: PublicNote) => void
  onAddCard:        (sectionId: string | null) => void
  onDeleteSection:  (sectionId: string) => void
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="flex items-center justify-between" style={{ padding: '12px 12px 6px' }}>
        <span className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)', letterSpacing: '0.05em' }}>
          {name}
        </span>
        {sectionId && isCreator && (
          <button
            onClick={() => onDeleteSection(sectionId)}
            className="flex items-center justify-center"
            aria-label={`Delete section ${name}`}
            style={{ width: 20, height: 20 }}
          >
            <Close style={{ width: 12, height: 12, color: 'var(--color-tertiary)' }} aria-hidden="true" />
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, paddingLeft: 3, paddingRight: 3 }}>
        {pending.map(n => <PendingNoteCard key={n.id} />)}
        {notes.map(n => (
          <NoteCard
            key={n.id}
            note={n}
            failed={failed.has(n.id)}
            onImageError={() => onNoteImageError(n.id)}
            onLongPress={onNoteLongPress}
          />
        ))}
        <AddCard onClick={() => onAddCard(sectionId)} />
      </div>
    </div>
  )
}

// ─── Sheets ───────────────────────────────────────────────────────────────────

const SHEET_SPRING = { type: 'spring' as const, stiffness: 320, damping: 32 }

function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <motion.div className="fixed inset-0 z-[60] bg-black/60"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[70] bg-black border-t border-border"
        style={{ maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', paddingBottom: 'max(28px, env(safe-area-inset-bottom))' }}
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={SHEET_SPRING}
        drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 1 }}
        onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 400) onClose() }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </>
  )
}

function CardActionSheet({
  note, sections, isCreator, deleting,
  onClose, onOpen, onDelete, onMoveToSection,
}: {
  note:            PublicNote
  sections:        BoardSection[]
  isCreator:       boolean
  deleting:        boolean
  onClose:         () => void
  onOpen:          () => void
  onDelete:        () => void
  onMoveToSection: () => void
}) {
  return (
    <Sheet onClose={onClose}>
      {(note.og_title || note.source_domain) && (
        <div className="flex flex-col" style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--color-border)', gap: 2 }}>
          {note.og_title && <p className="font-body font-semibold text-primary leading-snug" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>{note.og_title}</p>}
          {note.source_domain && <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>{note.source_domain}</p>}
        </div>
      )}
      <div className="flex flex-col" style={{ padding: '8px 0' }}>
        <button onClick={onOpen} className="w-full text-left" style={{ padding: '14px 16px' }}>
          <span className="font-body font-medium text-primary" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>Open Link</span>
        </button>
        {sections.length > 0 && isCreator && (
          <button onClick={onMoveToSection} className="w-full text-left" style={{ padding: '14px 16px' }}>
            <span className="font-body font-medium text-primary" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>Move to Section</span>
          </button>
        )}
        {isCreator && (
          <button onClick={onDelete} disabled={deleting} className="w-full text-left disabled:opacity-40" style={{ padding: '14px 16px' }}>
            <span className="font-body font-medium" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14', color: 'var(--color-danger)' }}>
              {deleting ? 'Removing…' : 'Remove Card'}
            </span>
          </button>
        )}
      </div>
    </Sheet>
  )
}

function MoveToSectionSheet({
  note, sections, onClose, onMove,
}: {
  note:     PublicNote
  sections: BoardSection[]
  onClose:  () => void
  onMove:   (sectionId: string | null) => void
}) {
  return (
    <Sheet onClose={onClose}>
      <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)', padding: '16px 16px 8px' }}>
        MOVE TO SECTION
      </p>
      <div className="flex flex-col" style={{ padding: '4px 0' }}>
        <button onClick={() => onMove(null)} className="w-full text-left" style={{ padding: '14px 16px' }}>
          <span className="font-body font-medium" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14', color: note.section_id === null ? 'var(--color-purple)' : 'var(--color-primary)' }}>
            Unsorted {note.section_id === null && '✓'}
          </span>
        </button>
        {sections.map(s => (
          <button key={s.id} onClick={() => onMove(s.id)} className="w-full text-left" style={{ padding: '14px 16px' }}>
            <span className="font-body font-medium" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14', color: note.section_id === s.id ? 'var(--color-purple)' : 'var(--color-primary)' }}>
              {s.name} {note.section_id === s.id && '✓'}
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}

function AddCardSheet({
  sections,
  defaultSectionId,
  crews,
  defaultCrewId,
  lockCrew,
  onClose,
  onAdd,
}: {
  sections:         BoardSection[]
  defaultSectionId: string | null
  crews:            Array<{ id: string; name: string }>
  defaultCrewId:    string
  lockCrew:         boolean
  onClose:          () => void
  onAdd:            (url: string, sectionId: string | null, crewId: string) => Promise<string | null>
}) {
  const [addUrl,    setAddUrl]    = useState('')
  const [sectionId, setSectionId] = useState<string | null>(defaultSectionId)
  const [crewId,    setCrewId]    = useState(defaultCrewId)
  const [adding,    setAdding]    = useState(false)
  const [addError,  setAddError]  = useState<string | null>(null)

  async function handleAdd() {
    const url = addUrl.trim()
    if (!url || adding) return
    setAdding(true)
    const err = await onAdd(url, sectionId, crewId)
    setAdding(false)
    if (err) { setAddError(err); return }
    setAddUrl(''); onClose()
  }

  return (
    <Sheet onClose={onClose}>
      <div className="flex flex-col" style={{ gap: 16, padding: 24 }}>
        <p className="font-body font-bold text-primary leading-none" style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}>
          Add to Vibes
        </p>

        {/* Crew picker — only in global (non-lockCrew) mode with multiple crews */}
        {!lockCrew && crews.length > 1 && (
          <div className="flex flex-col" style={{ gap: 8 }}>
            <p className="font-body font-medium text-primary" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>Squad</p>
            <div className="flex flex-wrap" style={{ gap: 6 }}>
              {crews.map(c => (
                <button
                  key={c.id}
                  onClick={() => setCrewId(c.id)}
                  className="font-silkscreen"
                  style={{ fontSize: 'var(--text-mini)', padding: '5px 10px', background: 'transparent', border: `1px solid ${crewId === c.id ? 'var(--color-purple)' : 'var(--color-border)'}`, color: crewId === c.id ? 'var(--color-purple)' : 'var(--color-tertiary)' }}
                >
                  {c.name.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Section picker — only in lockCrew mode when sections exist */}
        {lockCrew && sections.length > 0 && (
          <div className="flex flex-col" style={{ gap: 8 }}>
            <p className="font-body font-medium text-primary" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>Section</p>
            <div className="flex flex-wrap" style={{ gap: 6 }}>
              <button
                onClick={() => setSectionId(null)}
                className="font-silkscreen"
                style={{ fontSize: 'var(--text-mini)', padding: '5px 10px', border: `1px solid ${sectionId === null ? 'var(--color-purple)' : 'var(--color-border)'}`, color: sectionId === null ? 'var(--color-purple)' : 'var(--color-tertiary)', background: 'transparent' }}
              >
                UNSORTED
              </button>
              {sections.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSectionId(s.id)}
                  className="font-silkscreen"
                  style={{ fontSize: 'var(--text-mini)', padding: '5px 10px', border: `1px solid ${sectionId === s.id ? 'var(--color-purple)' : 'var(--color-border)'}`, color: sectionId === s.id ? 'var(--color-purple)' : 'var(--color-tertiary)', background: 'transparent' }}
                >
                  {s.name.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col" style={{ gap: 8 }}>
          <p className="font-body font-medium text-primary" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>URL</p>
          <div className="bg-black border h-[48px] flex items-center overflow-hidden px-3 w-full"
            style={{ borderColor: addError ? 'var(--color-danger)' : 'var(--color-border-hover)' }}>
            <input
              type="url" value={addUrl}
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
          ADD TO VIBES
        </Button>
      </div>
    </Sheet>
  )
}

function CreateSectionSheet({
  onClose, onCreate,
}: {
  onClose:  () => void
  onCreate: (name: string) => Promise<string | null>
}) {
  const [name,   setName]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  async function handleCreate() {
    const n = name.trim()
    if (!n || saving) return
    setSaving(true)
    const err = await onCreate(n)
    setSaving(false)
    if (err) { setError(err); return }
    setName(''); onClose()
  }

  return (
    <Sheet onClose={onClose}>
      <div className="flex flex-col" style={{ gap: 16, padding: 24 }}>
        <p className="font-body font-bold text-primary leading-none" style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}>
          New Section
        </p>
        <div className="flex flex-col" style={{ gap: 8 }}>
          <div className="bg-black border h-[48px] flex items-center overflow-hidden px-3 w-full"
            style={{ borderColor: error ? 'var(--color-danger)' : 'var(--color-border-hover)' }}>
            <input
              type="text" value={name}
              onChange={(e) => { setName(e.target.value); setError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
              placeholder="Section name…"
              autoFocus maxLength={100}
              className="flex-1 bg-transparent font-body font-normal text-primary placeholder:text-tertiary focus:outline-none leading-normal"
              style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
            />
          </div>
          {error && <p className="font-pixel text-[8px]" style={{ color: 'var(--color-danger)' }}>{error}</p>}
        </div>
        <Button onClick={handleCreate} disabled={!name.trim() || saving} loading={saving} className="w-full">
          CREATE SECTION
        </Button>
      </div>
    </Sheet>
  )
}

// ─── NotesGrid ────────────────────────────────────────────────────────────────

export interface NotesGridProps {
  viewerId:        string
  initialNotes:    PublicNote[]
  initialSections: BoardSection[]
  crews:           Array<{ id: string; name: string }>
  initialCrewId:   string
  lockCrew?:       boolean
}

export function NotesGrid({
  viewerId,
  initialNotes,
  initialSections,
  crews,
  initialCrewId,
  lockCrew = false,
}: NotesGridProps) {
  const [notes,        setNotes]        = useState<GridNote[]>(initialNotes)
  const [sections,     setSections]     = useState<BoardSection[]>(initialSections)
  const [hasMore,      setHasMore]      = useState(initialNotes.length === 30)
  const [loadingMore,  setLoadingMore]  = useState(false)
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())

  // Card action sheet
  const [activeNote,    setActiveNote]    = useState<PublicNote | null>(null)
  const [deleting,      setDeleting]      = useState(false)
  const [showMoveSheet, setShowMoveSheet] = useState(false)

  // Add card sheet
  const [addSectionId, setAddSectionId] = useState<string | null>(null)
  const [showAddSheet, setShowAddSheet] = useState(false)

  // Section creation (lockCrew only)
  const [showCreateSection, setShowCreateSection] = useState(false)

  // ── Pagination ──────────────────────────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<() => void>(() => {})

  const crewIds = useMemo(() => crews.map(c => c.id), [crews])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    const cursor = notes.filter(n => !isPending(n)).at(-1)?.created_at
    if (!cursor) return
    setLoadingMore(true)
    try {
      const more = lockCrew
        ? await fetchMoreNotesAction(cursor, initialCrewId)
        : await fetchMoreNotesGlobalAction(cursor, crewIds)
      setNotes(prev => [...prev, ...more])
      setHasMore(more.length === 30)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, notes, lockCrew, initialCrewId, crewIds])

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

  // ── Add card ────────────────────────────────────────────────────────────────
  async function handleAdd(url: string, sectionId: string | null, crewId: string): Promise<string | null> {
    const tempId = `pending-${Date.now()}`
    const pending: PendingNote = {
      id: tempId, crew_id: crewId, created_by: viewerId,
      url, og_title: null, og_image_url: null, source_domain: null,
      section_id: sectionId, created_at: new Date().toISOString(), pending: true,
    }
    setNotes(prev => [pending, ...prev])
    try {
      const result = await addNoteAction(crewId, url, sectionId)
      if (result.error || !result.note) {
        setNotes(prev => prev.filter(n => n.id !== tempId))
        return result.error ?? 'Failed to add card'
      }
      setNotes(prev => prev.map(n => n.id === tempId ? { ...result.note! } : n))
      return null
    } catch {
      setNotes(prev => prev.filter(n => n.id !== tempId))
      return 'Something went wrong'
    }
  }

  // ── Delete card ─────────────────────────────────────────────────────────────
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

  // ── Move to section ─────────────────────────────────────────────────────────
  async function handleMove(sectionId: string | null) {
    if (!activeNote) return
    const noteId   = activeNote.id
    const previous = activeNote.section_id
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, section_id: sectionId } : n))
    setActiveNote(null)
    setShowMoveSheet(false)
    const result = await moveToSectionAction(noteId, sectionId)
    if (result.error) setNotes(prev => prev.map(n => n.id === noteId ? { ...n, section_id: previous } : n))
  }

  // ── Create section ──────────────────────────────────────────────────────────
  async function handleCreateSection(name: string): Promise<string | null> {
    const result = await createSectionAction(initialCrewId, name)
    if (result.error || !result.section) return result.error ?? 'Failed to create section'
    setSections(prev => [...prev, result.section!])
    return null
  }

  // ── Delete section ──────────────────────────────────────────────────────────
  async function handleDeleteSection(sectionId: string) {
    setSections(prev => prev.filter(s => s.id !== sectionId))
    setNotes(prev => prev.map(n => ('section_id' in n && n.section_id === sectionId) ? { ...n, section_id: null } : n))
    await deleteSectionAction(sectionId)
  }

  // ── Group notes by section (lockCrew only) ──────────────────────────────────
  const { grouped, unsorted, pendingBySectionId } = useMemo(() => {
    const realNotes    = notes.filter(n => !isPending(n)) as PublicNote[]
    const pendingNotes = notes.filter(isPending) as PendingNote[]

    const byId: Record<string, PublicNote[]> = {}
    for (const n of realNotes) {
      const key = n.section_id ?? '__unsorted__'
      byId[key] = [...(byId[key] ?? []), n]
    }

    const pendingById: Record<string, PendingNote[]> = {}
    for (const n of pendingNotes) {
      const key = n.section_id ?? '__unsorted__'
      pendingById[key] = [...(pendingById[key] ?? []), n]
    }

    return {
      grouped:            sections.map(s => ({ section: s, notes: byId[s.id] ?? [] })),
      unsorted:           byId['__unsorted__'] ?? [],
      pendingBySectionId: pendingById,
    }
  }, [notes, sections])

  const isCreator = (s: BoardSection) => s.created_by === viewerId

  if (crews.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height: '100%', padding: 48 }}>
        <p className="font-silkscreen text-center" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)', lineHeight: 2 }}>
          JOIN A CREW TO START{'\n'}COLLECTING VIBES
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      {/* ── Scrollable content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto nexus-scroll">
        {lockCrew ? (
          <>
            {/* + SECTION button (lockCrew only) */}
            <div className="flex justify-end" style={{ padding: '8px 12px' }}>
              <button
                onClick={() => setShowCreateSection(true)}
                className="flex items-center font-silkscreen"
                style={{ fontSize: 'var(--text-mini)', color: 'var(--color-purple)', gap: 4 }}
              >
                <Plus style={{ width: 10, height: 10, color: 'var(--color-purple)' }} aria-hidden="true" />
                SECTION
              </button>
            </div>

            {/* Named sections */}
            {grouped.map(({ section, notes: sNotes }) => (
              <SectionBlock
                key={section.id}
                sectionId={section.id}
                name={section.name.toUpperCase()}
                notes={sNotes}
                pending={pendingBySectionId[section.id] ?? []}
                failed={failedImages}
                viewerId={viewerId}
                isCreator={isCreator(section)}
                onNoteImageError={(id) => setFailedImages(prev => new Set(prev).add(id))}
                onNoteLongPress={setActiveNote}
                onAddCard={(sid) => { setAddSectionId(sid); setShowAddSheet(true) }}
                onDeleteSection={handleDeleteSection}
              />
            ))}

            {/* Unsorted */}
            <SectionBlock
              sectionId={null}
              name="UNSORTED"
              notes={unsorted}
              pending={pendingBySectionId['__unsorted__'] ?? []}
              failed={failedImages}
              viewerId={viewerId}
              isCreator={false}
              onNoteImageError={(id) => setFailedImages(prev => new Set(prev).add(id))}
              onNoteLongPress={setActiveNote}
              onAddCard={(sid) => { setAddSectionId(sid); setShowAddSheet(true) }}
              onDeleteSection={() => {}}
            />
          </>
        ) : (
          <>
            {/* Global flat grid — all squads */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3, padding: 3, paddingTop: 8 }}>
              {(notes.filter(isPending) as PendingNote[]).map(n => <PendingNoteCard key={n.id} />)}
              {(notes.filter(n => !isPending(n)) as PublicNote[]).map(n => (
                <NoteCard
                  key={n.id}
                  note={n}
                  failed={failedImages.has(n.id)}
                  onImageError={() => setFailedImages(prev => new Set(prev).add(n.id))}
                  onLongPress={setActiveNote}
                />
              ))}
              <AddCard onClick={() => { setAddSectionId(null); setShowAddSheet(true) }} />
            </div>
          </>
        )}

        {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
        {loadingMore && (
          <div className="flex justify-center" style={{ padding: '16px 0' }}>
            <div className="flex items-center gap-1">
              {[0, 150, 300].map(d => (
                <span key={d} className="inline-block w-1 h-1 bg-border animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}
        <div style={{ height: 'max(env(safe-area-inset-bottom), 24px)' }} />
      </div>

      {/* ── Sheets ────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {activeNote && !showMoveSheet && (
          <CardActionSheet
            note={activeNote}
            sections={sections}
            isCreator={activeNote.created_by === viewerId}
            deleting={deleting}
            onClose={() => setActiveNote(null)}
            onOpen={() => { window.open(activeNote.url, '_blank', 'noopener,noreferrer'); setActiveNote(null) }}
            onDelete={handleDelete}
            onMoveToSection={() => setShowMoveSheet(true)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeNote && showMoveSheet && (
          <MoveToSectionSheet
            note={activeNote}
            sections={sections}
            onClose={() => { setShowMoveSheet(false); setActiveNote(null) }}
            onMove={handleMove}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAddSheet && (
          <AddCardSheet
            sections={lockCrew ? sections : []}
            defaultSectionId={addSectionId}
            crews={crews}
            defaultCrewId={initialCrewId}
            lockCrew={lockCrew}
            onClose={() => setShowAddSheet(false)}
            onAdd={handleAdd}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCreateSection && (
          <CreateSectionSheet
            onClose={() => setShowCreateSection(false)}
            onCreate={handleCreateSection}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
