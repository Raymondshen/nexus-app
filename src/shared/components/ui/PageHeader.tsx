'use client'

import type { ReactNode } from 'react'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'

interface PageHeaderProps {
  title:  string
  onBack: () => void
  right?: ReactNode
}

// Shared header for the Definitions list page and the CreateDefinitionPage
// overlay (create/edit) — same back button + uppercase Silkscreen title,
// differing only in the optional right-side action.
export function PageHeader({ title, onBack, right }: PageHeaderProps) {
  return (
    <div
      className="flex-shrink-0 flex flex-col"
      style={{
        paddingLeft: 'var(--md)',
        paddingRight: 'var(--md)',
        paddingTop: 'max(env(safe-area-inset-top), var(--x3))',
        paddingBottom: 'var(--x3)',
      }}
    >
      <div className="flex items-center justify-between h-10">
        <div className="flex items-center h-full" style={{ gap: 'var(--x3)' }}>
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
