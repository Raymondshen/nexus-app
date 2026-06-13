'use client'

import { useEffect } from 'react'
import { useSlideBack } from '@/components/ui/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'

interface FloatingBackButtonProps {
  crewId: string
}

export function FloatingBackButton({ crewId: _crewId }: FloatingBackButtonProps) {
  const goBack = useSlideBack()

  useEffect(() => {
    // If the user tapped a crew card from /home, history is already
    // /home → /chat and native swipe-back is correct — skip normalization.
    // Otherwise (onboarding redirect, deep link) inject a proper /home entry
    // so swipe-back always lands on home.
    const from = sessionStorage.getItem('nexus_chat_from')
    sessionStorage.removeItem('nexus_chat_from')
    if (from === '/home') return

    const current = window.location.pathname + window.location.search
    // Use { __NA: true } (Next.js App Router marker, no component tree) so
    // Next.js intercepts the popstate and renders /home from prefetch cache
    // rather than re-applying the chat tree (which caused the double-swipe).
    window.history.replaceState({ __NA: true }, '', '/home')
    window.history.pushState(null, '', current)
  }, [])

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
