'use client'

import type { ReactNode } from 'react'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { useSlideBack } from '@/app/layouts/SlidePage'

interface PageHeaderProps {
  title:   string
  // Optional. When omitted, the back button falls back to the enclosing
  // SlidePage's goBack (via useSlideBack). PageHeader is always rendered as a
  // descendant of SlidePage on the standard subpages, so it reads that context
  // directly — DON'T pass a goBack resolved in the page's *own* component body,
  // which sits ABOVE SlidePage's provider and resolves to a no-op. Only pass
  // onBack when the page closes some other way (an overlay slide-out, a sheet
  // dismiss) rather than navigating back through SlidePage. Unused when
  // `variant="sheet"` — that variant has no back button at all.
  onBack?: () => void
  right?:  ReactNode
  // Optional decorative leading glyph before the title — 'sheet' variant only
  // (Figma 599:7818's small ChevronRight before the crew name). Not a button;
  // purely visual, so callers that don't pass one (e.g. ChatRoomBrowseSheet's own
  // DM-screen "Updates" fallback title, below) keep rendering exactly as before.
  // ChatRoomBrowseSheet passes it only when the header is showing squad context
  // (title = crew name).
  icon?:   ReactNode
  // 'default' (Figma 340:3665) — ChevronLeft back button + uppercase Silkscreen
  // title, used by every standard subpage.
  // 'sheet' (Figma 599:7818) — no back button; bold (non-uppercase) DM Sans
  // title in --color-secondary instead of Silkscreen/--color-primary. For
  // overlay-style sheets that dismiss via their own `right`-slot action (a
  // close X, or a row of icons) rather than a back chevron — ChatRoomBrowseSheet.
  variant?: 'default' | 'sheet'
}

// Shared header for every subpage/sheet overlay — see CLAUDE.md → Page Structure.
// 'default' variant: ChevronLeft back button + uppercase Silkscreen title, used by
// the Definitions list page, CreateDefinitionPage overlay, ManageSquadProfile,
// ManageUserProfile, and DeveloperUserSettings. 'sheet' variant: see above.
export function PageHeader({ title, onBack, right, icon, variant = 'default' }: PageHeaderProps) {
  const slideBack = useSlideBack()
  const handleBack = onBack ?? slideBack
  return (
    <div
      className="flex-shrink-0 flex flex-col"
      style={{
        paddingLeft: 'var(--md)',
        paddingRight: 'var(--md)',
        paddingTop: 'max(env(safe-area-inset-top), var(--x5))',
        paddingBottom: 'var(--x5)',
      }}
    >
      <div className="flex items-center justify-between h-10">
        {variant === 'sheet' ? (
          <div className="flex items-center min-w-0 flex-1" style={{ gap: 'var(--x2)' }}>
            {icon}
            <p
              className="font-body font-bold leading-none text-secondary truncate min-w-0"
              style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}
            >
              {title}
            </p>
          </div>
        ) : (
          <div className="flex items-center h-full" style={{ gap: 'var(--x5)' }}>
            <button
              onClick={handleBack}
              aria-label="Back"
              className="flex-shrink-0 flex items-center justify-center"
              style={{ width: 24, height: 40 }}
            >
              <ChevronLeft
                style={{ width: 24, height: 24, color: 'var(--color-primary)' }}
                aria-hidden="true"
              />
            </button>
            <h1
              className="font-silkscreen uppercase leading-none text-primary"
              style={{ fontSize: 'var(--xl)' }}
            >
              {title}
            </h1>
          </div>
        )}
        {right}
      </div>
    </div>
  )
}
