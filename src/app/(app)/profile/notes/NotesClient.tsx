'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { TokeCircle } from 'pixelarticons/react/TokeCircle'
import { Heart } from 'pixelarticons/react/Heart'
import { Plus } from 'pixelarticons/react/Plus'
import { Message } from 'pixelarticons/react/Message'
import { SlidePage, useSlideBack } from '@/components/ui/SlidePage'
import { MarqueeBanner } from '@/components/ui/MarqueeBanner'
import { Button } from '@/components/ui/Button'
import { isSupabaseStorage, resolveAvatarUrl } from '@/components/ui/Avatar'
import { addNoteAction, fetchMoreNotesAction } from './actions'
import type { PublicNote } from '@/types'

// ─── Local types ──────────────────────────────────────────────────────────────

interface PendingNote {
  id:            string
  crew_id:       string
  created_by:    string
  og_title:      null
  og_image_url:  null
  source_domain: null
  created_at:    string
  pending:       true
}

type GridNote = PublicNote | PendingNote

// ─── Sub-components ──────────────────────────────────────────────────────────

function BackButton() {
  const goBack = useSlideBack()
  return (
    <button
      onClick={goBack}
      aria-label="Back"
      className="flex items-center justify-center flex-shrink-0"
      style={{ width: 24, height: 24 }}
    >
      <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
    </button>
  )
}

function ProfileStatusTicker({ status }: { status: string }) {
  return (
    <MarqueeBanner
      text={status}
      icon={<Message style={{ width: 8, height: 8, color: 'var(--color-tertiary)' }} aria-hidden="true" />}
      quoted
    />
  )
}

function NoteCard({
  note,
  failed,
  onImageError,
}: {
  note:         PublicNote
  failed:       boolean
  onImageError: () => void
}) {
  const hasImage = !!note.og_image_url && !failed
  return (
    <div
      style={{
        aspectRatio: '1 / 1',
        position:    'relative',
        overflow:    'hidden',
        background:  '#111118',
        flexShrink:  0,
      }}
    >
      {hasImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={note.og_image_url!}
          alt=""
          aria-hidden
          loading="lazy"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          onError={onImageError}
        />
      ) : (
        <div
          style={{
            position:   'absolute',
            inset:      0,
            background: 'linear-gradient(135deg, #1a0d2e 0%, #111118 100%)',
          }}
        />
      )}

      {/* bottom gradient */}
      <div
        style={{
          position:   'absolute',
          inset:      0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 55%)',
          pointerEvents: 'none',
        }}
      />

      {/* title overlay */}
      {note.og_title && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '6px 8px' }}>
          <p
            className="font-body font-semibold"
            style={{
              margin:             0,
              fontSize:           10,
              color:             '#fff',
              lineHeight:        1.3,
              display:           '-webkit-box',
              WebkitLineClamp:    2,
              WebkitBoxOrient:   'vertical',
              overflow:          'hidden',
              fontVariationSettings: '"opsz" 10',
            }}
          >
            {note.og_title}
          </p>
        </div>
      )}

      {/* domain badge */}
      {note.source_domain && (
        <div
          style={{
            position:   'absolute',
            top:         4,
            right:       4,
            background: 'rgba(0,0,0,0.65)',
            padding:    '2px 4px',
          }}
        >
          <span
            className="font-silkscreen"
            style={{ fontSize: 7, color: 'rgba(255,255,255,0.55)', lineHeight: 1 }}
          >
            {note.source_domain}
          </span>
        </div>
      )}
    </div>
  )
}

function PendingNoteCard() {
  return (
    <div
      className="bg-border animate-pulse"
      style={{ aspectRatio: '1 / 1', flexShrink: 0 }}
    />
  )
}

function AddPlaceholderCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-border animate-pulse flex items-center justify-center"
      style={{ aspectRatio: '1 / 1', flexShrink: 0 }}
      aria-label="Add a link"
    >
      <Plus style={{ width: 20, height: 20, color: 'var(--color-tertiary)' }} aria-hidden="true" />
    </button>
  )
}

// ─── NotesClient ──────────────────────────────────────────────────────────────

interface NotesClientProps {
  userId:           string
  avatarUrl:        string | null
  backgroundUrl:    string | null
  username:         string
  status:           string | null
  memberSinceYear:  string
  totalMessages:    number
  groupChats:       number
  coins:            number
  totalFriendshipXP: number
  crews:            Array<{ id: string; name: string }>
  initialNotes:     PublicNote[]
}

export function NotesClient({
  userId,
  avatarUrl,
  backgroundUrl,
  username,
  status,
  memberSinceYear,
  totalMessages,
  groupChats,
  coins,
  totalFriendshipXP,
  crews,
  initialNotes,
}: NotesClientProps) {
  const router = useRouter()

  // ── Notes state ────────────────────────────────────────────────────────────
  const [notes,        setNotes]        = useState<GridNote[]>(initialNotes)
  const [hasMore,      setHasMore]      = useState(initialNotes.length === 30)
  const [loadingMore,  setLoadingMore]  = useState(false)
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())

  // ── Add sheet state ────────────────────────────────────────────────────────
  const [showAddSheet,    setShowAddSheet]    = useState(false)
  const [addUrl,          setAddUrl]          = useState('')
  const [selectedCrewId,  setSelectedCrewId]  = useState(crews[0]?.id ?? '')
  const [adding,          setAdding]          = useState(false)
  const [addError,        setAddError]        = useState<string | null>(null)

  // ── Computed hero values ───────────────────────────────────────────────────
  const initial       = username[0]?.toUpperCase() ?? '?'
  const msgFormatted  = totalMessages.toLocaleString()
  const fxpLevel      = Math.floor(totalFriendshipXP / 100) + 1
  const fxpProgress   = totalFriendshipXP % 100
  const fxpPercent    = (fxpProgress / 100) * 100

  // ── Infinite scroll ────────────────────────────────────────────────────────
  const sentinelRef   = useRef<HTMLDivElement>(null)
  const loadMoreRef   = useRef<() => void>(() => {})

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    const cursor = notes.filter(n => !('pending' in n && n.pending)).at(-1)?.created_at
    if (!cursor) return
    setLoadingMore(true)
    try {
      const more = await fetchMoreNotesAction(cursor)
      setNotes(prev => [...prev, ...more])
      setHasMore(more.length === 30)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, hasMore, notes])

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

  // ── Add note ───────────────────────────────────────────────────────────────
  async function handleAddNote() {
    const url = addUrl.trim()
    if (!url || !selectedCrewId || adding) return

    const tempId      = `pending-${Date.now()}`
    const pendingNote: PendingNote = {
      id:            tempId,
      crew_id:       selectedCrewId,
      created_by:    userId,
      og_title:      null,
      og_image_url:  null,
      source_domain: null,
      created_at:    new Date().toISOString(),
      pending:       true,
    }

    setAdding(true)
    setNotes(prev => [pendingNote, ...prev])
    setShowAddSheet(false)

    try {
      const result = await addNoteAction(selectedCrewId, url)
      if (result.error || !result.note) {
        setNotes(prev => prev.filter(n => n.id !== tempId))
        setAddError(result.error ?? 'Failed to add note')
        setShowAddSheet(true)
        return
      }
      setNotes(prev => prev.map(n => n.id === tempId ? { ...result.note! } : n))
      setAddUrl('')
    } catch {
      setNotes(prev => prev.filter(n => n.id !== tempId))
      setAddError('Something went wrong')
      setShowAddSheet(true)
    } finally {
      setAdding(false)
    }
  }

  function markImageFailed(noteId: string) {
    setFailedImages(prev => new Set(prev).add(noteId))
  }

  return (
    <SlidePage
      className="bg-black flex flex-col"
      style={{ position: 'fixed', inset: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden' }}
    >
      {/* ── Hero — mirrors ProfileClient hero, display-only ───────────────── */}
      <div
        className="relative flex-shrink-0 w-full bg-black overflow-hidden"
        style={{ height: 'calc(280px + env(safe-area-inset-top, 0px))' }}
      >
        {/* Background image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={backgroundUrl ?? '/img/default_image.png'}
          alt=""
          aria-hidden
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
        />

        {/* Full-height gradient */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 48.668%, rgba(0,0,0,0.8) 82.216%, rgb(0,0,0) 100%)' }}
        />

        {/* Content anchored to bottom */}
        <div className="absolute inset-0 flex flex-col justify-end gap-[var(--space-5)] p-[var(--space-5)]">
          {/* Details row */}
          <div className="flex items-center gap-[var(--space-5)] w-full">
            <div className="flex-shrink-0 relative overflow-hidden bg-primary rounded-full" style={{ width: 56, height: 56 }}>
              {avatarUrl ? (
                <Image
                  src={resolveAvatarUrl(avatarUrl, 56)}
                  alt={username}
                  fill
                  sizes="56px"
                  className="object-cover"
                  priority
                  unoptimized={isSupabaseStorage(avatarUrl)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="font-pixel text-[12px] text-purple">{initial}</span>
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-[var(--space-2)] justify-center leading-none">
              {memberSinceYear && (
                <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
                  Member Since {memberSinceYear}
                </p>
              )}
              <p className="font-body font-bold truncate" style={{ fontSize: 'var(--text-xl)', fontVariationSettings: '"opsz" 14', color: 'var(--color-primary)' }}>
                {username}
              </p>
              <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
                {groupChats} group chat{groupChats !== 1 ? 's' : ''} · {msgFormatted} msg
              </p>
            </div>
          </div>

          {/* Friendship XP bar */}
          <div className="flex flex-col w-full" style={{ gap: 8 }}>
            <p className="font-silkscreen leading-none w-full" style={{ fontSize: 'var(--text-mini)' }}>
              <span style={{ color: 'var(--color-secondary)' }}>Friendship lv {fxpLevel}</span>
              <span style={{ color: 'var(--color-tertiary)' }}>{` · ${fxpProgress} / 100xp`}</span>
            </p>
            <div className="w-full overflow-hidden" style={{ height: 4, background: 'var(--color-surface)' }}>
              <div style={{ width: `${fxpPercent}%`, height: 4, background: 'linear-gradient(to right, #a855f7, #d946ef)' }} />
            </div>
          </div>
        </div>

        {/* Top gradient overlay */}
        <div
          className="absolute left-0 right-0 top-0 pointer-events-none"
          style={{
            height:     'calc(86px + env(safe-area-inset-top, 0px))',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.25) 46.158%, rgba(0,0,0,0) 100%)',
          }}
        />

        {/* Top bar */}
        <div
          className="absolute z-20 left-0 right-0 flex items-center justify-between pointer-events-none"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 18px)', paddingLeft: 16, paddingRight: 16 }}
        >
          <div className="pointer-events-auto flex items-center p-2 overflow-hidden" style={{ filter: 'drop-shadow(0px 0px 10px rgba(0,0,0,0.4))' }}>
            <BackButton />
          </div>

          <div className="flex items-center pointer-events-none" style={{ gap: 4 }}>
            <div className="flex items-center justify-center rounded-[4px]" style={{ gap: 4, padding: 4, backdropFilter: 'blur(4px)' }}>
              <TokeCircle style={{ width: 12, height: 12, color: 'var(--color-primary)' }} aria-hidden="true" />
              <span className="font-silkscreen leading-none pb-[2px]" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary)' }}>
                {coins.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-center rounded-[4px]" style={{ gap: 4, padding: '4px 8px', backdropFilter: 'blur(4px)' }}>
              <Heart style={{ width: 12, height: 12, color: 'var(--color-primary)' }} aria-hidden="true" />
              <span className="font-silkscreen leading-none pb-[2px]" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary)' }}>
                {totalFriendshipXP}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Status ticker ─────────────────────────────────────────────────────── */}
      {status && <ProfileStatusTicker status={status} />}

      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div
          className="flex-1 flex items-center justify-center font-silkscreen pointer-events-none"
          style={{ height: 40, fontSize: 'var(--text-mini)', color: 'var(--color-primary)', boxShadow: 'inset 0 -2px 0 var(--color-purple)' }}
        >
          NOTES
        </div>
        <button
          onClick={() => router.push('/profile')}
          className="flex-1 flex items-center justify-center font-silkscreen"
          style={{ height: 40, fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}
        >
          SETTINGS
        </button>
      </div>

      {/* ── Notes grid ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto nexus-scroll">
        {crews.length === 0 ? (
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
                    />
                  )
              )}
              <AddPlaceholderCard onClick={() => { setAddError(null); setShowAddSheet(true) }} />
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

      {/* ── Add note sheet ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showAddSheet && (
          <>
            <motion.div
              className="fixed inset-0 z-[60] bg-black/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddSheet(false)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-[70] bg-black border-t border-border flex flex-col"
              style={{ maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', paddingBottom: 'max(28px, env(safe-area-inset-bottom))' }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 1 }}
              onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 400) setShowAddSheet(false) }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col" style={{ gap: 16, padding: 24 }}>
                <p className="font-body font-bold text-primary leading-none" style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}>
                  Add to Board
                </p>

                {/* Crew picker — only shown when in multiple crews */}
                {crews.length > 1 && (
                  <div className="flex flex-col" style={{ gap: 8 }}>
                    <p className="font-body font-medium text-primary" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
                      Crew
                    </p>
                    <div className="relative bg-black border h-[48px] flex items-center overflow-hidden px-3 w-full" style={{ borderColor: 'var(--color-border-hover)' }}>
                      <select
                        value={selectedCrewId}
                        onChange={(e) => setSelectedCrewId(e.target.value)}
                        className="flex-1 bg-transparent font-body font-normal text-primary focus:outline-none appearance-none leading-normal"
                        style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
                      >
                        {crews.map(crew => (
                          <option key={crew.id} value={crew.id} style={{ background: '#000' }}>
                            {crew.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* URL input */}
                <div className="flex flex-col" style={{ gap: 8 }}>
                  <p className="font-body font-medium text-primary" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
                    URL
                  </p>
                  <div className="bg-black border h-[48px] flex items-center overflow-hidden px-3 w-full" style={{ borderColor: addError ? 'var(--color-danger)' : 'var(--color-border-hover)' }}>
                    <input
                      type="url"
                      value={addUrl}
                      onChange={(e) => { setAddUrl(e.target.value); setAddError(null) }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote() }}
                      placeholder="https://..."
                      autoFocus
                      className="flex-1 bg-transparent font-body font-normal text-primary placeholder:text-tertiary focus:outline-none leading-normal"
                      style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
                    />
                  </div>
                  {addError && (
                    <p className="font-pixel text-[8px]" style={{ color: 'var(--color-danger)' }}>{addError}</p>
                  )}
                </div>

                <Button
                  onClick={handleAddNote}
                  disabled={!addUrl.trim() || adding}
                  loading={adding}
                  className="w-full"
                >
                  ADD TO BOARD
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </SlidePage>
  )
}
