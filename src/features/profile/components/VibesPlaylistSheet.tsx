'use client'

import { useState, useRef, useCallback } from 'react'
import { AnimatePresence, Reorder, useDragControls } from 'framer-motion'
import { Close } from 'pixelarticons/react/Close'
import { Menu } from 'pixelarticons/react/Menu'
import { BottomSheet } from '@/shared/components/ui/sheet/BottomSheet'
import { AddVibeForm } from '@/features/profile/components/AddVibeForm'
import { VinylComboArt } from '@/features/profile/components/VinylComboArt'
import { TitleBlock, PlatformIcon } from '@/features/profile/components/VibeTitleBlock'
import {
  useVibesState,
  splitTitleArtist,
  resolveYtThumbnail,
  ytFallback,
  VinylActionSheet,
} from '@/features/profile/components/vibesShared'
import type { PublicNote } from '@/types'

// ─── VibesPlaylistSheet — "Playlist Vibes" bottom sheet (Figma 690:16468) ─────
// Replaces the profile's old Vibes tab/page entirely (the former square-tile grid
// component and the floating Photos/Vibes toggle pill were both deleted, not just
// orphaned, once this shipped) — opened exclusively via CurrentVibeRow's playlist-icon
// tap (see ProfileClient/AccountPageMember), as a BottomSheet. Data/pin/remove/reorder
// logic lives in the shared useVibesState hook (vibesShared.tsx).

interface VibesPlaylistSheetProps {
  notes:           PublicNote[]
  isOwner:         boolean
  initialPinnedId: string | null
  crews:           Array<{ id: string; name: string }>
  onClose:         () => void
  /**
   * This sheet mounts fresh (and re-seeds from `notes`) every time it's opened — it
   * doesn't stay mounted in the background like CurrentVibeRow. Without these, an
   * add/remove done in one open of the sheet would be invisible the next time it's
   * reopened (and CurrentVibeRow, which reads the same `notes` array, would drift
   * stale too) until a full page reload. The parent (ProfileClient) owns the actual
   * `notes` state and passes both the array and these two updaters down.
   */
  onVibeAdded:     (note: PublicNote) => void
  onVibeRemoved:   (noteId: string) => void
  /** Fires on every drag-reorder step (not just at drag end — see useVibesState.reorder's
   *  own comment on why per-step persistence is acceptable here) with the FULL new note
   *  order (pinned note first, if any, then the dragged order) so CurrentVibeRow's
   *  "most recent" fallback doesn't drift stale across a sheet close/reopen. */
  onReorder:       (newOrder: PublicNote[]) => void
}

// ─── SquareAlbumArt — plain 56×56 og_image tile, no vinyl disc (list rows only) ──
// Self-contained resolve + error fallback (mqdefault -> hqdefault) + lazy loading, same
// reasoning as VinylComboArt. Callers MUST pass `key={note.id}` — VibeListRow's own
// `.map()` key already covers this since a note's row identity IS its id.

function SquareAlbumArt({ ogImageUrl }: { ogImageUrl: string | null }) {
  const [imgSrc, setImgSrc] = useState<string | null>(() => ogImageUrl ? resolveYtThumbnail(ogImageUrl) : null)

  const handleImgError = useCallback(() => {
    setImgSrc(prev => {
      if (!prev) return prev
      if (prev.includes('/mqdefault.jpg')) return ytFallback(prev)
      return prev
    })
  }, [])

  return (
    <div className="relative flex-shrink-0 overflow-hidden" style={{ width: 56, height: 56 }}>
      {imgSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgSrc}
          alt=""
          loading="lazy"
          decoding="async"
          onError={handleImgError}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: 'var(--color-surface)' }} />
      )}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: 'linear-gradient(45deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.3) 27.408%, rgba(0,0,0,0.1) 53.37%, rgba(0,0,0,0) 100%)' }}
      />
    </div>
  )
}

// ─── PinnedVibeCard — purple-bordered highlight card (Figma 690:16484) ────────
// Same VinylComboArt disc combo as CurrentVibeRow, plus a static pin-heart badge
// (public/icons/pin-heart.svg — the same asset the Pin Squad feature uses) marking
// this as the currently-pinned vibe. Long-press still opens VinylActionSheet so the
// owner can unpin/remove from here — the heart itself is a decorative indicator,
// not a second, redundant tap-to-unpin control.

function PinnedVibeCard({
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firedRef = useRef(false)

  function onPointerDown() {
    if (!isOwner) return
    firedRef.current = false
    timerRef.current = setTimeout(() => { firedRef.current = true; setShowActions(true) }, 500)
  }
  function cancelPress() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }
  // Suppresses the nested <a> (VinylComboArt's album art, PlatformIcon) from also
  // navigating on the touchend-synthesized click that follows a long-press.
  function onClickCapture(e: React.MouseEvent) {
    if (firedRef.current) { e.preventDefault(); firedRef.current = false }
  }

  const [title, artist] = splitTitleArtist(note.og_title ?? note.url)

  return (
    <div
      className="flex items-center w-full flex-shrink-0"
      style={{
        gap:          'var(--x5)',
        padding:      'var(--x4)',
        borderRadius: 8,
        border:       '1px solid var(--color-purple)',
      }}
      onPointerDown={onPointerDown}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onClickCapture={onClickCapture}
    >
      <VinylComboArt key={note.id} ogImageUrl={note.og_image_url} href={note.url} />
      <TitleBlock eyebrow="Currently vibing" title={title} artist={artist} />
      <PlatformIcon note={note} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/pin-heart.svg" alt="" aria-hidden className="flex-shrink-0" style={{ width: 22, height: 20 }} />

      <AnimatePresence>
        {showActions && (
          <VinylActionSheet
            note={note}
            isPinned
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

// ─── VibeListRow — draggable row w/ tap-and-hold reorder handle (Figma 690:16505) ──
// The Menu (≡) glyph starts a real Reorder.Item drag, but only after a 500ms hold —
// same threshold as every other long-press affordance in this app (ChatSheetReact,
// RoomPinSheet's card long-press, this row's OWN long-press-elsewhere-for-actions
// below) — so a quick tap or a scroll through the list never accidentally starts a
// drag. `dragListener={false}` + a manually-started `dragControls` is the same
// technique `useSheetDrag` already uses for BottomSheet's own pull-to-close gesture.
// The row's own long-press (anywhere except the handle) still opens VinylActionSheet;
// `e.stopPropagation()` on the handle's pointerdown keeps the two gestures from firing
// off the same touch.

function VibeListRow({
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
  const dragControls = useDragControls()
  const [showActions, setShowActions] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const actionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firedRef       = useRef(false)

  function onRowPointerDown() {
    if (!isOwner) return
    firedRef.current = false
    actionTimerRef.current = setTimeout(() => { firedRef.current = true; setShowActions(true) }, 500)
  }
  function cancelRowPress() {
    if (actionTimerRef.current) { clearTimeout(actionTimerRef.current); actionTimerRef.current = null }
  }
  // Suppresses the nested <a> (PlatformIcon) from also navigating on the
  // touchend-synthesized click that follows a long-press.
  function onClickCapture(e: React.MouseEvent) {
    if (firedRef.current) { e.preventDefault(); firedRef.current = false }
  }

  function onHandlePointerDown(e: React.PointerEvent) {
    e.stopPropagation()
    if (!isOwner) return
    dragTimerRef.current = setTimeout(() => dragControls.start(e), 500)
  }
  function cancelHandlePress(e: React.PointerEvent) {
    e.stopPropagation()
    if (dragTimerRef.current) { clearTimeout(dragTimerRef.current); dragTimerRef.current = null }
  }

  const [title, artist] = splitTitleArtist(note.og_title ?? note.url)

  return (
    <Reorder.Item
      value={note}
      as="div"
      dragListener={false}
      dragControls={dragControls}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setIsDragging(false)}
      whileDrag={{ scale: 1.02 }}
      className="flex items-center w-full flex-shrink-0"
      style={{
        gap:        'var(--x5)',
        position:   'relative',
        background: isDragging ? 'var(--color-surface-elevated)' : undefined,
        boxShadow:  isDragging ? '0 4px 12px rgba(0,0,0,0.4)' : undefined,
      }}
      onPointerDown={onRowPointerDown}
      onPointerUp={cancelRowPress}
      onPointerLeave={cancelRowPress}
      onClickCapture={onClickCapture}
    >
      <div
        onPointerDown={onHandlePointerDown}
        onPointerUp={cancelHandlePress}
        onPointerLeave={cancelHandlePress}
        style={{ touchAction: 'none', WebkitTouchCallout: 'none', flexShrink: 0, display: 'flex' }}
      >
        <Menu style={{ width: 24, height: 24, color: 'var(--color-tertiary)' }} aria-hidden="true" />
      </div>
      <SquareAlbumArt ogImageUrl={note.og_image_url} />
      <TitleBlock title={title} artist={artist} />
      <PlatformIcon note={note} />

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
    </Reorder.Item>
  )
}

// ─── VibesPlaylistSheet (main export) ─────────────────────────────────────────

export function VibesPlaylistSheet({ notes, isOwner, initialPinnedId, crews, onClose, onVibeAdded, onVibeRemoved, onReorder }: VibesPlaylistSheetProps) {
  const { orderedVinyls, pinnedId, addVibe, togglePin, remove, reorder } = useVibesState(notes, isOwner, initialPinnedId)

  const pinned = pinnedId ? orderedVinyls.find(v => v.id === pinnedId) ?? null : null
  const rest   = pinned ? orderedVinyls.filter(v => v.id !== pinned.id) : orderedVinyls

  const handleRemove    = useCallback((id: string) => { remove(id); onVibeRemoved(id) }, [remove, onVibeRemoved])
  const handleVibeAdded = useCallback((note: PublicNote) => { addVibe(note); onVibeAdded(note) }, [addVibe, onVibeAdded])
  const handleReorder   = useCallback((newRestOrder: PublicNote[]) => {
    reorder(newRestOrder)
    onReorder(pinned ? [pinned, ...newRestOrder] : newRestOrder)
  }, [reorder, pinned, onReorder])

  return (
    <BottomSheet onClose={onClose} zIndex={70} maxHeight="85vh">
      <div className="flex flex-col w-full flex-1 min-h-0" style={{ gap: 'var(--x5)', paddingLeft: 'var(--md)', paddingRight: 'var(--md)' }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between w-full flex-shrink-0">
          <p className="font-body font-bold text-primary leading-none" style={{ fontSize: 'var(--md)', fontVariationSettings: '"opsz" 14' }}>
            Playlist Vibes
          </p>
          <button onClick={onClose} aria-label="Close" className="flex-shrink-0 flex items-center justify-center appearance-none" style={{ width: 24, height: 24 }}>
            <Close style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
          </button>
        </div>

        {/* ── List — scrolls if it overflows; pinned card always first ──────── */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col nexus-scroll" style={{ gap: 'var(--x3)' }}>
          {pinned && (
            <PinnedVibeCard
              note={pinned}
              isOwner={isOwner}
              onTogglePin={() => togglePin(pinned.id)}
              onRemove={() => handleRemove(pinned.id)}
            />
          )}
          <Reorder.Group as="div" axis="y" values={rest} onReorder={handleReorder} className="flex flex-col w-full" style={{ gap: 'var(--x3)' }}>
            {rest.map(note => (
              <VibeListRow
                key={note.id}
                note={note}
                isOwner={isOwner}
                onTogglePin={() => togglePin(note.id)}
                onRemove={() => handleRemove(note.id)}
              />
            ))}
          </Reorder.Group>
          {orderedVinyls.length === 0 && (
            <p className="font-silkscreen text-center" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)', padding: '24px 0' }}>
              No vibes yet
            </p>
          )}
        </div>

        {/* ── Divider + Add Music — owner only. A viewer looking at someone else's
            playlist gets a read-only list with no way to add to it. ── */}
        {isOwner && (
          <>
            <div className="border-t border-border w-full flex-shrink-0" />
            <div className="flex-shrink-0" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), var(--x8))' }}>
              <AddVibeForm label="Add Music" crews={crews} onVibeAdded={handleVibeAdded} />
            </div>
          </>
        )}
        {!isOwner && <div className="flex-shrink-0" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), var(--x5))' }} />}
      </div>
    </BottomSheet>
  )
}
