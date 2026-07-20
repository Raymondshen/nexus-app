'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { Calendar2 } from 'pixelarticons/react/Calendar2'
import { DiamondGem } from 'pixelarticons/react/DiamondGem'
import { TokeCircle } from 'pixelarticons/react/TokeCircle'
import { useChatStore } from '@/store/chatStore'
import { EventSheetBottomPreview } from '@/features/events/components/EventSheetBottomPreview'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { CLASS_LABELS } from '@/shared/components/ui/UserCard'
import { PixelSprite, spriteInfoFor } from '@/shared/components/game/PixelSprite'
import type { AvatarClass } from '@/types'

// Fixed uppercase 3-letter abbreviations (Figma 605:3619, "JUN 20") — a manual table
// rather than toLocaleDateString('en-US', { month: 'short' }) so the label stays the
// same stylized format regardless of the device's own locale settings.
const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

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
  initialCoins?:      number
  /** This user's class for THIS crew (crew_members.class, not profiles.avatar_class —
   *  class is per-membership) — drives the right-side sprite + label (Figma 603:3526). */
  avatarClass?:                 AvatarClass | null
  /** Total unread message count across every non-DM crew this user belongs to (server-
   *  computed once at page load, same "initial snapshot" treatment as
   *  initialGemBalance/initialCoins — it doesn't live-update as messages arrive in
   *  OTHER rooms while this one stays open, since that would need a cross-crew realtime
   *  subscription this component doesn't otherwise need). Omitted/0 hides the row. */
  initialTotalUnreadMessages?: number
}

// The chat room's floating top nav — composed of the profile-avatar+name+currency button
// (Figma 577:5781 "squad-nav") plus a dev-gated PageFloatButton, and the chat-specific wiring
// that used to live in its own FloatingBackButton component/file (navigation/). Merged here
// by explicit instruction so there's a single source of button-related code instead of two,
// at the cost of this shared/ui module now importing chat-only dependencies (useChatStore,
// EventSheetBottomPreview) that PageFloatButton's other consumers (ProfileClient,
// AccountPageMember) never touch — those two are unaffected since they only import
// PageFloatButton itself, not this export.
//
// The avatar+name+currency block replaced a ChevronLeft back button per Figma — there is no
// in-app back control here anymore, and left-edge swipe (custom and native OS gesture alike) is
// deliberately blocked on the chat SlidePage (`disableSwipe`, see chat/[crewId]/page.tsx) —
// by request, a stray edge swipe should be a no-op rather than exiting the room. On iOS PWA
// (no hardware back) there is currently no way to leave a chat room; Android/desktop still
// have the system/browser back button, which pops through the /home history entry stacked
// below by the effect further down. Home's parallax-reveal animation (markHomeParallaxReveal
// / consumeHomeParallaxReveal in SlidePage.tsx) only ever fired from a since-removed tap-back
// path, so it's currently unreachable — left in place rather than deleted, same "kept but
// orphaned" treatment as other dead-but-valid code noted in CLAUDE.md.
//
// Right side (Figma 603:3526, new revision) — the dev-gated Calendar2 button now shares its
// flex-1/justify-end wrapper with a right-aligned "N New Messages" + class-sprite readout for
// the CURRENT user: a red "{n} New Message(s)" row (hidden entirely when the total is 0 — this
// is meant to draw attention, not read as a permanent "0 New Messages" fixture) above a 12×12
// PixelSprite + class label, reusing the exact same sprite/scale/CLASS_LABELS pattern
// UserCard's own member-class row already established rather than inventing a second one.
// `avatarClass` is this user's crew_members.class for THIS crew (per-membership, not
// profiles.avatar_class), and `initialTotalUnreadMessages` is a server-computed snapshot at
// page load (same "initial" treatment as initialGemBalance/initialCoins) summed across every
// non-DM crew this user belongs to — it doesn't live-update as messages land in OTHER rooms
// while this one stays open, since that would need a cross-crew realtime subscription this
// component doesn't otherwise carry. The profile block on the left is no longer flex-1 (Figma's
// own layout gives the growth to the right side instead) — its text column still truncates via
// its own min-w-0, just without consuming the row's remaining space anymore.
export function ChatFloatingNav({
  crewId, currentUserId, avatarUrl, username, initialGemBalance, initialCoins,
  avatarClass, initialTotalUnreadMessages,
}: ChatFloatingNavProps) {
  const router          = useRouter()
  const gemBalance       = useChatStore((s) => s.gemBalance)
  const userCoins        = useChatStore((s) => s.userCoins)
  const setGemBalance    = useChatStore((s) => s.setGemBalance)
  const setUserCoins     = useChatStore((s) => s.setUserCoins)
  const totalUnreadMessages = initialTotalUnreadMessages ?? 0
  const spriteInfo          = spriteInfoFor(avatarClass ?? null)
  const classLabel          = avatarClass ? (CLASS_LABELS[avatarClass] ?? avatarClass) : null

  const [showEventPreview, setShowEventPreview] = useState(false)
  const [devMode,          setDevMode]          = useState(false)
  const [eventsEnabled,    setEventsEnabled]    = useState(false)
  // Today's date in the viewer's own local timezone, "OCT 20" (Figma 605:3619 — abbreviated
  // month + day) — shown in place of the unread count when there's nothing new. Computed
  // client-side in an effect (not during render) since the server's own clock/timezone can
  // differ from the device's, which would otherwise make the SSR'd markup mismatch what the
  // client hydrates to; null until the effect runs just means this line renders nothing for
  // one frame rather than a wrong date. (Figma also shows a "· 80° F" temperature alongside
  // this — intentionally left out for now, no weather API/geolocation exists in this project yet.)
  const [localDateLabel, setLocalDateLabel] = useState<string | null>(null)

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
    if (initialCoins !== undefined) setUserCoins(initialCoins)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const now = new Date()
    const month = MONTH_ABBR[now.getMonth()]
    const dd    = String(now.getDate()).padStart(2, '0')
    setLocalDateLabel(`${month} ${dd}`)
  }, [])

  return (
    <>
      {/* Floating gradient top nav */}
      <div
        className="absolute top-0 left-0 right-0 z-[60] flex flex-col pointer-events-none overflow-hidden"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          // Figma 603:3526's own multi-stop gradient (matches the native top app bar
          // scrim more closely than the old 3-stop version) — replaces the earlier
          // simpler gradient outright rather than layering a second one.
          background: 'linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.947) 61.54%, rgba(0,0,0,0.8) 77.886%, rgba(0,0,0,0.5) 88.463%, rgba(0,0,0,0) 100%)',
        }}
      >
        {/* Nav row */}
        <div
          className="flex items-center justify-between w-full pointer-events-none"
          style={{ padding: 16 }}
        >
          {/* Profile avatar + name + currency (Figma 577:5781 "squad-nav" navbar) — one
              combined tap target opening the current user's own profile. min-w-0 so a long
              username still truncates instead of overflowing; no longer flex-1 (Figma 603:3526
              gives the row's remaining space to the right-side unread+class block instead). */}
          <button
            onClick={() => router.push('/profile')}
            aria-label="View your profile"
            className="flex items-center min-w-0 appearance-none active:opacity-70 pointer-events-auto"
            style={{ gap: 'var(--x5)' }}
          >
            <UserAvatar
              avatarUrl={avatarUrl}
              username={username}
              size={40}
              bg="primary"
              initialColor="black"
              priority
            />
            <div className="flex flex-col min-w-0 items-start" style={{ gap: 'var(--x2)' }}>
              <span
                className="font-body font-bold text-primary leading-none truncate w-full text-left"
                style={{ fontSize: 'var(--md)', fontVariationSettings: '"opsz" 14' }}
              >
                {username}
              </span>
              {/* Currency pills — same gem gradient-text/coin styling as HomeClient's
                  profile-preview card (see that component); no tap-to-claim tooltip here,
                  this is a display-only readout. */}
              <div className="flex items-center" style={{ gap: 'var(--x3)' }}>
                <div className="flex items-center" style={{ gap: 'var(--x2)' }}>
                  <DiamondGem style={{ width: 12, height: 12, color: 'var(--color-purple)' }} aria-hidden="true" />
                  <span
                    className="font-silkscreen leading-none"
                    style={{
                      fontSize:              'var(--text-xxs)',
                      background:            'linear-gradient(to right, var(--color-purple), #d946ef)',
                      WebkitBackgroundClip:  'text',
                      WebkitTextFillColor:   'transparent',
                      backgroundClip:        'text',
                    }}
                  >
                    {gemBalance}
                  </span>
                </div>
                <div className="w-[2px] h-[2px] bg-border-hover flex-shrink-0" aria-hidden="true" />
                <div className="flex items-center" style={{ gap: 'var(--x2)' }}>
                  <TokeCircle style={{ width: 12, height: 12, color: 'var(--color-coins)' }} aria-hidden="true" />
                  <span className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-xxs)', color: 'var(--color-coins)' }}>
                    {userCoins.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </button>

          {/* Right side — unread-message count (or, when there's nothing new, today's
              local date) + this user's own class readout (Figma 603:3526), plus the
              pre-existing dev-gated events button. flex-1/justify-end so this whole block
              (not the profile button) absorbs the row's remaining space and right-aligns
              its content. */}
          <div className="flex flex-1 items-center justify-end pointer-events-auto" style={{ gap: 'var(--x5)' }}>
            {(totalUnreadMessages > 0 || localDateLabel || spriteInfo) && (
              <div className="flex flex-col items-end flex-shrink-0" style={{ gap: 'var(--x2)' }}>
                {/* Red "N New Message(s)" when there's something new; otherwise today's
                    device-local date ("OCT 20", tertiary) in the same slot — never both. */}
                {totalUnreadMessages > 0 ? (
                  <p
                    className="font-body font-medium leading-none text-right whitespace-nowrap"
                    style={{ fontSize: 'var(--text-xs)', color: 'var(--red)', fontVariationSettings: '"opsz" 14' }}
                  >
                    {totalUnreadMessages} New Message{totalUnreadMessages === 1 ? '' : 's'}
                  </p>
                ) : localDateLabel && (
                  <p
                    className="font-body font-medium text-tertiary leading-none text-right whitespace-nowrap"
                    style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}
                  >
                    {localDateLabel}
                  </p>
                )}
                {spriteInfo && (
                  <div className="flex items-center justify-end" style={{ gap: 8 }}>
                    <div className="flex items-center justify-center overflow-hidden flex-shrink-0" style={{ width: 12, height: 12 }}>
                      <PixelSprite spriteId={spriteInfo.id} nativePx={spriteInfo.nativePx} scale={0.5625} animate />
                    </div>
                    <span className="font-silkscreen leading-none text-tertiary whitespace-nowrap" style={{ fontSize: 'var(--text-mini)' }}>
                      {classLabel}
                    </span>
                  </div>
                )}
              </div>
            )}
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
