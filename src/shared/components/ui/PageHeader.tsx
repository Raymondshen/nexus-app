'use client'

import type { ReactNode } from 'react'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'

interface PageHeaderProps {
  title:  string
  onBack: () => void
  right?: ReactNode
}

// Shared header for every subpage — ChevronLeft back button + uppercase
// Silkscreen title, with an optional right-side action. Used by the
// Definitions list page, CreateDefinitionPage overlay, ManageSquadProfile,
// ManageUserProfile, and DeveloperUserSettings. See CLAUDE.md → Page Structure.
export function PageHeader({ title, onBack, right }: PageHeaderProps) {
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
            onClick={onBack}
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
