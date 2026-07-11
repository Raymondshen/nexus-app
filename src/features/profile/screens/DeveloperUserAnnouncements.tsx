'use client'

import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { SlidePage, useSlideBack } from '@/app/layouts/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { PageFooter } from '@/shared/components/ui/PageFooter'
import { Button } from '@/shared/components/ui/Button'
import {
  createAnnouncementAction,
  getAllAnnouncementsAction,
  updateAnnouncementAction,
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

// ─── Bordered text field — shared by create form + inline edit ───────────────

function FieldInput({
  value,
  onChange,
  placeholder,
  maxLength,
  onKeyDown,
}: {
  value:        string
  onChange:     (v: string) => void
  placeholder:  string
  maxLength:    number
  onKeyDown?:   (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  return (
    <div
      className="border flex h-[48px] items-center overflow-hidden w-full"
      style={{ borderColor: 'var(--color-border)', paddingLeft: 'var(--space-5)', paddingRight: 'var(--space-5)' }}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        maxLength={maxLength}
        className="flex-1 bg-transparent font-body font-normal text-primary placeholder:text-muted focus:outline-none leading-normal"
        style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
      />
    </div>
  )
}

interface DeveloperUserAnnouncementsProps {
  initialAnnouncements: Announcement[]
}

export function DeveloperUserAnnouncements({ initialAnnouncements }: DeveloperUserAnnouncementsProps) {
  const [banners,      setBanners]      = useState<Announcement[]>(initialAnnouncements)
  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [editingText,  setEditingText]  = useState('')
  const [editingImage, setEditingImage] = useState('')
  const [error,        setError]        = useState<string | null>(null)
  const [loading,      setLoading]      = useState(false)

  const [showCreate,   setShowCreate]   = useState(false)
  const [newTitle,     setNewTitle]     = useState('')
  const [newText,      setNewText]      = useState('')
  const [newImageUrl,  setNewImageUrl]  = useState('')
  const [addingBanner, setAddingBanner] = useState(false)
  const [addError,     setAddError]     = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    const result = await getAllAnnouncementsAction()
    setLoading(false)
    if ('data' in result) setBanners(result.data ?? [])
  }, [])

  async function handleCreate() {
    if (!newTitle.trim() || !newText.trim() || !newImageUrl.trim() || addingBanner) return
    setAddingBanner(true)
    setAddError(null)
    const result = await createAnnouncementAction(newTitle.trim(), newText.trim(), newImageUrl.trim())
    setAddingBanner(false)
    if (result.error) { setAddError(result.error); return }
    setNewTitle('')
    setNewText('')
    setNewImageUrl('')
    setShowCreate(false)
    reload()
  }

  async function handleUpdate(id: string) {
    if (!editingTitle.trim() || !editingText.trim() || !editingImage.trim()) return
    const result = await updateAnnouncementAction(id, editingTitle.trim(), editingText.trim(), editingImage.trim())
    if (result.error) { setError(result.error); return }
    setEditingId(null)
    reload()
  }

  async function handleToggle(id: string, active: boolean) {
    const result = await toggleAnnouncementAction(id, !active)
    if (result.error) setError(result.error)
    else reload()
  }

  return (
    <SlidePage
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

        {showCreate && (
          <div
            className="flex flex-col w-full rounded-[8px]"
            style={{ background: 'var(--color-surface-sheet)', padding: 16, gap: 16 }}
          >
            <FieldInput value={newTitle} onChange={(v) => { setNewTitle(v); setAddError(null) }} placeholder="Title, e.g. Text Effects" maxLength={200} />
            <FieldInput value={newImageUrl} onChange={(v) => { setNewImageUrl(v); setAddError(null) }} placeholder="Image path, e.g. /img/announcements/foo.svg" maxLength={300} />
            <FieldInput
              value={newText}
              onChange={(v) => { setNewText(v); setAddError(null) }}
              placeholder="Body text..."
              maxLength={500}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
            />

            {addError && (
              <p className="font-pixel leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-danger)' }}>
                {addError}
              </p>
            )}
          </div>
        )}

        {loading ? (
          <p className="font-pixel" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
            Loading...
          </p>
        ) : banners.length === 0 && !showCreate ? (
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
              {editingId === b.id ? (
                <>
                  <FieldInput value={editingTitle} onChange={setEditingTitle} placeholder="Title" maxLength={200} />
                  <FieldInput value={editingImage} onChange={setEditingImage} placeholder="Image path, e.g. /img/announcements/foo.svg" maxLength={300} />
                  <FieldInput value={editingText} onChange={setEditingText} placeholder="Body text..." maxLength={500} />
                  <div className="flex" style={{ gap: 'var(--space-3)' }}>
                    <button
                      onClick={() => handleUpdate(b.id)}
                      className="flex-1 h-8 font-pixel border"
                      style={{ fontSize: 'var(--text-mini)', color: '#66bb6a', borderColor: 'rgba(102,187,106,0.4)', background: 'rgba(102,187,106,0.08)' }}
                    >
                      SAVE
                    </button>
                    <button
                      onClick={() => { setEditingId(null); setError(null) }}
                      className="flex-1 h-8 font-pixel border"
                      style={{ fontSize: 'var(--text-mini)', color: 'var(--color-coins)', borderColor: 'rgba(255,215,0,0.3)', background: 'rgba(255,215,0,0.06)' }}
                    >
                      CANCEL
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => { setEditingId(b.id); setEditingTitle(b.title); setEditingText(b.text); setEditingImage(b.image_url); setError(null) }}
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
              )}
            </div>
          ))
        )}
      </div>

      {showCreate ? (
        <PageFooter>
          <Button
            onClick={handleCreate}
            disabled={!newTitle.trim() || !newText.trim() || !newImageUrl.trim() || addingBanner}
            loading={addingBanner}
            className="w-full"
          >
            Save
          </Button>
          <Button
            variant="outlined"
            color="tertiary"
            onClick={() => { setShowCreate(false); setAddError(null) }}
            className="w-full"
          >
            Cancel
          </Button>
        </PageFooter>
      ) : (
        <PageFooter>
          <Button onClick={() => setShowCreate(true)} className="w-full">
            Add announcement
          </Button>
        </PageFooter>
      )}
    </SlidePage>
  )
}
