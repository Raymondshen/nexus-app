'use client'

import { useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import { isSupabaseStorage, resolveAvatarUrl } from '@/shared/components/ui/Avatar'
import { useSlideBack } from '@/app/layouts/SlidePage'
import { TickerBanner } from '@/shared/components/banners/TickerBanner'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { Plus } from 'pixelarticons/react/Plus'
import { SettingsCog } from 'pixelarticons/react/SettingsCog'
import { Message } from 'pixelarticons/react/Message'
import { NotesGrid } from '@/features/profile/components/NotesGrid'
import type { NotesGridHandle } from '@/features/profile/components/NotesGrid'
import { VibesGrid } from '@/features/profile/components/VibesGrid'
import type { PublicNote } from '@/types'

interface Props {
  crewId:           string
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
}

const BOND_XP_PER_LEVEL = 100

export function AccountPageMember({
  crewId,
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
}: Props) {
  const goBack      = useSlideBack()
  const router      = useRouter()
  const isOwner     = viewerId === userId
  const notesRef    = useRef<NotesGridHandle>(null)

  const [activeTab, setActiveTab] = useState<'vibes' | 'board'>('vibes')
  const tabDirRef   = useRef(1) // +1 = vibes→board (enter from right); -1 = board→vibes (enter from left)
  function switchTab(tab: 'vibes' | 'board') {
    if (tab === activeTab) return
    tabDirRef.current = tab === 'board' ? 1 : -1
    setActiveTab(tab)
  }

  const [fxpEnabled, setFxpEnabled] = useState(false)
  useEffect(() => {
    setFxpEnabled(localStorage.getItem('nexus_friendship_xp') === '1')
    const handler = (e: Event) => setFxpEnabled((e as CustomEvent<{ on: boolean }>).detail.on)
    window.addEventListener('nexus-friendship-xp-change', handler)
    return () => window.removeEventListener('nexus-friendship-xp-change', handler)
  }, [])

  const initial    = username[0]?.toUpperCase() ?? '?'
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={backgroundUrl ?? '/img/default_image.png'}
          alt=""
          aria-hidden
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
        />

        {/* Bottom gradient */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 48.668%, rgba(0,0,0,0.8) 82.216%, rgb(0,0,0) 100%)' }}
        />

        {/* Content anchored to bottom */}
        <div className="absolute inset-0 flex flex-col justify-end gap-[var(--space-5)] p-[var(--space-5)]">

          {/* Avatar + name row */}
          <div className="flex items-center gap-[var(--space-5)] w-full">
            <div className="flex-shrink-0 bg-border overflow-hidden relative" style={{ width: 56, height: 56 }}>
              {avatarUrl ? (
                <Image
                  src={resolveAvatarUrl(avatarUrl, 56)}
                  alt={username}
                  fill
                  sizes="56px"
                  className="object-cover"
                  unoptimized={isSupabaseStorage(avatarUrl)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="font-pixel text-[12px] text-purple">{initial}</span>
                </div>
              )}
            </div>

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
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.25) 46%, rgba(0,0,0,0) 100%)',
          }}
        />

        {/* Overlay: back button (left) + owner actions (right) */}
        <div
          className="absolute left-0 right-0 flex items-center justify-between px-4 pointer-events-none z-20"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 18px)' }}
        >
          {/* Back button */}
          <button
            onClick={goBack}
            aria-label="Back"
            className="pointer-events-auto flex items-center justify-center rounded-[4px]"
            style={{ padding: 8, backdropFilter: 'blur(7px)', filter: 'drop-shadow(0px 0px 20px rgba(0,0,0,0.1))' }}
          >
            <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
          </button>

          {/* Owner-only: plus (board only) + settings */}
          {isOwner && (
            <div className="pointer-events-auto flex items-center" style={{ gap: 8 }}>
              {activeTab === 'board' && (
                <button
                  onClick={() => notesRef.current?.openAdd()}
                  aria-label="Add link"
                  className="flex items-center justify-center rounded-[4px]"
                  style={{ padding: 8, backdropFilter: 'blur(7px)', filter: 'drop-shadow(0px 0px 20px rgba(0,0,0,0.1))' }}
                >
                  <Plus style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
                </button>
              )}
              <button
                onClick={() => router.push('/profile')}
                aria-label="Settings"
                className="flex items-center justify-center rounded-[4px]"
                style={{ padding: 8, backdropFilter: 'blur(7px)', filter: 'drop-shadow(0px 0px 20px rgba(0,0,0,0.1))' }}
              >
                <SettingsCog style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Status ticker ────────────────────────────────────────────────────── */}
      {status && (
        <TickerBanner
          text={status}
          icon={<Message style={{ width: 8, height: 8, color: 'var(--color-tertiary)' }} aria-hidden="true" />}
          quoted
        />
      )}

      {/* ── Tab bar ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <button
          onClick={() => switchTab('vibes')}
          className="flex-1 flex items-center justify-center font-silkscreen"
          style={{
            height:    40,
            fontSize:  'var(--text-mini)',
            color:     activeTab === 'vibes' ? 'var(--color-primary)' : 'var(--color-tertiary)',
            boxShadow: activeTab === 'vibes' ? 'inset 0 -2px 0 var(--color-purple)' : 'none',
          }}
        >
          VIBES
        </button>
        <button
          onClick={() => switchTab('board')}
          className="flex-1 flex items-center justify-center font-silkscreen"
          style={{
            height:    40,
            fontSize:  'var(--text-mini)',
            color:     activeTab === 'board' ? 'var(--color-primary)' : 'var(--color-tertiary)',
            boxShadow: activeTab === 'board' ? 'inset 0 -2px 0 var(--color-purple)' : 'none',
          }}
        >
          BOARD
        </button>
      </div>

      {/* ── Tab content ─────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait" initial={false}>
        {activeTab === 'vibes' ? (
          <motion.div
            key="vibes"
            className="flex-1 min-h-0"
            initial={{ opacity: 0, x: tabDirRef.current * 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: tabDirRef.current * -16 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
          >
            <VibesGrid
              initialNotes={initialNotes}
              crews={notesCrews}
              isOwner={isOwner}
            />
          </motion.div>
        ) : (
          <motion.div
            key="board"
            className="flex-1 min-h-0"
            initial={{ opacity: 0, x: tabDirRef.current * 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: tabDirRef.current * -16 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
          >
            <NotesGrid
              ref={notesRef}
              viewerId={viewerId}
              initialNotes={initialNotes}
              initialSections={[]}
              crews={notesCrews}
              initialCrewId={crewId}
              lockCrew={false}
              readOnly={!isOwner}
              creatorFilter={userId}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
