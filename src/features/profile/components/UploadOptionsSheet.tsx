'use client'

import { type ReactNode } from 'react'
import { Upload } from 'pixelarticons/react/Upload'
import { Camera } from 'pixelarticons/react/Camera'
import { BottomSheet } from '@/shared/components/ui/sheet/BottomSheet'
import { SheetActionButton } from '@/shared/components/ui/SheetActionButton'
import { AddVibeForm } from '@/features/profile/components/AddVibeForm'
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
// Opened from the own-profile header's "+" button — both ProfileClient (own profile)
// and AccountPageMember (member profile, owner view only) render this the same way
// now that FloatingViewPill has been removed entirely — the sole entry point for
// adding a vibe or a photo, since PhotosGrid has no in-grid add tile of its own and
// there's no more grid-based Vibes view at all (see VibesPlaylistSheet). Lets the
// owner choose between adding a vibe (inline Music Link
// input + save) or sharing a photo (Upload Photo → native gallery picker, Camera →
// native camera capture, both driven through PhotosGridHandle).
// `activeSection` is local UI state private to this sheet (which accordion section is
// expanded) — no longer tied to a page-level Photos/Vibes tab, since Vibes moved into
// its own VibesPlaylistSheet.

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
          <AddVibeForm label="Music Link" crews={crews} onVibeAdded={onVibeAdded} onAdded={onClose} />
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
