'use client'

import { useState, useSyncExternalStore, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { ProfileHeroBackground } from '@/shared/components/ui/ProfileHeroBackground'
import { useSlideBack } from '@/app/layouts/SlidePage'
import { TickerBanner } from '@/shared/components/banners/TickerBanner'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { PageFloatButton } from '@/shared/components/ui/PageFloatButton'
import { SocialLinksRow } from '@/shared/components/ui/SocialLinksRow'
import { VibesGrid, type VibesGridHandle } from '@/features/profile/components/VibesGrid'
import { PhotosGrid, type PhotosGridHandle } from '@/features/profile/components/PhotosGrid'
import { FloatingViewPill, PILL_BOTTOM_INSET } from '@/features/profile/components/FloatingViewPill'
import { UploadOptionsSheet } from '@/features/profile/components/UploadOptionsSheet'
import { useSwipeTabs, useTabPanelHeight, TAB_SLIDE_VARIANTS, TAB_SLIDE_TRANSITION } from '@/features/profile/hooks/useSwipeTabs'
import { makeLocalStorageFlagStore, getServerFlagSnapshotFalse } from '@/shared/utils/localStorageFlag'
import type { PublicNote, ProfilePhoto } from '@/types'

// Dev feature flag — read via useSyncExternalStore (see makeLocalStorageFlagStore's
// own doc comment for why an effect-body setState isn't the React-idiomatic way to
// sync from an external store like localStorage).
const FRIENDSHIP_XP_STORE = makeLocalStorageFlagStore('nexus_friendship_xp', 'nexus-friendship-xp-change')

interface Props {
  userId:           string
  viewerId:         string
  username:         string
  avatarUrl:        string | null
  backgroundUrl:    string | null
  status:           string | null
  joinedYear:       number | null
  globalGroupChats: number
  globalMessages:   number
  friendshipXP:     number | null
  initialNotes:     PublicNote[]
  notesCrews:       Array<{ id: string; name: string }>
  initialPhotos:    ProfilePhoto[]
  initialPinnedId?: string | null
  instagramUrl?:    string | null
  xUrl?:            string | null
  redditUrl?:       string | null
  linkedinUrl?:     string | null
  customSiteUrl?:   string | null
}

const BOND_XP_PER_LEVEL = 100

export function AccountPageMember({
  userId,
  viewerId,
  username,
  avatarUrl,
  backgroundUrl,
  status,
  joinedYear,
  globalGroupChats,
  globalMessages,
  friendshipXP,
  initialNotes,
  notesCrews,
  initialPhotos,
  initialPinnedId = null,
  instagramUrl = null,
  xUrl = null,
  redditUrl = null,
  linkedinUrl = null,
  customSiteUrl = null,
}: Props) {
  const goBack      = useSlideBack()
  const isOwner     = viewerId === userId

  type MemberTab = 'photos' | 'vibes'
  const TAB_ORDER: Record<MemberTab, number> = { photos: 0, vibes: 1 }
  const [activeTab, setActiveTab] = useState<MemberTab>('photos')
  // Direction the incoming tab panel slides in from (Figma's TAB_SLIDE_VARIANTS
  // `custom` prop) — real state, not a ref, since it's read during render (feeding
  // AnimatePresence/motion.div below); a ref read during render can't be relied on
  // to reflect the latest committed value.
  const [tabDir, setTabDir] = useState<1 | -1>(1)
  function switchTab(tab: MemberTab) {
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

  const fxpEnabled = useSyncExternalStore(FRIENDSHIP_XP_STORE.subscribe, FRIENDSHIP_XP_STORE.getSnapshot, getServerFlagSnapshotFalse)

  const bondTotal  = friendshipXP ?? 0
  const bondLevel  = Math.floor(bondTotal / BOND_XP_PER_LEVEL) + 1
  const bondXPInLvl = bondTotal % BOND_XP_PER_LEVEL
  const bondPct    = (bondXPInLvl / BOND_XP_PER_LEVEL) * 100

  return (
    <>
      {/* ── Scrollable page body — hero, status ticker, and the Photos/Vibes tab content
          all flow together as one continuous scroll (previously only the grid itself
          scrolled internally while the hero stayed fixed above it). The back button and
          the floating pill are rendered as fixed siblings below, outside this scrolling
          div, so they stay pinned on screen regardless of scroll position. ── */}
      <div className="flex-1 min-h-0 overflow-y-auto nexus-scroll">

        {/* ── Hero — full-bleed, fixed 280px + safe-area-top ───────────────── */}
        <div
          className="relative w-full bg-black overflow-hidden"
          style={{ height: 'calc(280px + env(safe-area-inset-top, 0px))' }}
        >
          {/* Background image */}
          <ProfileHeroBackground url={backgroundUrl} />

          {/* Image overlay — light top → dark bottom (--gradient-image-overlay) */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'var(--gradient-image-overlay)' }}
          />

          {/* Content anchored to bottom */}
          <div className="absolute inset-0 flex flex-col justify-end gap-[var(--space-5)] p-[var(--space-5)]">

            {/* Avatar + name row */}
            <div className="flex items-center gap-[var(--space-5)] w-full">
              <UserAvatar avatarUrl={avatarUrl} username={username} size={56} bg="border" />

              <div className="flex-1 min-w-0 flex flex-col justify-center leading-none" style={{ gap: 'var(--space-2)' }}>
                {joinedYear && (
                  <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
                    Member Since {joinedYear}
                  </p>
                )}
                <p className="font-body font-bold truncate" style={{ fontSize: 'var(--text-xl)', fontVariationSettings: '"opsz" 14', color: 'var(--color-primary)' }}>
                  {username}
                </p>
                <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
                  {globalGroupChats} group chat{globalGroupChats !== 1 ? 's' : ''} · {globalMessages.toLocaleString()} msg
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

            {/* Friendship XP bar — hidden on own profile; dev-gated: nexus_friendship_xp */}
            {!isOwner && fxpEnabled && (
              <div className="flex flex-col w-full" style={{ gap: 'var(--space-3)' }}>
                <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
                  <span style={{ color: 'var(--color-secondary)' }}>Friendship lv {bondLevel}</span>
                  {` · ${bondXPInLvl} / 100XP`}
                </p>
                <div style={{ height: 4, background: 'var(--color-surface)', overflow: 'hidden', position: 'relative', width: '100%' }}>
                  <motion.div
                    style={{ position: 'absolute', left: 0, top: 0, height: '100%', background: 'linear-gradient(to right, var(--color-purple), #d946ef)' }}
                    initial={{ width: '0%' }}
                    animate={{ width: `${bondPct}%` }}
                    transition={{ type: 'spring', stiffness: 300, damping: 28, delay: 0.2 }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Status ticker ────────────────────────────────────────────────────── */}
        {status && <TickerBanner text={status} />}

        {/* ── Tab content — Photos/Vibes switched via the floating pill below or a left/right swipe.
            Slide transition (see TAB_SLIDE_VARIANTS): outgoing panel slides fully off-screen in the
            direction of travel while the incoming panel slides in from the opposite edge. Panels are
            top/left/right-anchored (not inset-0) so each sizes to its own natural content height;
            useTabPanelHeight mirrors the active panel's height onto this container so the page's
            scroll height stays correct through tab switches and content changes. ── */}
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
                  isOwner={isOwner}
                  bottomInset={PILL_BOTTOM_INSET}
                />
              ) : (
                <VibesGrid
                  ref={vibesGridRef}
                  initialVinyls={initialNotes}
                  isOwner={isOwner}
                  initialPinnedId={initialPinnedId}
                  bottomInset={PILL_BOTTOM_INSET}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Top gradient for button legibility — floats over whatever is currently
          scrolled beneath it (hero photo, then eventually the grid) */}
      <div
        className="absolute left-0 right-0 top-0 pointer-events-none"
        style={{
          height:     'calc(86px + env(safe-area-inset-top, 0px))',
          background: 'var(--gradient-hero-top-scrim)',
        }}
      />

      {/* Fixed overlay: back button */}
      <div
        className="absolute left-0 right-0 flex items-center px-4 pointer-events-none z-20"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 18px)' }}
      >
        <div className="pointer-events-auto">
          <PageFloatButton
            onClick={goBack}
            ariaLabel="Back"
            icon={<ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />}
          />
        </div>
      </div>

      {/* Floating Photos/Vibes/Add pill (Figma 559:6686) */}
      <div
        className="absolute left-0 right-0 z-10 flex justify-center pointer-events-none"
        style={{ bottom: 'max(env(safe-area-inset-bottom), 16px)' }}
      >
        <div className="pointer-events-auto">
          <FloatingViewPill activeTab={activeTab} onSwitch={switchTab} onAdd={() => setShowUploadOptions(true)} showAdd={isOwner} />
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
    </>
  )
}
