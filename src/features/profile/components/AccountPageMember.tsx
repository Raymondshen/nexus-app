'use client'

import { useState, useSyncExternalStore, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { ProfileHeroBackground } from '@/shared/components/ui/ProfileHeroBackground'
import { useSlideBack } from '@/app/layouts/SlidePage'
import { TickerBanner } from '@/shared/components/banners/TickerBanner'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { MagicEdit } from 'pixelarticons/react/MagicEdit'
import { Braces } from 'pixelarticons/react/Braces'
import { Plus } from 'pixelarticons/react/Plus'
import { PageFloatButton } from '@/shared/components/ui/PageFloatButton'
import { SocialLinksRow } from '@/shared/components/ui/SocialLinksRow'
import { PhotosGrid, type PhotosGridHandle } from '@/features/profile/components/PhotosGrid'
import { CurrentVibeRow } from '@/features/profile/components/CurrentVibeRow'
import { VibesPlaylistSheet } from '@/features/profile/components/VibesPlaylistSheet'
import { UploadOptionsSheet, type UploadOptionsSection } from '@/features/profile/components/UploadOptionsSheet'
import { makeLocalStorageFlagStore, getServerFlagSnapshotFalse } from '@/shared/utils/localStorageFlag'
import type { PublicNote, ProfilePhoto } from '@/types'

// Dev feature flag — read via useSyncExternalStore (see makeLocalStorageFlagStore's
// own doc comment for why an effect-body setState isn't the React-idiomatic way to
// sync from an external store like localStorage).
const FRIENDSHIP_XP_STORE = makeLocalStorageFlagStore('nexus_friendship_xp', 'nexus-friendship-xp-change')

interface Props {
  userId:           string
  viewerId:         string
  /** Braces icon gate — only ever meaningful when isOwner (this IS the viewer's own row then). */
  isDev:            boolean
  isGuest:          boolean
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

// ─── BackButton ───────────────────────────────────────────────────────────────
// See ProfileClient's identical BackButton for why this stays its own component —
// same useSlideBack context-trap: AccountPageMember itself sits above its own
// SlidePage's provider (the (app) layout renders {children} directly).
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

export function AccountPageMember({
  userId,
  viewerId,
  isDev,
  isGuest,
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
  const router  = useRouter()
  const isOwner = viewerId === userId

  // Vibes/notes lifted here for the same reason as ProfileClient — CurrentVibeRow
  // (always mounted) and VibesPlaylistSheet (mounts fresh per open) both read this
  // array, so an add/remove/reorder inside either must update the shared source.
  const [notes, setNotes] = useState<PublicNote[]>(initialNotes)

  const photosGridRef = useRef<PhotosGridHandle>(null)
  const [showUploadOptions, setShowUploadOptions] = useState(false)
  const [uploadSection, setUploadSection] = useState<UploadOptionsSection>('photos')
  const [showVibesSheet, setShowVibesSheet] = useState(false)

  const fxpEnabled = useSyncExternalStore(FRIENDSHIP_XP_STORE.subscribe, FRIENDSHIP_XP_STORE.getSnapshot, getServerFlagSnapshotFalse)

  const bondTotal   = friendshipXP ?? 0
  const bondLevel   = Math.floor(bondTotal / BOND_XP_PER_LEVEL) + 1
  const bondXPInLvl = bondTotal % BOND_XP_PER_LEVEL
  const bondPct     = (bondXPInLvl / BOND_XP_PER_LEVEL) * 100

  return (
    <>
      {/* ── Scrollable page body — hero, status ticker, the Currently Vibing preview, and
          the Photos grid all flow together as one continuous scroll, matching ProfileClient
          (Figma 684:15581) — no more Photos/Vibes tab-switch pill; Vibes lives in its own
          sheet (VibesPlaylistSheet) reached via CurrentVibeRow's playlist icon. ── */}
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

        {/* ── Currently vibing preview (Figma 684:15733) — always visible above the
            Photos grid. Playlist icon opens VibesPlaylistSheet (Figma 690:16468). ── */}
        <CurrentVibeRow
          notes={notes}
          isOwner={isOwner}
          initialPinnedId={initialPinnedId}
          onOpenPlaylist={() => setShowVibesSheet(true)}
        />

        {/* ── Photos grid — the only tab content now; no Photos/Vibes tab-switch machinery. ── */}
        <PhotosGrid
          ref={photosGridRef}
          initialPhotos={initialPhotos}
          userId={userId}
          isOwner={isOwner}
        />
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

      {/* Fixed overlay: back button + (owner only) dev/edit/add buttons — same treatment
          as ProfileClient's own header. A viewer looking at someone else's profile only
          ever sees the back button. */}
      <div
        className="absolute left-0 right-0 flex items-center justify-between px-4 pointer-events-none z-20"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 18px)' }}
      >
        <div className="pointer-events-auto">
          <BackButton />
        </div>

        {isOwner && (
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

            <PageFloatButton
              onClick={() => setShowUploadOptions(true)}
              ariaLabel="Add photo or vibe"
              disabled={isGuest}
              icon={<Plus style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />}
            />
          </div>
        )}
      </div>

      {isOwner && (
        <AnimatePresence>
          {showUploadOptions && (
            <UploadOptionsSheet
              onClose={() => setShowUploadOptions(false)}
              activeSection={uploadSection}
              onSwitchSection={setUploadSection}
              crews={notesCrews}
              onVibeAdded={(note) => setNotes(prev => [note, ...prev])}
              onUploadPhoto={() => photosGridRef.current?.openAdd()}
              onOpenCamera={() => photosGridRef.current?.openCamera()}
            />
          )}
        </AnimatePresence>
      )}

      <AnimatePresence>
        {showVibesSheet && (
          <VibesPlaylistSheet
            notes={notes}
            isOwner={isOwner}
            initialPinnedId={initialPinnedId}
            crews={notesCrews}
            onClose={() => setShowVibesSheet(false)}
            onVibeAdded={(note) => setNotes(prev => [note, ...prev])}
            onVibeRemoved={(noteId) => setNotes(prev => prev.filter(n => n.id !== noteId))}
            onReorder={(newOrder) => setNotes(prev => {
              const ids = new Set(newOrder.map(n => n.id))
              return [...newOrder, ...prev.filter(n => !ids.has(n.id))]
            })}
          />
        )}
      </AnimatePresence>
    </>
  )
}
