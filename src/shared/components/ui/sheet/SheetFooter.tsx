'use client'

import type { ReactNode } from 'react'

interface SheetFooterProps {
  children: ReactNode
}

// Figma 502:2783 — shared bottom-sheet CTA container (sheet counterpart to
// PageFooter). Render as the last child passed to BottomSheet, as a sibling
// AFTER the sheet's scrollable/static content — NOT wrapping it. Not every
// sheet needs one; only sheets with pinned CTA buttons (Save/Cancel/Edit/
// Delete, etc). BottomSheet already backgrounds itself with
// --color-surface-sheet, so this component only owns the footer's own
// padding/gap.
//
// Holds one or more full-width CTA buttons (Button, DefinitionButton, etc.)
// stacked with the Figma-specified gap. Content sections above it must own
// their own horizontal padding — this container is a sibling, not a wrapper.
export function SheetFooter({ children }: SheetFooterProps) {
  return (
    <div
      className="flex flex-col w-full flex-shrink-0"
      style={{
        gap:           'var(--x5)',
        paddingLeft:   'var(--x5)',
        paddingRight:  'var(--x5)',
        paddingTop:    'var(--x5)',
        paddingBottom: 'max(env(safe-area-inset-bottom), var(--x8))',
      }}
    >
      {children}
    </div>
  )
}
