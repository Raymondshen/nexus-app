'use client'

import { useState, useEffect, useRef } from 'react'
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
import { useSwipeTabs } from '@/features/profile/hooks/useSwipeTabs'
import type { PublicNote, ProfilePhoto } from '@/types'

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
  const tabDirRef = useRef(1)
  function switchTab(tab: ProfileTab) {
    if (tab === activeTab) return
    tabDirRef.current = TAB_ORDER[tab] > TAB_ORDER[activeTab] ? 1 : -1
    setActiveTab(tab)
  }

  const tabContentRef = useRef<HTMLDivElement>(null)
  useSwipeTabs(tabContentRef, TAB_ORDER, activeTab, switchTab)

  const photosGridRef = useRef<PhotosGridHandle>(null)
  const vibesGridRef  = useRef<VibesGridHandle>(null)
  const [showUploadOptions, setShowUploadOptions] = useState(false)

  // ── Dev feature flags ─────────────────────────────────────────────────────
  const [afkExp,      setAfkExp]      = useState(false)
  const [fxpEnabled,  setFxpEnabled]  = useState(false)

  useEffect(() => {
    setAfkExp(localStorage.getItem('nexus_afk_exp') === '1')
    const handler = (e: Event) => setAfkExp((e as CustomEvent<{ on: boolean }>).detail.on)
    window.addEventListener('nexus-afk-exp-change', handler)
    return () => window.removeEventListener('nexus-afk-exp-change', handler)
  }, [])

  useEffect(() => {
    setFxpEnabled(localStorage.getItem('nexus_friendship_xp') === '1')
    const handler = (e: Event) => setFxpEnabled((e as CustomEvent<{ on: boolean }>).detail.on)
    window.addEventListener('nexus-friendship-xp-change', handler)
    return () => window.removeEventListener('nexus-friendship-xp-change', handler)
  }, [])

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
      {/* ── Hero section ──────────────────────────────────────────────────────── */}
      <div className="relative flex-shrink-0 w-full bg-black overflow-hidden" style={{ height: 'calc(280px + env(safe-area-inset-top, 0px))' }}>

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

        {/* Top gradient overlay */}
        <div
          className="absolute left-0 right-0 top-0 pointer-events-none"
          style={{
            height:     'calc(86px + env(safe-area-inset-top, 0px))',
            background: 'var(--gradient-hero-top-scrim)',
          }}
        />

        {/* Top bar: back button (left) + braces/edit buttons (right) */}
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

      </div>

      {/* ── Status ticker ─────────────────────────────────────────────────────── */}
      {initialStatus && <TickerBanner text={initialStatus} />}

      {/* ── Tab content — Photos/Vibes switched via the floating pill below or a left/right swipe ── */}
      <div ref={tabContentRef} className="relative flex-1 min-h-0">
        <AnimatePresence mode="wait" initial={false}>
          {activeTab === 'photos' ? (
            <motion.div
              key="photos"
              className="absolute inset-0"
              initial={{ opacity: 0, x: tabDirRef.current * 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: tabDirRef.current * -16 }}
              transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            >
              <PhotosGrid
                ref={photosGridRef}
                initialPhotos={initialPhotos}
                userId={userId}
                isOwner={true}
                bottomInset={PILL_BOTTOM_INSET}
              />
            </motion.div>
          ) : (
            <motion.div
              key="vibes"
              className="absolute inset-0"
              initial={{ opacity: 0, x: tabDirRef.current * 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: tabDirRef.current * -16 }}
              transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            >
              <VibesGrid
                ref={vibesGridRef}
                initialVinyls={initialNotes}
                isOwner={true}
                initialPinnedId={initialPinnedId}
                bottomInset={PILL_BOTTOM_INSET}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Photos/Vibes/Add pill (Figma 559:6686) */}
        <div
          className="absolute left-0 right-0 z-10 flex justify-center pointer-events-none"
          style={{ bottom: 'max(env(safe-area-inset-bottom), 16px)' }}
        >
          <div className="pointer-events-auto">
            <FloatingViewPill activeTab={activeTab} onSwitch={switchTab} onAdd={() => setShowUploadOptions(true)} />
          </div>
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
