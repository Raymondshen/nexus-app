'use client'

import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { ProfileHeroBackground } from '@/shared/components/ui/ProfileHeroBackground'
import { useSlideBack } from '@/app/layouts/SlidePage'
import { TickerBanner } from '@/shared/components/banners/TickerBanner'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { PageFloatButton } from '@/shared/components/ui/PageFloatButton'
import { SocialLinksRow } from '@/shared/components/ui/SocialLinksRow'
import { VibesGrid } from '@/features/profile/components/VibesGrid'
import { PhotosGrid } from '@/features/profile/components/PhotosGrid'
import type { PublicNote, ProfilePhoto } from '@/types'

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
  const tabDirRef   = useRef(1)
  function switchTab(tab: MemberTab) {
    if (tab === activeTab) return
    tabDirRef.current = TAB_ORDER[tab] > TAB_ORDER[activeTab] ? 1 : -1
    setActiveTab(tab)
  }

  const [fxpEnabled, setFxpEnabled] = useState(false)
  useEffect(() => {
    setFxpEnabled(localStorage.getItem('nexus_friendship_xp') === '1')
    const handler = (e: Event) => setFxpEnabled((e as CustomEvent<{ on: boolean }>).detail.on)
    window.addEventListener('nexus-friendship-xp-change', handler)
    return () => window.removeEventListener('nexus-friendship-xp-change', handler)
  }, [])

  const bondTotal  = friendshipXP ?? 0
  const bondLevel  = Math.floor(bondTotal / BOND_XP_PER_LEVEL) + 1
  const bondXPInLvl = bondTotal % BOND_XP_PER_LEVEL
  const bondPct    = (bondXPInLvl / BOND_XP_PER_LEVEL) * 100

  return (
    <>
      {/* ── Hero — full-bleed, fixed 280px + safe-area-top ───────────────── */}
      <div
        className="relative flex-shrink-0 w-full bg-black overflow-hidden"
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

        {/* Top gradient for button legibility */}
        <div
          className="absolute left-0 right-0 top-0 pointer-events-none"
          style={{
            height:     'calc(86px + env(safe-area-inset-top, 0px))',
            background: 'var(--gradient-hero-top-scrim)',
          }}
        />

        {/* Overlay: back button */}
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
      </div>

      {/* ── Status ticker ────────────────────────────────────────────────────── */}
      {status && <TickerBanner text={status} />}

      {/* ── Tab bar ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        {(['photos', 'vibes'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => switchTab(tab)}
            className="flex-1 flex items-center justify-center font-silkscreen"
            style={{
              height:    40,
              fontSize:  'var(--text-mini)',
              color:     activeTab === tab ? 'var(--color-primary)' : 'var(--color-tertiary)',
              boxShadow: activeTab === tab ? 'inset 0 -2px 0 var(--color-purple)' : 'none',
            }}
          >
            {tab === 'photos' ? 'PHOTOS' : 'VIBES'}
          </button>
        ))}
      </div>

      {/* ── Tab content ─────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait" initial={false}>
        {activeTab === 'photos' ? (
          <motion.div
            key="photos"
            className="flex-1 min-h-0"
            initial={{ opacity: 0, x: tabDirRef.current * 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: tabDirRef.current * -16 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
          >
            <PhotosGrid
              initialPhotos={initialPhotos}
              userId={userId}
              isOwner={isOwner}
            />
          </motion.div>
        ) : (
          <motion.div
            key="vibes"
            className="flex-1 min-h-0"
            initial={{ opacity: 0, x: tabDirRef.current * 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: tabDirRef.current * -16 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
          >
            <VibesGrid
              initialVinyls={initialNotes}
              crews={notesCrews}
              isOwner={isOwner}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
