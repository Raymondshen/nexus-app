'use client'

import { useState, useSyncExternalStore, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { SlidePage, useSlideBack } from '@/app/layouts/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { MagicEdit } from 'pixelarticons/react/MagicEdit'
import { Braces } from 'pixelarticons/react/Braces'
import { TickerBanner } from '@/shared/components/banners/TickerBanner'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { ProfileHeroBackground } from '@/shared/components/ui/ProfileHeroBackground'
import { PageFloatButton } from '@/shared/components/ui/PageFloatButton'
import { SocialLinksRow } from '@/shared/components/ui/SocialLinksRow'
import { VibesGrid, type VibesGridHandle } from '@/features/profile/components/VibesGrid'
import { PhotosGrid, type PhotosGridHandle } from '@/features/profile/components/PhotosGrid'
import { FloatingViewPill, PILL_BOTTOM_INSET } from '@/features/profile/components/FloatingViewPill'
import { UploadOptionsSheet } from '@/features/profile/components/UploadOptionsSheet'
import { useSwipeTabs, useTabPanelHeight, TAB_SLIDE_VARIANTS, TAB_SLIDE_TRANSITION } from '@/features/profile/hooks/useSwipeTabs'
import { makeLocalStorageFlagStore, getServerFlagSnapshotFalse } from '@/shared/utils/localStorageFlag'
import type { PublicNote, ProfilePhoto } from '@/types'

// Dev feature flags — read via useSyncExternalStore (see makeLocalStorageFlagStore's
// own doc comment for why an effect-body setState isn't the React-idiomatic way to
// sync from an external store like localStorage).
const AFK_EXP_STORE      = makeLocalStorageFlagStore('nexus_afk_exp',       'nexus-afk-exp-change')
const FRIENDSHIP_XP_STORE = makeLocalStorageFlagStore('nexus_friendship_xp', 'nexus-friendship-xp-change')

interface ProfileClientProps {
  userId:            string
  initialUsername:   string
  avatarUrl:         string | null
  backgroundUrl:     string | null
  isDev:             boolean
  isGuest:           boolean
  totalMessages:     number
  groupChats:        number
  inviterUsername:   string | null
  initialStatus:     string | null
  totalFriendshipXP: number
  initialNotes:      PublicNote[]
  notesCrews:        Array<{ id: string; name: string }>
  initialPhotos:     ProfilePhoto[]
  initialPinnedId?:  string | null
  instagramUrl?:     string | null
  xUrl?:             string | null
  redditUrl?:        string | null
  linkedinUrl?:      string | null
  customSiteUrl?:    string | null
}

// ─── BackButton ───────────────────────────────────────────────────────────────
// Kept as its own component (rather than resolving useSlideBack() in ProfileClient's own
// body) because it renders as a descendant of the <SlidePage> ProfileClient returns —
// see the useSlideBack context-trap note in CLAUDE.md's Page Structure section. Resolving
// the hook at ProfileClient's top level would run before SlidePage's provider exists in
// the tree and silently no-op the back button.
function BackButton() {
  const goBack = useSlideBack()
  return (
    <PageFloatButton
      onClick={goBack}
      ariaLabel="Back"
      icon={<ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />}
    />
  )
}

// ─── ProfileClient ────────────────────────────────────────────────────────────

export function ProfileClient({
  userId,
  initialUsername,
  avatarUrl,
  backgroundUrl,
  isDev,
  isGuest,
  totalMessages,
  groupChats,
  inviterUsername,
  initialStatus,
  totalFriendshipXP,
  initialNotes,
  notesCrews,
  initialPhotos,
  initialPinnedId = null,
  instagramUrl = null,
  xUrl = null,
  redditUrl = null,
  linkedinUrl = null,
  customSiteUrl = null,
}: ProfileClientProps) {
  const router = useRouter()

  // ── Tab state — switched via the floating pill (Figma 559:6686), no top tab row ──
  type ProfileTab = 'photos' | 'vibes'
  const TAB_ORDER: Record<ProfileTab, number> = { photos: 0, vibes: 1 }
  const [activeTab, setActiveTab] = useState<ProfileTab>('photos')
  // Direction the incoming tab panel slides in from (Figma's TAB_SLIDE_VARIANTS
  // `custom` prop) — real state, not a ref, since it's read during render (feeding
  // AnimatePresence/motion.div below); a ref read during render can't be relied on
  // to reflect the latest committed value.
  const [tabDir, setTabDir] = useState<1 | -1>(1)
  function switchTab(tab: ProfileTab) {
    if (tab === activeTab) return
    setTabDir(TAB_ORDER[tab] > TAB_ORDER[activeTab] ? 1 : -1)
    setActiveTab(tab)
  }

  const tabContentRef = useRef<HTMLDivElement>(null)
  useSwipeTabs(tabContentRef, TAB_ORDER, activeTab, switchTab)
  const { panelRef, height: panelHeight } = useTabPanelHeight(activeTab)

  const photosGridRef = useRef<PhotosGridHandle>(null)
  const vibesGridRef  = useRef<VibesGridHandle>(null)
  const [showUploadOptions, setShowUploadOptions] = useState(false)

  // ── Dev feature flags ─────────────────────────────────────────────────────
  const afkExp     = useSyncExternalStore(AFK_EXP_STORE.subscribe,      AFK_EXP_STORE.getSnapshot,      getServerFlagSnapshotFalse)
  const fxpEnabled = useSyncExternalStore(FRIENDSHIP_XP_STORE.subscribe, FRIENDSHIP_XP_STORE.getSnapshot, getServerFlagSnapshotFalse)

  const msgFormatted = totalMessages.toLocaleString()

  const fxpPerLevel = 100
  const fxpLevel    = Math.floor(totalFriendshipXP / fxpPerLevel) + 1
  const fxpProgress = totalFriendshipXP % fxpPerLevel
  const fxpPercent  = (fxpProgress / fxpPerLevel) * 100

  return (
    <SlidePage
      className="bg-black flex flex-col"
      style={{ position: 'fixed', inset: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden' }}
    >
      {/* ── Scrollable page body — hero, status ticker, and the Photos/Vibes tab content
          all flow together as one continuous scroll (previously only the grid itself
          scrolled internally while the hero stayed fixed above it). The back/dev/edit
          buttons and the floating pill are rendered as fixed siblings below, outside
          this scrolling div, so they stay pinned on screen regardless of scroll position. ── */}
      <div className="flex-1 min-h-0 overflow-y-auto nexus-scroll">

        {/* ── Hero section ──────────────────────────────────────────────────────── */}
        <div className="relative w-full bg-black overflow-hidden" style={{ height: 'calc(280px + env(safe-area-inset-top, 0px))' }}>

          <ProfileHeroBackground url={backgroundUrl} />

          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'var(--gradient-image-overlay)' }}
          />

          {/* Content anchored to bottom */}
          <div className="absolute inset-0 flex flex-col justify-end gap-[var(--space-5)] p-[var(--space-5)]">

            {/* Details row */}
            <div className="flex items-center gap-[var(--space-5)] w-full">
              <UserAvatar avatarUrl={avatarUrl} username={initialUsername} size={56} bg="primary" priority />

              <div className="flex-1 min-w-0 flex flex-col gap-[var(--space-2)] justify-center leading-none">
                <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
                  Lifetime msg. {msgFormatted}
                </p>
                <p className="font-body font-bold truncate" style={{ fontSize: 'var(--text-xl)', fontVariationSettings: '"opsz" 14', color: 'var(--color-primary)' }}>
                  {initialUsername}
                </p>
                <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
                  {groupChats} group chat{groupChats !== 1 ? 's' : ''}
                  {inviterUsername ? ` · rec. by ${inviterUsername}` : ''}
                </p>
              </div>
            </div>

            {/* Social links */}
            <SocialLinksRow
              instagramUrl={instagramUrl}
              xUrl={xUrl}
              redditUrl={redditUrl}
              linkedinUrl={linkedinUrl}
              customSiteUrl={customSiteUrl}
            />

            {/* Friendship XP bar — dev-gated */}
            {fxpEnabled && (
              <div className="flex flex-col w-full" style={{ gap: 8 }}>
                <p className="font-silkscreen leading-none w-full" style={{ fontSize: 'var(--text-mini)' }}>
                  <span style={{ color: 'var(--color-secondary)' }}>Friendship lv {fxpLevel}</span>
                  <span style={{ color: 'var(--color-tertiary)' }}>{` · ${fxpProgress} / 100xp`}</span>
                </p>
                <div className="w-full overflow-hidden" style={{ height: 4, background: 'var(--color-surface)' }}>
                  <div style={{ width: `${fxpPercent}%`, height: 4, background: 'linear-gradient(to right, #a855f7, #d946ef)' }} />
                </div>
              </div>
            )}

            {/* AFK EXP row — dev-only */}
            {afkExp && (
              <div className="flex items-center gap-2 w-full">
                <div className="flex flex-1 flex-col gap-2 min-w-0">
                  <p className="font-silkscreen leading-none w-full" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-primary)' }}>
                    AFK EXP accumulated · 100 / 100 XP
                  </p>
                  <div className="bg-purple w-full" style={{ height: 4 }} />
                </div>
                <button
                  className="bg-purple flex-shrink-0 flex items-center justify-center"
                  style={{ paddingLeft: 'var(--space-5)', paddingRight: 'var(--space-5)', paddingTop: 'var(--space-3)', paddingBottom: 'var(--space-3)' }}
                >
                  <span className="font-silkscreen leading-none whitespace-nowrap" style={{ fontSize: 'var(--text-xxs)', color: 'var(--color-primary)' }}>CLAIM</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Status ticker ─────────────────────────────────────────────────────── */}
        {initialStatus && <TickerBanner text={initialStatus} />}

        {/* ── Tab content — Photos/Vibes switched via the floating pill below or a left/right swipe.
            Slide transition (see TAB_SLIDE_VARIANTS): outgoing panel slides fully off-screen in the
            direction of travel while the incoming panel slides in from the opposite edge. Panels are
            top/left/right-anchored (not inset-0) so each sizes to its own natural content height;
            useTabPanelHeight mirrors the active panel's height onto this container so the page's
            scroll height stays correct through tab switches and content changes (add/remove photo). ── */}
        <div ref={tabContentRef} className="relative w-full overflow-hidden" style={{ height: panelHeight }}>
          <AnimatePresence initial={false} custom={tabDir}>
            <motion.div
              key={activeTab}
              ref={panelRef}
              custom={tabDir}
              className="absolute top-0 left-0 right-0"
              variants={TAB_SLIDE_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
              transition={TAB_SLIDE_TRANSITION}
            >
              {activeTab === 'photos' ? (
                <PhotosGrid
                  ref={photosGridRef}
                  initialPhotos={initialPhotos}
                  userId={userId}
                  isOwner={true}
                  bottomInset={PILL_BOTTOM_INSET}
                />
              ) : (
                <VibesGrid
                  ref={vibesGridRef}
                  initialVinyls={initialNotes}
                  isOwner={true}
                  initialPinnedId={initialPinnedId}
                  bottomInset={PILL_BOTTOM_INSET}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ── Fixed top scrim + bar — back / dev / edit buttons float over whatever is
          currently scrolled beneath them (hero photo, then eventually the grid). ── */}
      <div
        className="absolute left-0 right-0 top-0 pointer-events-none"
        style={{ height: 'calc(86px + env(safe-area-inset-top, 0px))', background: 'var(--gradient-hero-top-scrim)' }}
      />
      <div
        className="absolute z-20 left-0 right-0 flex items-center justify-between pointer-events-none"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 18px)', paddingLeft: 16, paddingRight: 16 }}
      >
        <div className="pointer-events-auto">
          <BackButton />
        </div>

        <div className="flex items-center pointer-events-auto" style={{ gap: 16 }}>
          {isDev && (
            <PageFloatButton
              onClick={() => router.push('/profile/settings')}
              ariaLabel="Developer settings"
              icon={<Braces style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />}
            />
          )}

          <PageFloatButton
            onClick={() => router.push('/profile/manage')}
            ariaLabel="Edit profile"
            disabled={isGuest}
            icon={<MagicEdit style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />}
          />
        </div>
      </div>

      {/* Floating Photos/Vibes/Add pill (Figma 559:6686) */}
      <div
        className="absolute left-0 right-0 z-10 flex justify-center pointer-events-none"
        style={{ bottom: 'max(env(safe-area-inset-bottom), 16px)' }}
      >
        <div className="pointer-events-auto">
          <FloatingViewPill activeTab={activeTab} onSwitch={switchTab} onAdd={() => setShowUploadOptions(true)} />
        </div>
      </div>

      <AnimatePresence>
        {showUploadOptions && (
          <UploadOptionsSheet
            onClose={() => setShowUploadOptions(false)}
            activeSection={activeTab}
            onSwitchSection={switchTab}
            crews={notesCrews}
            onVibeAdded={(note) => vibesGridRef.current?.addVibe(note)}
            onUploadPhoto={() => photosGridRef.current?.openAdd()}
            onOpenCamera={() => photosGridRef.current?.openCamera()}
          />
        )}
      </AnimatePresence>

    </SlidePage>
  )
}
