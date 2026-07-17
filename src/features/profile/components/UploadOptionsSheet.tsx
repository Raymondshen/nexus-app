'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { Upload } from 'pixelarticons/react/Upload'
import { Camera } from 'pixelarticons/react/Camera'
import { addNoteAction } from '@/app/(app)/profile/notes/actions'
import { BottomSheet } from '@/shared/components/ui/sheet/BottomSheet'
import { SheetActionButton } from '@/shared/components/ui/SheetActionButton'
import { InputField } from '@/shared/components/ui/InputField'
import { isMusicUrl } from '@/features/profile/components/VibesGrid'
import type { PublicNote } from '@/types'

export type UploadOptionsSection = 'photos' | 'vibes'

// ─── SectionCard — accordion card (Figma 559:7182 / 565:2663) ────────────────
// Collapsed: header only, --color-border. Expanded: header + children, purple border.
// Exactly one of the two sheet sections is expanded at a time.

function SectionCard({
  title,
  description,
  expanded,
  onExpand,
  children,
}: {
  title:       string
  description: string
  expanded:    boolean
  onExpand:    () => void
  children?:   ReactNode
}) {
  return (
    <div
      className="flex flex-col w-full"
      style={{
        gap:          'var(--x5)',
        padding:      'var(--x5)',
        borderRadius: 8,
        border:       `1px solid ${expanded ? 'var(--color-purple)' : 'var(--color-border)'}`,
      }}
    >
      <button
        type="button"
        onClick={onExpand}
        className="flex flex-col w-full text-left appearance-none"
        style={{ gap: 'var(--mini)' }}
      >
        <p
          className="font-body font-bold text-primary leading-none w-full"
          style={{ fontSize: 'var(--md)', fontVariationSettings: '"opsz" 14' }}
        >
          {title}
        </p>
        <p
          className="font-body font-light text-tertiary w-full"
          style={{ fontSize: 'var(--xs)', lineHeight: 1.4, fontVariationSettings: '"opsz" 14' }}
        >
          {description}
        </p>
      </button>
      {expanded && children}
    </div>
  )
}

// ─── UploadOptionsSheet ────────────────────────────────────────────────────────
// Opened from the floating pill's "+" button (FloatingViewPill) — the sole entry point
// for adding a vibe or a photo now that VibesGrid/PhotosGrid no longer render their own
// in-grid add tiles. Lets the owner choose between adding a vibe (inline Music Link
// input + save) or sharing a photo (Upload Photo → native gallery picker, Camera →
// native camera capture, both driven through PhotosGridHandle).
// `activeSection` is the profile screen's own tab state — expanding a section here
// switches that tab too, so the grid mounted behind the sheet (and therefore its ref)
// always matches whichever section is open.

interface UploadOptionsSheetProps {
  onClose:         () => void
  activeSection:   UploadOptionsSection
  onSwitchSection: (section: UploadOptionsSection) => void
  crews:           Array<{ id: string; name: string }>
  onVibeAdded:     (note: PublicNote) => void
  onUploadPhoto:   () => void
  onOpenCamera:    () => void
}

export function UploadOptionsSheet({
  onClose,
  activeSection,
  onSwitchSection,
  crews,
  onVibeAdded,
  onUploadPhoto,
  onOpenCamera,
}: UploadOptionsSheetProps) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [adding, startAdd] = useTransition()

  function handleAddVibe() {
    const trimmed = url.trim()
    if (!trimmed) { setError('Paste a link first'); return }
    if (!isMusicUrl(trimmed)) {
      setError('Only YouTube, Spotify, Apple Music, or SoundCloud')
      return
    }
    const crewId = crews[0]?.id
    if (!crewId) { setError('Join a squad first to save vibes'); return }

    startAdd(async () => {
      const result = await addNoteAction(crewId, trimmed)
      if (result.error) { setError('Failed to add — try again'); return }
      if (result.note) {
        onVibeAdded(result.note)
        onClose()
      }
    })
  }

  return (
    <BottomSheet onClose={onClose} zIndex={70}>
      <div
        className="flex flex-col w-full"
        style={{
          gap:           'var(--x5)',
          paddingLeft:   'var(--md)',
          paddingRight:  'var(--md)',
          paddingBottom: 'max(env(safe-area-inset-bottom), var(--x8))',
        }}
      >
        <SectionCard
          title="Add Vibes"
          description="Showcase your favorite music from youtube, youtube music, spotify, or apple music."
          expanded={activeSection === 'vibes'}
          onExpand={() => onSwitchSection('vibes')}
        >
          <div className="flex flex-col w-full" style={{ gap: 'var(--x3)' }}>
            <InputField
              label="Music Link"
              value={url}
              onChange={(v) => { setUrl(v); setError(null) }}
              placeholder="Paste music link here..."
              helperText="e.g. Youtube, Youtube Music, Spotify, Apple Music, etc..."
              autoComplete="off"
            />
            {error && (
              <p className="font-pixel" style={{ fontSize: 8, color: 'var(--color-danger)' }}>{error}</p>
            )}
            <button
              onClick={handleAddVibe}
              disabled={adding || !url.trim()}
              className="w-full flex items-center justify-center disabled:opacity-50"
              style={{ height: 48, background: 'var(--color-purple)' }}
            >
              <span className="font-silkscreen leading-none text-primary whitespace-nowrap" style={{ fontSize: 'var(--xs)' }}>
                {adding ? '...' : 'ADD VIBE'}
              </span>
            </button>
          </div>
        </SectionCard>

        <SectionCard
          title="Share Photos"
          description="Share your memories, experiences, and life adventures with your squad."
          expanded={activeSection === 'photos'}
          onExpand={() => onSwitchSection('photos')}
        >
          <div className="flex flex-col w-full" style={{ gap: 'var(--x5)' }}>
            <SheetActionButton
              icon={<Upload style={{ width: 20, height: 20 }} />}
              label="Upload Photo"
              onClick={() => { onClose(); onUploadPhoto() }}
            />
            <SheetActionButton
              icon={<Camera style={{ width: 20, height: 20 }} />}
              label="Camera"
              onClick={() => { onClose(); onOpenCamera() }}
            />
          </div>
        </SectionCard>
      </div>
    </BottomSheet>
  )
}
