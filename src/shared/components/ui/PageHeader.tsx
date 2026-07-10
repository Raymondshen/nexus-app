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
  // dismiss) rather than navigating back through SlidePage.
  onBack?: () => void
  right?:  ReactNode
}

// Shared header for every subpage — ChevronLeft back button + uppercase
// Silkscreen title, with an optional right-side action. Used by the
// Definitions list page, CreateDefinitionPage overlay, ManageSquadProfile,
// ManageUserProfile, and DeveloperUserSettings. See CLAUDE.md → Page Structure.
export function PageHeader({ title, onBack, right }: PageHeaderProps) {
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
        {right}
      </div>
    </div>
  )
}
