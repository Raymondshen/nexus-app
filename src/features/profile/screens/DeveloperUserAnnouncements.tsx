'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, useAnimation, AnimatePresence } from 'framer-motion'
import { SlidePage, useSlideBack } from '@/app/layouts/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { Check } from 'pixelarticons/react/Check'
import { PageHeader } from '@/shared/components/ui/PageHeader'
import { PageFooter } from '@/shared/components/ui/PageFooter'
import { Button } from '@/shared/components/ui/Button'
import { SelectField, InputField, TextareaField } from '@/shared/components/ui/InputField'
import { BottomSheet } from '@/shared/components/ui/sheet/BottomSheet'
import { AnnouncementCard } from '@/shared/components/banners/AnnouncementCard'
import {
  createAnnouncementAction,
  getAllAnnouncementsAction,
  updateAnnouncementAction,
  deleteAnnouncementAction,
  toggleAnnouncementAction,
} from '@/app/(app)/home/actions'
import type { Announcement } from '@/types'

function formatNumericDate(iso: string): string {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}/${dd}/${d.getFullYear()}`
}

function fileNameFromUrl(url: string): string {
  const parts = url.split('/')
  return parts[parts.length - 1] || url
}

// ─── Image source options ─────────────────────────────────────────────────────
// Announcement images are static assets checked into public/img/announcements/
// (see the image-handling skill) — there's no upload flow here, so the picker
// is this fixed manifest, kept in sync by hand whenever a new banner asset is
// added to that folder.

interface AnnouncementImageOption {
  filename: string
  path:     string
}

const ANNOUNCEMENT_IMAGE_OPTIONS: AnnouncementImageOption[] = [
  { filename: 'chatroom-update-v1.svg', path: '/img/announcements/chatroom-update-v1.svg' },
  { filename: 'text-effects-v1.svg',    path: '/img/announcements/text-effects-v1.svg' },
]

// ─── Header — bare icon + title, matches ManageUserProfile / DeveloperUserSettings ──

function AnnouncementsHeader() {
  const goBack = useSlideBack()
  return (
    <div
      className="flex-shrink-0 flex items-center"
      style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)', paddingBottom: 8, gap: 8 }}
    >
      <button
        onClick={goBack}
        aria-label="Back"
        className="flex items-center justify-center flex-shrink-0"
        style={{ width: 24, height: 24 }}
      >
        <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-tertiary)' }} aria-hidden="true" />
      </button>
      <p className="font-silkscreen uppercase leading-none" style={{ fontSize: 'var(--text-xl)', color: 'var(--color-primary)' }}>
        Announcements
      </p>
    </div>
  )
}

// ─── Toggle switch — same spec as DeveloperUserSettings ──────────────────────

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onChange}
      className="relative flex-shrink-0 overflow-hidden"
      style={{
        width: 48,
        height: 28,
        borderRadius: 40,
        background: enabled ? 'var(--color-purple)' : 'var(--color-muted)',
      }}
      aria-checked={enabled}
      role="switch"
    >
      <motion.span
        className="absolute top-[4px] rounded-full pointer-events-none"
        style={{ width: 20, height: 20, background: 'var(--color-primary)' }}
        animate={{ left: enabled ? 24 : 4 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      />
    </button>
  )
}

// ─── ImageSourceSheet — picker for the fixed announcement image manifest ─────

function ImageSourceSheet({
  selectedPath,
  onSelect,
  onClose,
}: {
  selectedPath: string
  onSelect:     (path: string) => void
  onClose:      () => void
}) {
  return (
    <BottomSheet onClose={onClose} zIndex={90}>
      <div
        className="flex flex-col w-full"
        style={{ gap: 'var(--x3)', paddingLeft: 'var(--x5)', paddingRight: 'var(--x5)', paddingBottom: 'max(env(safe-area-inset-bottom), var(--x8))' }}
      >
        <p
          className="font-body font-bold text-primary leading-none w-full"
          style={{ fontSize: 'var(--md)', fontVariationSettings: '"opsz" 14' }}
        >
          Image Source
        </p>
        {ANNOUNCEMENT_IMAGE_OPTIONS.map((opt) => {
          const isSelected = opt.path === selectedPath
          return (
            <button
              key={opt.path}
              type="button"
              onClick={() => { onSelect(opt.path); onClose() }}
              className="flex items-center w-full rounded-[var(--x3)] appearance-none"
              style={{
                padding: 'var(--x5)',
                gap:     'var(--x5)',
                background: isSelected ? 'var(--color-surface-elevated)' : 'var(--color-surface-sheet)',
                border: `1px solid ${isSelected ? 'var(--color-purple)' : 'var(--color-border)'}`,
              }}
            >
              <div className="flex-shrink-0 overflow-hidden rounded-[4px]" style={{ width: 40, height: 40 }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- local static SVG thumbnail */}
                <img src={opt.path} alt="" className="w-full h-full object-cover" aria-hidden="true" />
              </div>
              <span
                className="flex-1 min-w-0 text-left font-body font-normal text-primary truncate"
                style={{ fontSize: 'var(--sm)', fontVariationSettings: '"opsz" 14' }}
              >
                {opt.filename}
              </span>
              {isSelected && (
                <Check style={{ width: 20, height: 20, color: 'var(--color-purple)', flexShrink: 0 }} aria-hidden="true" />
              )}
            </button>
          )
        })}
      </div>
    </BottomSheet>
  )
}

// ─── AnnouncementEditorPage — full-screen slide-in overlay (Figma 472:6072 / 505:1953) ──
// Same "one component, mode prop" pattern as chat's CreateDefinitionPage: back
// button and left-edge swipe close the overlay (calls onClose) rather than
// navigating router history.

interface AnnouncementEditorPageProps {
  mode:      'create' | 'edit'
  target?:   Announcement
  onClose:   () => void
  onSaved:   () => void
  onDeleted: () => void
}

function AnnouncementEditorPage({ mode, target, onClose, onSaved, onDeleted }: AnnouncementEditorPageProps) {
  const [title,    setTitle]    = useState(target?.title ?? '')
  const [text,     setText]     = useState(target?.text ?? '')
  const [imageUrl, setImageUrl] = useState(target?.image_url ?? '')
  const [showImageSource, setShowImageSource] = useState(false)
  const [error,   setError]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const [deleting, setDeleting] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const exitingRef = useRef(false)
  const controls = useAnimation()

  useEffect(() => {
    controls.start({ x: 0, transition: { type: 'spring', stiffness: 380, damping: 36 } })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleBack = useCallback(() => {
    if (exitingRef.current) return
    exitingRef.current = true
    controls
      .start({ x: '100%', transition: { type: 'tween', ease: [0.32, 0, 0.67, 0], duration: 0.15 } })
      .then(() => onClose())
  }, [controls, onClose])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let startX = 0, startY = 0, lastX = 0, lastT = 0, active = false

    function onTouchStart(e: TouchEvent) {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      lastX = startX
      lastT = Date.now()
      if (startX < 40) {
        active = true
        e.preventDefault()
        controls.stop()
      }
    }
    function onTouchMove(e: TouchEvent) {
      if (!active) return
      const dx = e.touches[0].clientX - startX
      const dy = Math.abs(e.touches[0].clientY - startY)
      if (dy > dx || dx < 0) {
        active = false
        controls.start({ x: 0, transition: { type: 'spring', stiffness: 500, damping: 40 } })
        return
      }
      e.preventDefault()
      lastX = e.touches[0].clientX
      lastT = Date.now()
      controls.set({ x: dx })
    }
    function onTouchEnd(e: TouchEvent) {
      if (!active || exitingRef.current) { active = false; return }
      active = false
      const endX = e.changedTouches[0].clientX
      const dx = endX - startX
      const dt = Date.now() - lastT
      const vel = dt > 0 ? ((endX - lastX) / dt) * 1000 : 0
      if (dx > 80 || vel > 400) {
        handleBack()
      } else {
        controls.start({ x: 0, transition: { type: 'spring', stiffness: 500, damping: 40 } })
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [controls, handleBack])

  async function handlePublish() {
    if (!title.trim() || !text.trim() || !imageUrl.trim() || saving) return
    setSaving(true)
    setError('')
    const result = mode === 'edit' && target
      ? await updateAnnouncementAction(target.id, title.trim(), text.trim(), imageUrl.trim())
      : await createAnnouncementAction(title.trim(), text.trim(), imageUrl.trim())
    setSaving(false)
    if (result.error) { setError(result.error); return }
    onSaved()
    handleBack()
  }

  async function handleDelete() {
    if (!target || deleting) return
    setDeleting(true)
    setError('')
    const result = await deleteAnnouncementAction(target.id)
    setDeleting(false)
    if (result.error) { setError(result.error); return }
    onDeleted()
    handleBack()
  }

  return (
    <motion.div
      ref={containerRef}
      className="fixed inset-0 z-[80] bg-black flex flex-col"
      style={{ maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}
      initial={{ x: '100%' }}
      animate={controls}
    >
      <PageHeader title={mode === 'edit' ? 'Edit announcement' : 'Add announcement'} onBack={handleBack} />

      <div
        className="flex-1 min-h-0 overflow-y-auto nexus-scroll flex flex-col"
        style={{ gap: 'var(--x6)', paddingLeft: 'var(--md)', paddingRight: 'var(--md)', paddingTop: 'var(--x5)', paddingBottom: 'var(--x5)' }}
      >
        {/* Live preview — same shared card as the production announcements sheet */}
        <AnnouncementCard
          title={title}
          text={text}
          imageUrl={imageUrl || null}
          createdAt={target?.created_at ?? null}
        />

        <SelectField
          label="Image Source :"
          value={imageUrl ? fileNameFromUrl(imageUrl) : undefined}
          placeholder="Select an image"
          onClick={() => setShowImageSource(true)}
        />
        <InputField
          label="Title"
          value={title}
          onChange={setTitle}
          placeholder="e.g. New Navbar"
          maxLength={200}
          required
        />
        <TextareaField
          label="Description"
          value={text}
          onChange={setText}
          placeholder="e.g. New Navbar launched"
          maxLength={500}
          rows={5}
          required
        />

        {error && (
          <p className="font-pixel leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-danger)' }}>
            {error}
          </p>
        )}
      </div>

      <PageFooter>
        <Button
          onClick={handlePublish}
          disabled={!title.trim() || !text.trim() || !imageUrl.trim() || saving}
          loading={saving}
          className="w-full"
        >
          Publish
        </Button>
        {mode === 'edit' && (
          <Button
            variant="outlined"
            color="red"
            onClick={handleDelete}
            disabled={deleting}
            loading={deleting}
            className="w-full"
          >
            Delete Announcement
          </Button>
        )}
      </PageFooter>

      <AnimatePresence>
        {showImageSource && (
          <ImageSourceSheet
            selectedPath={imageUrl}
            onSelect={setImageUrl}
            onClose={() => setShowImageSource(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

interface DeveloperUserAnnouncementsProps {
  initialAnnouncements: Announcement[]
}

export function DeveloperUserAnnouncements({ initialAnnouncements }: DeveloperUserAnnouncementsProps) {
  const [banners, setBanners] = useState<Announcement[]>(initialAnnouncements)
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [showCreate,  setShowCreate]  = useState(false)
  const [editTarget,  setEditTarget]  = useState<Announcement | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    const result = await getAllAnnouncementsAction()
    setLoading(false)
    if ('data' in result) setBanners(result.data ?? [])
  }, [])

  async function handleToggle(id: string, active: boolean) {
    const result = await toggleAnnouncementAction(id, !active)
    if (result.error) setError(result.error)
    else reload()
  }

  const overlayOpen = showCreate || !!editTarget

  return (
    <SlidePage
      nativeSwipe={overlayOpen}
      className="bg-black flex flex-col"
      style={{ position: 'fixed', inset: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden' }}
    >
      <AnnouncementsHeader />

      {/* Body */}
      <div
        className="flex-1 overflow-y-auto nexus-scroll flex flex-col"
        style={{ gap: 20, paddingLeft: 16, paddingRight: 16, paddingTop: 16, paddingBottom: 16 }}
      >
        {error && (
          <p className="font-pixel leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-danger)' }}>
            {error}
          </p>
        )}

        {loading ? (
          <p className="font-pixel" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
            Loading...
          </p>
        ) : banners.length === 0 ? (
          <p className="font-pixel" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
            No announcements yet.
          </p>
        ) : (
          banners.map((b) => (
            <div
              key={b.id}
              className="flex flex-col w-full rounded-[8px]"
              style={{ background: 'var(--color-surface-sheet)', padding: 16, gap: 16 }}
            >
              <button
                onClick={() => { setEditTarget(b); setError(null) }}
                className="flex flex-col w-full text-left"
                style={{ gap: 16 }}
              >
                <div className="flex flex-col w-full" style={{ gap: 8 }}>
                  <div className="flex flex-col w-full" style={{ gap: 4 }}>
                    <p className="font-body font-bold leading-none" style={{ fontSize: 'var(--text-md)', color: 'var(--color-primary)', fontVariationSettings: '"opsz" 14' }}>
                      {b.title}
                    </p>
                    <p
                      className="font-body font-normal"
                      style={{
                        fontSize:        'var(--text-sm)',
                        color:           'var(--color-secondary)',
                        lineHeight:      1.5,
                        fontVariationSettings: '"opsz" 14',
                        display:         '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow:        'hidden',
                        textOverflow:    'ellipsis',
                      }}
                    >
                      {b.text}
                    </p>
                  </div>
                  <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
                    src : {fileNameFromUrl(b.image_url)}
                  </p>
                </div>

                <div className="flex items-center w-full" style={{ gap: 8 }}>
                  <p
                    className="font-body font-light flex-1 min-w-0 leading-none"
                    style={{ fontSize: 'var(--text-xs)', color: b.active ? 'var(--color-purple)' : 'var(--color-tertiary)', fontVariationSettings: '"opsz" 14' }}
                  >
                    {b.active ? `Published ${formatNumericDate(b.created_at)}` : `Not published since ${formatNumericDate(b.created_at)}`}
                  </p>
                  <ToggleSwitch
                    enabled={b.active}
                    onChange={(e) => { e.stopPropagation(); handleToggle(b.id, b.active) }}
                  />
                </div>
              </button>
            </div>
          ))
        )}
      </div>

      <PageFooter>
        <Button onClick={() => setShowCreate(true)} className="w-full">
          Add announcement
        </Button>
      </PageFooter>

      <AnimatePresence>
        {showCreate && (
          <AnnouncementEditorPage
            key="create"
            mode="create"
            onClose={() => setShowCreate(false)}
            onSaved={reload}
            onDeleted={reload}
          />
        )}
        {editTarget && (
          <AnnouncementEditorPage
            key="edit"
            mode="edit"
            target={editTarget}
            onClose={() => setEditTarget(null)}
            onSaved={reload}
            onDeleted={reload}
          />
        )}
      </AnimatePresence>
    </SlidePage>
  )
}
