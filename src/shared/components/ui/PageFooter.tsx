'use client'

import type { ReactNode } from 'react'

interface PageFooterProps {
  children: ReactNode
}

// Figma 480:6187 — shared bottom action container for subpage CTA buttons
// (pairs with PageHeader for the top half of the pattern). Render as a
// flex-shrink-0 sibling directly AFTER the page's scrollable content, inside
// a full-height flex column (e.g. SlidePage's `flex flex-col` root) — this
// docks it to the true bottom without `position: fixed`, so it never
// overlaps scrollable content or fights the on-screen keyboard.
//
// Holds one or more full-width CTA buttons (Button, DefinitionButton, etc.)
// stacked with the Figma-specified gap. More button variants get wired into
// this container over time — it doesn't own button styling itself.
export function PageFooter({ children }: PageFooterProps) {
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
