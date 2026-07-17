'use client'

import { Image as ImageIcon } from 'pixelarticons/react/Image'
import { Music } from 'pixelarticons/react/Music'
import { Plus } from 'pixelarticons/react/Plus'

export type ProfileViewTab = 'photos' | 'vibes'

/** Extra scroll bottom-padding PhotosGrid/VibesGrid need so their last row isn't hidden under this pill. */
export const PILL_BOTTOM_INSET = 72

// ─── FloatingViewPill — Photos/Vibes toggle + add button (Figma 559:6686) ─────
// Shared across every profile surface that pairs PhotosGrid + VibesGrid under one
// screen (own profile, member profiles) — replaces the old top PHOTOS/VIBES tab row.
// The active view's icon renders slightly larger (Figma's own mock jumps 16px→24px,
// +50%, which read as too dramatic in practice, so toned down to 19px here) and in
// --color-primary; the inactive one stays 16px in --color-tertiary. The add "+" is
// always --color-purple regardless of active tab — it's an action, not a tab state.
export function FloatingViewPill({
  activeTab,
  onSwitch,
  onAdd,
  showAdd = true,
}: {
  activeTab: ProfileViewTab
  onSwitch:  (tab: ProfileViewTab) => void
  onAdd?:    () => void
  /** Hide the "+" button — e.g. viewing another member's profile, where nothing can be added. */
  showAdd?:  boolean
}) {
  return (
    <div
      className="flex items-center justify-center"
      style={{
        gap:             'var(--space-7)',
        paddingLeft:     'var(--space-7)',
        paddingRight:    'var(--space-7)',
        paddingTop:      'var(--space-4)',
        paddingBottom:   'var(--space-4)',
        borderRadius:    68,
        background:      'rgba(13,13,13,0.25)',
        backdropFilter:  'blur(7px)',
        boxShadow:       '0px 0px 20px 12px rgba(0,0,0,0.1)',
      }}
    >
      <button onClick={() => onSwitch('photos')} aria-label="Show photos" className="flex items-center justify-center flex-shrink-0" style={{ width: 24, height: 24 }}>
        <ImageIcon style={{ width: activeTab === 'photos' ? 19 : 16, height: activeTab === 'photos' ? 19 : 16, color: activeTab === 'photos' ? 'var(--color-primary)' : 'var(--color-tertiary)' }} aria-hidden="true" />
      </button>
      <button onClick={() => onSwitch('vibes')} aria-label="Show vibes" className="flex items-center justify-center flex-shrink-0" style={{ width: 24, height: 24 }}>
        <Music style={{ width: activeTab === 'vibes' ? 19 : 16, height: activeTab === 'vibes' ? 19 : 16, color: activeTab === 'vibes' ? 'var(--color-primary)' : 'var(--color-tertiary)' }} aria-hidden="true" />
      </button>
      {showAdd && (
        <button onClick={onAdd} aria-label={activeTab === 'photos' ? 'Add photo' : 'Add vibe'} className="flex items-center justify-center flex-shrink-0" style={{ width: 24, height: 24 }}>
          <Plus style={{ width: 16, height: 16, color: 'var(--color-purple)' }} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
