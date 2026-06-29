'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { SlidePage, useSlideBack } from '@/app/layouts/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { Message } from 'pixelarticons/react/Message'
import { SettingsCogIcon } from '@/shared/icons/SettingsCogIcon'
import Image from 'next/image'
import { avatarImageLoader } from '@/shared/supabase/imageLoader'
import { TickerBanner } from '@/shared/components/banners/TickerBanner'
import { VibesGrid } from '@/features/profile/components/VibesGrid'
import { PhotosGrid } from '@/features/profile/components/PhotosGrid'
import type { PublicNote, ProfilePhoto } from '@/types'

interface ProfileClientProps {
  userId:            string
  initialUsername:   string
  avatarUrl:         string | null
  backgroundUrl:     string | null
  isDev:             boolean
  memberSinceYear:   string
  totalMessages:     number
  groupChats:        number
  inviterUsername:   string | null
  initialStatus:     string | null
  totalFriendshipXP: number
  initialNotes:      PublicNote[]
  notesCrews:        Array<{ id: string; name: string }>
  initialPhotos:     ProfilePhoto[]
}

// ─── Profile status ticker ────────────────────────────────────────────────────

function ProfileStatusTicker({ status }: { status: string }) {
  return (
    <TickerBanner
      text={status}
      icon={<Message style={{ width: 8, height: 8, color: 'var(--color-tertiary)' }} aria-hidden="true" />}
      quoted
    />
  )
}

// ─── BackButton ───────────────────────────────────────────────────────────────

function BackButton() {
  const goBack = useSlideBack()
  return (
    <button
      onClick={goBack}
      aria-label="Back"
      className="flex items-center justify-center border border-border flex-shrink-0"
      style={{
        padding:             'var(--x3)',
        background:          'rgba(0,0,0,0)',
        backdropFilter:      'blur(7px)',
        WebkitBackdropFilter:'blur(7px)',
        boxShadow:           '0px 0px 20px 12px rgba(0,0,0,0.1)',
      }}
    >
      <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
    </button>
  )
}

// ─── ProfileClient ────────────────────────────────────────────────────────────

export function ProfileClient({
  userId,
  initialUsername,
  avatarUrl,
  backgroundUrl,
  isDev,
  memberSinceYear,
  totalMessages,
  groupChats,
  inviterUsername,
  initialStatus,
  totalFriendshipXP,
  initialNotes,
  notesCrews,
  initialPhotos,
}: ProfileClientProps) {
  const router = useRouter()

  // ── Tab state ─────────────────────────────────────────────────────────────
  type ProfileTab = 'photos' | 'vibes'
  const TAB_ORDER: Record<ProfileTab, number> = { photos: 0, vibes: 1 }
  const [activeTab, setActiveTab] = useState<ProfileTab>('photos')
  const tabDirRef = useRef(1)
  function switchTab(tab: ProfileTab) {
    if (tab === activeTab) return
    tabDirRef.current = TAB_ORDER[tab] > TAB_ORDER[activeTab] ? 1 : -1
    setActiveTab(tab)
  }

  // ── Hero display state ────────────────────────────────────────────────────
  const [localAvatarUrl,     setLocalAvatarUrl]     = useState(avatarUrl)
  const [localBackgroundUrl, setLocalBackgroundUrl] = useState(backgroundUrl)
  const [localUsername,      setLocalUsername]      = useState(initialUsername)
  const [localStatus,        setLocalStatus]        = useState(initialStatus ?? '')

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

  const initial      = localUsername[0]?.toUpperCase() ?? '?'
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

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={localBackgroundUrl ?? '/img/default_image.png'}
          alt=""
          aria-hidden
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
        />

        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 48.668%, rgba(0,0,0,0.8) 82.216%, rgb(0,0,0) 100%)' }}
        />

        {/* Content anchored to bottom */}
        <div className="absolute inset-0 flex flex-col justify-end gap-[var(--space-5)] p-[var(--space-5)]">

          {/* Details row */}
          <div className="flex items-center gap-[var(--space-5)] w-full">
            <div className="flex-shrink-0 relative overflow-hidden bg-primary rounded-full" style={{ width: 56, height: 56 }}>
              {localAvatarUrl ? (
                <Image src={localAvatarUrl} alt={localUsername} fill sizes="56px" className="object-cover" priority loader={avatarImageLoader} />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="font-pixel text-[12px] text-purple">{initial}</span>
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-[var(--space-2)] justify-center leading-none">
              <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
                Lifetime msg. {msgFormatted}
              </p>
              <p className="font-body font-bold truncate" style={{ fontSize: 'var(--text-xl)', fontVariationSettings: '"opsz" 14', color: 'var(--color-primary)' }}>
                {localUsername}
              </p>
              <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
                {groupChats} group chat{groupChats !== 1 ? 's' : ''}
                {inviterUsername ? ` · rec. by ${inviterUsername}` : ''}
              </p>
            </div>
          </div>

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
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.25) 46.158%, rgba(0,0,0,0) 100%)',
          }}
        />

        {/* Top bar: back button (left) + settings cog (right) */}
        <div
          className="absolute z-20 left-0 right-0 flex items-center justify-between pointer-events-none"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 18px)', paddingLeft: 16, paddingRight: 16 }}
        >
          <div className="pointer-events-auto">
            <BackButton />
          </div>

          <button
            onClick={() => router.push('/profile/settings')}
            aria-label="Profile settings"
            className="flex items-center justify-center border border-border flex-shrink-0 pointer-events-auto"
            style={{
              padding:             'var(--x3)',
              background:          'rgba(0,0,0,0)',
              backdropFilter:      'blur(7px)',
              WebkitBackdropFilter:'blur(7px)',
              boxShadow:           '0px 0px 20px 12px rgba(0,0,0,0.1)',
            }}
          >
            <SettingsCogIcon style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
          </button>
        </div>

      </div>

      {/* ── Status ticker ─────────────────────────────────────────────────────── */}
      {localStatus && <ProfileStatusTicker status={localStatus} />}

      {/* ── Tab bar: Photos | Vibes ─────────────────────────────────────────── */}
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
              isOwner={true}
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
              isOwner={true}
            />
          </motion.div>
        )}
      </AnimatePresence>

    </SlidePage>
  )
}
