'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { Calendar2 } from 'pixelarticons/react/Calendar2'
import { useChatStore } from '@/store/chatStore'
import { EventSheetBottomPreview } from '@/features/events/components/EventSheetBottomPreview'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'

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
  avatarUrl:          string | null
  username:           string | null
  initialGemBalance?: number
}

// The chat room's floating top nav — composed of the profile-avatar button (Figma 577:5781
// "squad-nav") plus a dev-gated PageFloatButton, and the chat-specific wiring that used to
// live in its own FloatingBackButton component/file (navigation/). Merged here by explicit
// instruction so there's a single source of button-related code instead of two, at the cost
// of this shared/ui module now importing chat-only dependencies (useChatStore,
// EventSheetBottomPreview) that PageFloatButton's other consumers (ProfileClient,
// AccountPageMember) never touch — those two are unaffected since they only import
// PageFloatButton itself, not this export.
//
// The avatar button replaced a ChevronLeft back button per Figma — there is no in-app back
// control here anymore, and left-edge swipe (custom and native OS gesture alike) is
// deliberately blocked on the chat SlidePage (`disableSwipe`, see chat/[crewId]/page.tsx) —
// by request, a stray edge swipe should be a no-op rather than exiting the room. On iOS PWA
// (no hardware back) there is currently no way to leave a chat room; Android/desktop still
// have the system/browser back button, which pops through the /home history entry stacked
// below by the effect further down. Home's parallax-reveal animation (markHomeParallaxReveal
// / consumeHomeParallaxReveal in SlidePage.tsx) only ever fired from a since-removed tap-back
// path, so it's currently unreachable — left in place rather than deleted, same "kept but
// orphaned" treatment as other dead-but-valid code noted in CLAUDE.md.
export function ChatFloatingNav({ crewId, currentUserId, avatarUrl, username, initialGemBalance }: ChatFloatingNavProps) {
  const router          = useRouter()
  const setGemBalance   = useChatStore((s) => s.setGemBalance)

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
          {/* Profile avatar button — opens the current user's own profile */}
          <div className="pointer-events-auto">
            <button
              onClick={() => router.push('/profile')}
              aria-label="View your profile"
              className="appearance-none active:opacity-70"
              style={{ borderRadius: '50%' }}
            >
              <UserAvatar
                avatarUrl={avatarUrl}
                username={username}
                size={40}
                bg="primary"
                initialColor="black"
                priority
              />
            </button>
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
