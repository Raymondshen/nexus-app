'use client'

import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { useSlideBack } from '@/app/layouts/SlidePage'

// The "bare-icon" back button (no PageFloatButton glass box, no PageHeader
// chrome) used by pages still on the pre-PageHeader header pattern — Friends,
// Friends Inbox, Error Logs. Was 3 byte-identical inline `BackButton`
// components differing only in icon color; consolidated here. Not meant for
// new pages — new subpages should use PageHeader (see CLAUDE.md → Page
// Structure); this exists only to serve the remaining bare-icon holdouts.
export function BareIconBackButton({ color = 'var(--color-tertiary)' }: { color?: string }) {
  const goBack = useSlideBack()
  return (
    <button
      onClick={goBack}
      aria-label="Back"
      className="flex-shrink-0 flex items-center justify-center"
      style={{ width: 24, height: 40 }}
    >
      <ChevronLeft style={{ width: 24, height: 24, color }} aria-hidden="true" />
    </button>
  )
}
