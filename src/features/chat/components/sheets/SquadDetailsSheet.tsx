'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { PanInfo } from 'framer-motion'
import Image from 'next/image'
import { supabaseImageLoader } from '@/shared/supabase/imageLoader'
import { GroupAvatar } from '@/shared/components/ui/GroupAvatar'
import { getXPInCurrentLevel, getXPForCurrentLevel } from '@/shared/utils/xp'
import { MagicEdit } from 'pixelarticons/react/MagicEdit'
import { ChevronRight } from 'pixelarticons/react/ChevronRight'
import { DoorClosed } from 'pixelarticons/react/DoorClosed'
import { Upload } from 'pixelarticons/react/Upload'
import { Bell } from 'pixelarticons/react/Bell'
import { BellOff } from 'pixelarticons/react/BellOff'
import { Library } from 'pixelarticons/react/Library'
import { DefinitionButton } from '@/shared/components/ui/DefinitionButton'
import { InviteCodeCard } from '@/shared/components/ui/InviteCodeCard'
import { UserCard, type MiniMember } from '@/shared/components/ui/UserCard'

export type { MiniMember }

interface SquadDetailsSheetProps {
  crewName:                string
  memberCount:             number
  crewImageUrl:            string | null
  crewBackgroundImageUrl?: string | null
  members:                 MiniMember[]
  onlineUserIds:           Set<string>
  crewXP:                  number
  crewLevel:               number
  xpProgress:              number
  totalMessages:           number
  inviteCode?:             string
  creatorId?:              string
  currentUserId:           string
  memberMsgCounts:         Map<string, number>
  loadingCounts:           boolean
  allMuted:                boolean
  memberPinnedVinyls?:     Record<string, { imageUrl: string | null; title: string | null }>
  onUploadPhoto:           () => void
  onUploadBackground?:     () => void
  onSave:                  (newName: string) => Promise<void>
  onTapMember:             (memberId: string) => void
  onNotif:                 () => void
  onLibrary:               () => void
  onLeave?:                () => void
  onClose:                 () => void
}

// ─── Squad Details Edit Sheet ─────────────────────────────────────────────────

interface SquadDetailsEditSheetProps {
  crewName:               string
  memberCount:            number
  crewImageUrl:           string | null
  crewBackgroundImageUrl: string | null
  crewXP:                 number
  xpProgress:             number
  totalMessages:          number
  onUploadPhoto:          () => void
  onUploadBackground:     () => void
  onSave:                 (newName: string) => Promise<void>
  onClose:                () => void
}

function SquadDetailsEditSheet({
  crewName, memberCount, crewImageUrl, crewBackgroundImageUrl,
  crewXP, xpProgress, totalMessages,
  onUploadPhoto, onUploadBackground, onSave, onClose,
}: SquadDetailsEditSheetProps) {
  const [nameValue, setNameValue] = useState(crewName)
  const [saving,    setSaving]    = useState(false)

  const nameInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { nameInputRef.current?.blur() }, [])

  async function handleSave() {
    const trimmed = nameValue.trim()
    if (!trimmed || trimmed.length < 2) return
    setSaving(true)
    await onSave(trimmed)
    setSaving(false)
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 z-[80] bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      />

      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[81] bg-[var(--color-surface-sheet)] rounded-tl-[16px] rounded-tr-[16px] flex flex-col overflow-y-auto nexus-scroll"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        style={{
          maxHeight:     '90vh',
          gap:           16,
          paddingTop:    16,
          paddingLeft:   16,
          paddingRight:  16,
          paddingBottom: 'max(env(safe-area-inset-bottom), 28px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex flex-col flex-shrink-0" style={{ gap: 8 }}>
          <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
            Edit {crewName}
          </p>
          <div className="flex flex-col" style={{ gap: 4 }}>
            <p className="font-body font-bold text-primary leading-none" style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}>
              Edit {crewName}
            </p>
            <p className="font-body font-light text-tertiary leading-none" style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}>
              Invite friends, create a squad, or share your invite code.
            </p>
          </div>
        </div>

        {/* ── Squad Card Preview ── */}
        <div className="flex flex-col flex-shrink-0" style={{ gap: 8 }}>
          <p className="font-body font-medium text-primary leading-none" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
            Squad Card Preview
          </p>

          <div className="relative w-full overflow-hidden flex-shrink-0 flex flex-col justify-between" style={{ height: 180, padding: 8 }}>
            {crewBackgroundImageUrl ? (
              <div className="absolute inset-0 pointer-events-none">
                <Image
                  src={crewBackgroundImageUrl}
                  alt=""
                  fill
                  sizes="(max-width: 480px) 100vw, 480px"
                  className="object-cover"
                  loader={supabaseImageLoader}
                />
              </div>
            ) : (
              <div className="absolute inset-0 bg-[var(--color-surface)]" />
            )}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.604) 33%, rgba(0,0,0,0.6) 66%, rgba(0,0,0,0.8) 100%)' }}
            />

            <div className="relative flex items-center justify-between w-full flex-shrink-0">
              <div className="flex items-center flex-1 min-w-0" style={{ gap: 16 }}>
                <GroupAvatar imageUrl={crewImageUrl} name={nameValue || crewName} size={40} />
                <div className="flex flex-col" style={{ gap: 4 }}>
                  <p className="font-body font-black leading-none" style={{ fontSize: 'var(--text-md)', color: 'var(--color-secondary)', fontVariationSettings: '"opsz" 14' }}>
                    {(nameValue || crewName).toUpperCase()}
                  </p>
                  <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
                    {memberCount} {memberCount === 1 ? 'member' : 'members'}
                  </p>
                </div>
              </div>
            </div>

            <div className="relative flex flex-col w-full flex-shrink-0" style={{ gap: 8 }}>
              <p className="leading-[0] text-[0px] font-silkscreen">
                <span className="leading-none text-tertiary" style={{ fontSize: 'var(--text-mini)' }}>
                  {`${getXPInCurrentLevel(crewXP)} / ${getXPForCurrentLevel(crewXP)}XP`}
                </span>
                {totalMessages > 0 && (
                  <>
                    <span className="leading-none text-tertiary" style={{ fontSize: 'var(--text-mini)' }}>{` · `}</span>
                    <span className="leading-none text-secondary" style={{ fontSize: 'var(--text-mini)' }}>
                      {totalMessages.toLocaleString()} total Squad msg.
                    </span>
                  </>
                )}
              </p>
              <div className="bg-[var(--color-surface)] overflow-hidden w-full relative" style={{ height: 4 }}>
                <div
                  className="absolute left-0 top-0 h-full bg-purple"
                  style={{ width: `${xpProgress}%`, transition: 'width 0.5s ease-out' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Upload buttons (side by side) ── */}
        <div className="flex flex-shrink-0 w-full" style={{ gap: 16 }}>
          <div className="flex flex-col flex-1 min-w-0" style={{ gap: 8 }}>
            <p className="font-body font-medium text-primary leading-none" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
              Profile Photo
            </p>
            <button
              type="button"
              onClick={onUploadPhoto}
              disabled={saving}
              className="flex items-center justify-center w-full h-12 border border-[var(--color-purple)] active:opacity-70 transition-opacity disabled:opacity-40"
              style={{ gap: 8 }}
            >
              <Upload style={{ width: 16, height: 16, color: 'var(--color-purple)' }} aria-hidden="true" />
              <span className="font-silkscreen leading-none pb-0.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-purple)' }}>
                Upload
              </span>
            </button>
          </div>

          <div className="flex flex-col flex-1 min-w-0" style={{ gap: 8 }}>
            <p className="font-body font-medium text-primary leading-none" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
              Background Image
            </p>
            <button
              type="button"
              onClick={onUploadBackground}
              disabled={saving}
              className="flex items-center justify-center w-full h-12 border border-[var(--color-purple)] active:opacity-70 transition-opacity disabled:opacity-40"
              style={{ gap: 8 }}
            >
              <Upload style={{ width: 16, height: 16, color: 'var(--color-purple)' }} aria-hidden="true" />
              <span className="font-silkscreen leading-none pb-0.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-purple)' }}>
                Upload
              </span>
            </button>
          </div>
        </div>

        {/* ── Squad Name ── */}
        <div className="flex flex-col flex-shrink-0" style={{ gap: 8 }}>
          <p className="font-body font-medium text-primary leading-none" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
            Squad Name
          </p>
          <input
            ref={nameInputRef}
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value.slice(0, 30))}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            maxLength={30}
            placeholder={crewName}
            className="w-full h-12 bg-[var(--color-surface-sheet)] font-body text-primary placeholder:text-muted focus:outline-none"
            style={{ border: '1px solid var(--color-border-hover)', padding: 12, fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
            autoComplete="off"
            autoCapitalize="off"
          />
        </div>

        {/* ── Buttons ── */}
        <div className="flex flex-col flex-shrink-0" style={{ gap: 20 }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center font-silkscreen text-primary bg-[var(--color-purple)] overflow-hidden disabled:opacity-40"
            style={{ fontSize: 'var(--text-xs)', height: 48, boxShadow: '4px 4px 0 rgba(168,85,247,0.5)' }}
          >
            {saving ? '...' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="w-full flex items-center justify-center font-silkscreen overflow-hidden disabled:opacity-40"
            style={{ height: 48, fontSize: 'var(--text-xs)', color: 'var(--red)', border: '1px solid var(--red)' }}
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </>
  )
}

// ─── SquadDetailsSheet ────────────────────────────────────────────────────────

export function SquadDetailsSheet({
  crewName, memberCount, crewImageUrl, crewBackgroundImageUrl, members, onlineUserIds,
  crewXP, crewLevel, xpProgress, totalMessages, inviteCode, creatorId,
  currentUserId, memberMsgCounts, loadingCounts, allMuted, memberPinnedVinyls,
  onUploadPhoto, onUploadBackground, onSave, onTapMember, onNotif, onLibrary,
  onLeave, onClose,
}: SquadDetailsSheetProps) {
  const [showSquadEdit, setShowSquadEdit] = useState(false)
  const scrollRef      = useRef<HTMLDivElement>(null)
  const pullToCloseRef = useRef({ startY: 0, atTop: false })

  // Pull-to-close: drag down from scroll-top dismisses the sheet
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    function onTouchStart(e: TouchEvent) {
      pullToCloseRef.current = { startY: e.touches[0].clientY, atTop: el!.scrollTop === 0 }
    }
    function onTouchMove(e: TouchEvent) {
      if (!pullToCloseRef.current.atTop) return
      if (e.touches[0].clientY - pullToCloseRef.current.startY > 0) e.preventDefault()
    }
    function onTouchEnd(e: TouchEvent) {
      if (!pullToCloseRef.current.atTop) return
      if (e.changedTouches[0].clientY - pullToCloseRef.current.startY > 60) onClose()
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove',  onTouchMove,  { passive: false })
    el.addEventListener('touchend',   onTouchEnd,   { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
      el.removeEventListener('touchend',   onTouchEnd)
    }
  }, [onClose])

  function handlePanelPanEnd(_: PointerEvent, info: PanInfo) {
    if (info.offset.y > 60 || info.velocity.y > 300) onClose()
  }

  // Re-sorting on every render (e.g. toggling the edit sheet) is wasted work
  // for a list that only actually needs re-ordering when membership, presence,
  // or message counts change.
  const sortedMembers = useMemo(() => [...members].sort((a, b) => {
    const aOnline = onlineUserIds.has(a.id) ? 1 : 0
    const bOnline = onlineUserIds.has(b.id) ? 1 : 0
    if (bOnline !== aOnline) return bOnline - aOnline
    return (memberMsgCounts.get(b.id) ?? 0) - (memberMsgCounts.get(a.id) ?? 0)
  }), [members, onlineUserIds, memberMsgCounts])

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 z-[38] bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 z-[70] bg-[var(--color-surface-sheet)] rounded-tl-[16px] rounded-tr-[16px] flex flex-col overflow-hidden"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        style={{ maxHeight: '85vh' }}
        onPanEnd={handlePanelPanEnd}
      >

        {/* ── Group Header (240px, full-bleed) ── */}
        <div
          className="relative flex flex-col justify-between overflow-hidden flex-shrink-0 rounded-tl-[16px] rounded-tr-[16px]"
          style={{ height: 240, padding: 16 }}
        >
          {/* Background */}
          {crewBackgroundImageUrl ? (
            <div className="absolute inset-0 pointer-events-none rounded-tl-[16px] rounded-tr-[16px]">
              <Image
                src={crewBackgroundImageUrl}
                alt=""
                fill
                sizes="(max-width: 480px) 100vw, 480px"
                className="object-cover rounded-tl-[16px] rounded-tr-[16px]"
                loader={supabaseImageLoader}
              />
            </div>
          ) : (
            <div className="absolute inset-0 bg-[var(--color-surface)] rounded-tl-[16px] rounded-tr-[16px]" />
          )}
          {/* Gradient overlay */}
          <div
            className="absolute inset-0 pointer-events-none rounded-tl-[16px] rounded-tr-[16px]"
            style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.604) 33%, rgba(0,0,0,0.6) 66%, rgba(0,0,0,0.8) 100%)' }}
          />

          {/* Top row: image+name | action buttons */}
          <div className="relative flex items-start justify-between">
            <div className="flex items-center flex-1 min-w-0" style={{ gap: 8 }}>
              {/* 40×40 crew image */}
              <GroupAvatar imageUrl={crewImageUrl} name={crewName} size={40} />
              {/* Name + level · member count */}
              <div className="flex flex-col min-w-0" style={{ gap: 4 }}>
                <p
                  className="font-body font-black leading-none truncate uppercase"
                  style={{ fontSize: 'var(--text-md)', color: 'var(--color-secondary)', fontVariationSettings: '"opsz" 14' }}
                >
                  {crewName}
                </p>
                <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
                  Lv.{crewLevel} · {memberCount} {memberCount === 1 ? 'member' : 'members'}
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center flex-shrink-0" style={{ gap: 16 }}>
              {currentUserId === creatorId && (
                <button
                  onClick={() => setShowSquadEdit(true)}
                  className="flex items-center justify-center"
                  style={{ width: 24, height: 24 }}
                  aria-label="Edit squad details"
                >
                  <MagicEdit style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
                </button>
              )}
              <button
                onClick={onNotif}
                className="flex items-center justify-center"
                style={{ width: 24, height: 24, color: allMuted ? 'var(--color-muted)' : 'var(--color-primary)' }}
                aria-label={allMuted ? 'Notifications muted' : 'Notification settings'}
              >
                {allMuted
                  ? <BellOff style={{ width: 24, height: 24 }} aria-hidden="true" />
                  : <Bell style={{ width: 24, height: 24 }} aria-hidden="true" />}
              </button>
              <button
                onClick={onLibrary}
                className="flex items-center justify-center"
                style={{ width: 24, height: 24 }}
                aria-label="Squad glossary"
              >
                <Library style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
              </button>
              <button
                onClick={onClose}
                className="flex items-center justify-center"
                style={{ width: 24, height: 24 }}
                aria-label="Collapse"
              >
                <ChevronRight
                  style={{ width: 24, height: 24, color: 'var(--color-tertiary)', transform: 'rotate(90deg)' }}
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>

          {/* XP bar */}
          <div className="relative flex flex-col w-full" style={{ gap: 8 }}>
            <p className="leading-[0] text-[0px] font-silkscreen w-full">
              <span className="leading-none text-tertiary" style={{ fontSize: 'var(--text-mini)' }}>
                {`${getXPInCurrentLevel(crewXP)} / ${getXPForCurrentLevel(crewXP)}XP`}
              </span>
              {totalMessages > 0 && (
                <>
                  <span className="leading-none text-tertiary" style={{ fontSize: 'var(--text-mini)' }}>{` · `}</span>
                  <span className="leading-none text-secondary" style={{ fontSize: 'var(--text-mini)' }}>
                    {totalMessages.toLocaleString()} total Squad msg.
                  </span>
                </>
              )}
            </p>
            <div className="bg-[var(--color-surface)] overflow-hidden w-full" style={{ height: 4 }}>
              <motion.div
                className="h-full bg-purple"
                animate={{ width: `${xpProgress}%` }}
                transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              />
            </div>
          </div>
        </div>

        {/* ── Members section (flex-1, vertical overflow only on short viewports) ── */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 flex flex-col overflow-y-auto nexus-scroll"
          style={{ padding: 16, gap: 16 }}
        >
          <p className="flex-shrink-0 font-silkscreen leading-none" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary)' }}>
            Members
          </p>

          {inviteCode && <InviteCodeCard inviteCode={inviteCode} style={{ flexShrink: 0 }} />}

          {/* Horizontally-scrollable member card row */}
          <div className="flex overflow-x-auto no-scrollbar flex-shrink-0" style={{ gap: 8 }}>
            {sortedMembers.map((m) => (
              <UserCard
                key={m.id}
                profile={m}
                msgCount={memberMsgCounts.get(m.id) ?? 0}
                loading={loadingCounts}
                isOnline={onlineUserIds.has(m.id)}
                isCreator={m.id === creatorId}
                vinyl={memberPinnedVinyls?.[m.id] ?? null}
                onTap={() => onTapMember(m.id)}
              />
            ))}
          </div>
        </div>

        {/* ── Fixed bottom: leave squad ── */}
        {onLeave && (
          <div
            className="flex-shrink-0"
            style={{
              paddingLeft:   16,
              paddingRight:  16,
              paddingTop:    16,
              paddingBottom: 'max(env(safe-area-inset-bottom), 28px)',
            }}
          >
            <DefinitionButton
              variant="stroke"
              color="red"
              icon={<DoorClosed style={{ width: 20, height: 20 }} aria-hidden="true" />}
              onClick={onLeave}
            >
              Leave Squad
            </DefinitionButton>
          </div>
        )}
      </motion.div>

      {/* ── Squad Details edit sheet ── */}
      <AnimatePresence>
        {showSquadEdit && (
          <SquadDetailsEditSheet
            key="squad-edit"
            crewName={crewName}
            memberCount={memberCount}
            crewImageUrl={crewImageUrl}
            crewBackgroundImageUrl={crewBackgroundImageUrl ?? null}
            crewXP={crewXP}
            xpProgress={xpProgress}
            totalMessages={totalMessages}
            onUploadPhoto={onUploadPhoto}
            onUploadBackground={onUploadBackground ?? (() => {})}
            onSave={onSave}
            onClose={() => setShowSquadEdit(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
