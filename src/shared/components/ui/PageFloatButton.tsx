'use client'

import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { Calendar2 } from 'pixelarticons/react/Calendar2'
import { useSlideBack, markHomeParallaxReveal } from '@/app/layouts/SlidePage'
import { useChatStore } from '@/store/chatStore'
import { EventSheetBottomPreview } from '@/features/events/components/EventSheetBottomPreview'

interface PageFloatButtonProps {
  icon:       ReactNode
  onClick:    () => void
  ariaLabel:  string
  disabled?:  boolean
  className?: string
}

// Figma 340:3665 ("page-floatButton") — the small square glass-effect icon button used in
// page headers that float over a hero/cover image (back chevron, settings, edit, etc.),
// as opposed to PageHeader's opaque flat top bar for standard subpages. 40×40 total: 8px
// padding (var(--x3)) around a 24×24 icon. Positioning (absolute placement, safe-area
// insets, any gradient scrim behind it) is owned by the caller — this is just the button,
// matching the Figma symbol's own scope.
//
// The glass blur (backdrop-filter: blur(7px)) isn't present in the raw Figma export — Figma
// background-blur effects don't always round-trip through the design-context export — but it
// matches the blur radius already used by every other floating glass button in the codebase,
// so it's applied here explicitly rather than left flat.
export function PageFloatButton({ icon, onClick, ariaLabel, disabled, className }: PageFloatButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`flex items-center justify-center flex-shrink-0 appearance-none active:opacity-70 disabled:opacity-50${className ? ` ${className}` : ''}`}
      style={{
        padding:              'var(--x3)',
        background:           'rgba(0,0,0,0.25)',
        backdropFilter:       'blur(7px)',
        WebkitBackdropFilter: 'blur(7px)',
        color:                'var(--color-primary)',
      }}
    >
      {icon}
    </button>
  )
}

interface ChatFloatingNavProps {
  crewId:             string
  currentUserId:      string
  initialGemBalance?: number
}

// The chat room's floating top nav — composed of two PageFloatButtons plus the chat-specific
// wiring that used to live in its own FloatingBackButton component/file (navigation/). Merged
// here by explicit instruction so there's a single source of button-related code instead of
// two, at the cost of this shared/ui module now importing chat-only dependencies
// (useChatStore, EventSheetBottomPreview) that PageFloatButton's other consumers
// (ProfileClient, AccountPageMember) never touch — those two are unaffected since they only
// import PageFloatButton itself, not this export.
export function ChatFloatingNav({ crewId, currentUserId, initialGemBalance }: ChatFloatingNavProps) {
  const goBack         = useSlideBack()
  const setGemBalance  = useChatStore((s) => s.setGemBalance)

  const handleBack = useCallback(() => {
    markHomeParallaxReveal()
    goBack()
  }, [goBack])

  const [showEventPreview, setShowEventPreview] = useState(false)
  const [devMode,          setDevMode]          = useState(false)
  const [eventsEnabled,    setEventsEnabled]    = useState(false)

  // History-stacking guard: without this, returning to /chat/[crewId] from a sub-page (or a
  // fresh deep link) leaves no /home entry beneath it, so the OS/browser back gesture exits
  // the app instead of going home. Skipped when nexus_chat_from is set — see the Gotchas note
  // in CLAUDE.md for the sessionStorage handshake this participates in.
  useEffect(() => {
    const from = sessionStorage.getItem('nexus_chat_from')
    sessionStorage.removeItem('nexus_chat_from')
    if (from) return

    const current = window.location.pathname + window.location.search
    window.history.replaceState({ __NA: true }, '', '/home')
    window.history.pushState(null, '', current)
  }, [])

  useEffect(() => {
    setDevMode(localStorage.getItem('nexus_dev_mode') === '1')
    setEventsEnabled(localStorage.getItem('nexus_events_enabled') === '1')
    function onEventsChange(e: Event) { setEventsEnabled((e as CustomEvent<{ on: boolean }>).detail.on) }
    window.addEventListener('nexus-events-feature-change', onEventsChange)
    return () => window.removeEventListener('nexus-events-feature-change', onEventsChange)
  }, [])

  useEffect(() => {
    if (initialGemBalance !== undefined) setGemBalance(initialGemBalance)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Floating gradient top nav */}
      <div
        className="absolute top-0 left-0 right-0 z-[60] flex flex-col pointer-events-none overflow-hidden"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          background: 'linear-gradient(180deg, #000000 0%, rgba(0,0,0,0.25) 46.158%, rgba(0,0,0,0) 100%)',
        }}
      >
        {/* Nav row */}
        <div
          className="flex items-center justify-between w-full pointer-events-none"
          style={{ padding: 16 }}
        >
          {/* Back button */}
          <div className="pointer-events-auto">
            <PageFloatButton
              onClick={handleBack}
              ariaLabel="Go back"
              icon={<ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />}
            />
          </div>

          {/* Right actions */}
          <div className="flex items-center pointer-events-auto" style={{ gap: 'var(--x5)' }}>
            {devMode && eventsEnabled && (
              <PageFloatButton
                onClick={() => setShowEventPreview(true)}
                ariaLabel="Group events"
                icon={<Calendar2 style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />}
              />
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showEventPreview && devMode && eventsEnabled && (
          <EventSheetBottomPreview
            crewId={crewId}
            currentUserId={currentUserId}
            onClose={() => setShowEventPreview(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
