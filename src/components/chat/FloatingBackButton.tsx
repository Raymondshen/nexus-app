'use client'

import { useSlideBack } from '@/components/ui/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'

interface FloatingBackButtonProps {
  crewId: string
}

export function FloatingBackButton({ crewId: _crewId }: FloatingBackButtonProps) {
  const goBack = useSlideBack()

  return (
    <div
      className="absolute left-4 z-[60] flex items-center pointer-events-none"
      style={{ top: 'max(calc(env(safe-area-inset-top) + 8px), 52px)' }}
    >
      <button
        onClick={goBack}
        aria-label="Go back"
        className="pointer-events-auto flex items-center justify-center bg-surface border border-purple flex-shrink-0"
        style={{ padding: 'var(--space-3)', boxShadow: '0px 0px 20px 12px rgba(0,0,0,0.8)' }}
      >
        <ChevronLeft
          style={{ width: 'var(--space-7)', height: 'var(--space-7)', color: 'var(--color-purple)' }}
          aria-hidden="true"
        />
      </button>
    </div>
  )
}
