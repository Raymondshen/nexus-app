'use client'

import { type ReactNode, useEffect, useState, useSyncExternalStore } from 'react'
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
import { makeLocalStorageFlagStore, getServerFlagSnapshotFalse } from '@/shared/utils/localStorageFlag'
import type { AvatarClass } from '@/types'

// Fixed uppercase 3-letter abbreviations (Figma 605:3619, "JUN 20") — a manual table
// rather than toLocaleDateString('en-US', { month: 'short' }) so the label stays the
// same stylized format regardless of the device's own locale settings.
const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
// Same rationale as MONTH_ABBR — Figma 613:3750 prefixed the date with a 3-letter
// day-of-week abbreviation ("TUE · JUN 20"). getDay() is Sunday-indexed (0 = Sun).
const DAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

// nexus_dev_mode has no in-app toggle UI (see CLAUDE.md's Dev Mode section) — only ever
// set via devtools, so this changeEvent name is never actually dispatched anywhere; the
// store still needs one to satisfy makeLocalStorageFlagStore's signature, and a static
// event name that nothing fires is equivalent to the old effect's own "read once on
// mount, never refreshed" behavior. nexus_events_enabled DOES have a real writer
// (DeveloperUserSettings.tsx) — same store instance ChatInput.tsx uses for its own copy
// of this exact flag.
const DEV_MODE_FLAG_STORE = makeLocalStorageFlagStore('nexus_dev_mode', 'nexus-dev-mode-change')
const EVENTS_FLAG_STORE   = makeLocalStorageFlagStore('nexus_events_enabled', 'nexus-events-feature-change')

// Computed fresh on every render via useSyncExternalStore rather than once in an effect
// (see makeLocalStorageFlagStore's doc comment for why an effect-body setState is the
// wrong tool here) — subscribe is a no-op (never notifies) since this only needs to be
// correct-as-of-render, not push-updated; getServerSnapshot returns null so SSR renders
// nothing here and the real date fills in on the client, avoiding a hydration mismatch
// against the server's own clock/timezone. (Figma also shows a "· 80° F" temperature
// alongside this — intentionally left out for now, no weather API/geolocation exists in
// this project yet.)
function subscribeNever() { return () => {} }
function getDateSnapshot() {
  const now   = new Date()
  const day   = DAY_ABBR[now.getDay()]
  const month = MONTH_ABBR[now.getMonth()]
  const dd    = String(now.getDate()).padStart(2, '0')
  return `${day} · ${month} ${dd}`
}
function getServerDateSnapshot() { return null }

// Figma 642:7771's avatar sprite crop (was 60 under 613:3750/637:8619's circular 40×40
// clip; this revision swapped the frame to a bordered 4px-rounded square and shrank the
// inner crop to 45) — the inner sprite renders at this fixed display size before the
// 40×40 clip, regardless of the sprite sheet's own native pixel size, so every class's
// avatar reads at the same visual scale (see PixelSprite's own nativePx-varies note for
// why a single fixed `scale` prop wouldn't do that).
const AVATAR_SPRITE_DISPLAY_PX = 45

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
// (Figma 642:7771 "squad-nav", superseding 637:8619 "squad-nav", which superseded 613:3750
// "chatNavbarTop" / "squad-nav", which itself superseded the earlier 577:5781/603:3526
// revisions) plus a dev-gated PageFloatButton, and the chat-specific wiring that used to live
// in its own FloatingBackButton component/file (navigation/). Merged here by explicit
// instruction so there's a single source of button-related code instead of two, at the cost of
// this shared/ui module now importing chat-only dependencies (useChatStore,
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
// Figma 613:3750 restructured this into two explicit rows sharing one flex-1 text column next
// to the avatar (was: avatar + stacked name/currency on the left, unread-or-date + sprite/class
// stacked separately on the right):
//   - Top row: username (bold, `--md`), right-aligned against the unread-count-or-date readout —
//     the date includes a day-of-week abbreviation ("TUE · JUN 20", `DAY_ABBR`) in
//     `--color-secondary`/semibold.
//   - Bottom row: the gem/coin currency pills, right-aligned against the plain class label text —
//     the small 12×12 sprite icon that used to sit next to this label was dropped
//     in this revision (Figma's own render has no icon there, just text).
// Figma 637:8619 ("squad-nav") was a further revision on top of that: the top row's small
// 16×16 real-photo `UserAvatar` next to the username (Figma's own layer there was just a
// plain circle, auto-named "profile image" — it had been rendered as the user's actual
// profile photo by explicit request) is dropped entirely — that export's "top row" node
// contains only the username text, nothing else. The scrim gradient also got a different
// stop table in that revision.
// Figma 642:7771 ("squad-nav") is the current revision on top of THAT: the main avatar frame
// (see "Avatar" paragraph below) swapped from a plain circular clip to a bordered, 4px-rounded
// square, and the scrim gradient's last two stops got slightly more opaque (65%/25% black at
// 80%/100%, up from 60%/10%). Nothing else changed from 637:8619.
// `avatarClass` is this user's crew_members.class for THIS crew (per-membership, not
// profiles.avatar_class), and `initialTotalUnreadMessages` is a server-computed snapshot at
// page load (same "initial" treatment as initialGemBalance/initialCoins) summed across every
// non-DM crew this user belongs to — it doesn't live-update as messages land in OTHER rooms
// while this one stays open, since that would need a cross-crew realtime subscription this
// component doesn't otherwise carry.
//
// Avatar: Figma swaps the real profile photo for the user's own class sprite, animated (the
// same walk-cycle `animate` prop the right-side sprite readout elsewhere in this file already
// uses) rather than pinned to a single static direction, cropped via a 40×40 `overflow-hidden`
// frame (bordered, 4px-rounded — see 642:7771 above) around a larger centered sprite
// (`AVATAR_SPRITE_DISPLAY_PX`, matching Figma's 45×45 inner crop regardless of the sprite
// sheet's native size, so every class reads at the same visual scale). Falls back to the
// real-photo `UserAvatar` when this user's class has no sprite mapping (`spriteInfoFor` returns
// null — e.g. an unmapped/legacy class); every class a live crew-chat member can actually have
// does map to one, so this fallback is defensive rather than expected to fire in practice —
// `UserAvatar` itself is always circular (see its own doc comment), so this fallback renders a
// circle inside the square frame rather than matching it; Figma's export never mocks this state.
//
// The Figma layer text for the class-label node ("Minnesota") doesn't match what Figma actually
// renders there ("ROGUE" in the exported screenshot) — a stale/detached text-content field on
// that node, not a new location feature. Verified against the rendered screenshot before trusting
// it: this is the pre-existing class-label readout, just moved into the bottom row.
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
  const devMode       = useSyncExternalStore(DEV_MODE_FLAG_STORE.subscribe, DEV_MODE_FLAG_STORE.getSnapshot, getServerFlagSnapshotFalse)
  const eventsEnabled = useSyncExternalStore(EVENTS_FLAG_STORE.subscribe,   EVENTS_FLAG_STORE.getSnapshot,   getServerFlagSnapshotFalse)
  // Today's date in the viewer's own local timezone, "TUE · JUN 20" (Figma 613:3750 —
  // day-of-week + abbreviated month + day) — shown in place of the unread count when there's
  // nothing new. See getDateSnapshot/getServerDateSnapshot above for why this reads via
  // useSyncExternalStore rather than an effect: null on the server (and for one client
  // render pre-hydration) means this line renders nothing rather than a wrong date.
  const localDateLabel = useSyncExternalStore(subscribeNever, getDateSnapshot, getServerDateSnapshot)

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
    if (initialGemBalance !== undefined) setGemBalance(initialGemBalance)
    if (initialCoins !== undefined) setUserCoins(initialCoins)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Floating gradient top nav */}
      <div
        className="absolute top-0 left-0 right-0 z-[60] flex flex-col pointer-events-none overflow-hidden"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          // Figma 642:7771's own multi-stop gradient — supersedes 637:8619's table
          // outright rather than layering a second one. Slightly more opaque at the
          // tail than that version (25% black at 100% vs 10%), otherwise identical.
          background: 'linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 39.909%, rgba(0,0,0,0.8) 60%, rgba(0,0,0,0.65) 80%, rgba(0,0,0,0.25) 100%)',
        }}
      >
        {/* Nav row */}
        <div
          className="flex items-center w-full pointer-events-none"
          style={{ padding: 16, gap: 'var(--x3)' }}
        >
          {/* Avatar + two-row identity/currency column (Figma 613:3750 "navbar") — one combined
              tap target opening the current user's own profile. flex-1/min-w-0 so long content
              (username, unread text) truncates instead of overflowing or pushing the dev-gated
              Calendar2 button (outside this button, below) off-screen. */}
          <button
            onClick={() => router.push('/profile')}
            aria-label="View your profile"
            className="flex flex-1 items-center min-w-0 appearance-none active:opacity-70 pointer-events-auto"
            style={{ gap: 'var(--x3)' }}
          >
            {/* Class-sprite avatar — see this component's own doc comment for the fixed-display-
                size crop + real-photo fallback. */}
            <div
              className="relative overflow-hidden border flex-shrink-0"
              style={{ width: 40, height: 40, borderRadius: 'var(--x2)', borderColor: 'var(--color-border-hover)', background: 'var(--color-background)' }}
            >
              {spriteInfo ? (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <PixelSprite
                    spriteId={spriteInfo.id}
                    nativePx={spriteInfo.nativePx}
                    scale={AVATAR_SPRITE_DISPLAY_PX / spriteInfo.nativePx}
                    animate
                  />
                </div>
              ) : (
                <UserAvatar
                  avatarUrl={avatarUrl}
                  username={username}
                  size={40}
                  bg="primary"
                  initialColor="black"
                  priority
                />
              )}
            </div>
            <div className="flex flex-1 flex-col min-w-0 items-start" style={{ gap: 'var(--x2)' }}>
              {/* Top row: username ... unread-count-or-date. */}
              <div className="flex items-center justify-between w-full">
                <span
                  className="font-body font-bold text-primary leading-none truncate text-left min-w-0"
                  style={{ fontSize: 'var(--md)', fontVariationSettings: '"opsz" 14' }}
                >
                  {username}
                </span>
                {/* Red "N New Message(s)" when there's something new; otherwise today's
                    device-local date ("TUE · JUN 20", secondary/semibold) in the same slot —
                    never both. */}
                {totalUnreadMessages > 0 ? (
                  <p
                    className="font-body font-medium leading-none text-right whitespace-nowrap flex-shrink-0"
                    style={{ fontSize: 'var(--text-xs)', color: 'var(--red)', fontVariationSettings: '"opsz" 14' }}
                  >
                    {totalUnreadMessages} New Message{totalUnreadMessages === 1 ? '' : 's'}
                  </p>
                ) : localDateLabel && (
                  <p
                    className="font-body font-semibold text-secondary leading-none text-right whitespace-nowrap flex-shrink-0"
                    style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}
                  >
                    {localDateLabel}
                  </p>
                )}
              </div>
              {/* Bottom row: currency pills ... class label. Currency pills reuse the same gem
                  gradient-text/coin styling as HomeClient's profile-preview card (see that
                  component); no tap-to-claim tooltip here, this is a display-only readout. */}
              <div className="flex items-center justify-between w-full">
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
                {classLabel && (
                  <span className="font-silkscreen leading-none text-tertiary whitespace-nowrap flex-shrink-0" style={{ fontSize: 'var(--text-xxs)' }}>
                    {classLabel}
                  </span>
                )}
              </div>
            </div>
          </button>

          {devMode && eventsEnabled && (
            <PageFloatButton
              onClick={() => setShowEventPreview(true)}
              ariaLabel="Group events"
              icon={<Calendar2 style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />}
              className="pointer-events-auto flex-shrink-0"
            />
          )}
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
