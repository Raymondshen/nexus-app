'use client'

import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { PanInfo } from 'framer-motion'
import Image from 'next/image'
import { supabaseImageLoader, avatarImageLoader } from '@/shared/supabase/imageLoader'
import { getXPInCurrentLevel, getXPForCurrentLevel } from '@/shared/utils/xp'
import { PixelSprite, spriteInfoFor } from '@/shared/components/game/PixelSprite'
import { MagicEdit } from 'pixelarticons/react/MagicEdit'
import { Bell } from 'pixelarticons/react/Bell'
import { ChevronRight } from 'pixelarticons/react/ChevronRight'
import { Library } from 'pixelarticons/react/Library'
import { Crown } from 'pixelarticons/react/Crown'
import { Copy } from 'pixelarticons/react/Copy'
import { Check } from 'pixelarticons/react/Check'
import { UserX } from 'pixelarticons/react/UserX'
import { MailRight } from 'pixelarticons/react/MailRight'
import { Message } from 'pixelarticons/react/Message'
import { Upload } from 'pixelarticons/react/Upload'

const CLASS_LABELS: Record<string, string> = {
  berserker: 'Berserker', sage: 'Sage', ghost: 'Ghost', hype_man: 'Hype Man',
  the_voice: 'The Voice', meme_lord: 'Meme Lord', mage: 'Mage', warrior: 'Warrior',
  rogue: 'Rogue', healer: 'Healer', archer: 'Archer',
}

export type MiniMember = {
  id:           string
  username:     string
  avatar_url:   string | null
  avatar_class: string | null | undefined
  status?:      string | null
}

interface SquadDetailsSheetProps {
  crewId:                  string
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
  onUploadPhoto:           () => void
  onUploadBackground?:     () => void
  onNotifPress:            () => void
  onSave:                  (newName: string) => Promise<void>
  onTapMember:             (memberId: string) => void
  onDMPress?:              (memberId: string) => void
  onOpenGlossary?:         () => void
  onRemoveMember?:         (member: MiniMember) => void
  onLeave?:                () => void
  onClose:                 () => void
}

function StatusTicker({ status }: { status: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRef      = useRef<HTMLSpanElement>(null)
  const [numCopies, setNumCopies] = useState(6)
  const [animPx,    setAnimPx]    = useState(0)

  useLayoutEffect(() => {
    const container = containerRef.current
    const item      = itemRef.current
    if (!container || !item) return
    const cw = container.clientWidth
    const iw = item.offsetWidth
    if (iw <= 0) return
    const halfNeeded = Math.ceil(cw / iw) + 1
    const n          = Math.max(4, halfNeeded % 2 === 0 ? halfNeeded * 2 : (halfNeeded + 1) * 2)
    setNumCopies(n)
    setAnimPx(iw * (n / 2))
  }, [status])

  const duration = Math.max(11, status.length * 0.28 + 5)

  return (
    <div
      ref={containerRef}
      className="overflow-hidden border-t border-b border-border px-2"
      style={{ paddingTop: 7, paddingBottom: 7 }}
    >
      <motion.div
        key={status}
        className="flex"
        initial={{ x: 0 }}
        animate={{ x: animPx > 0 ? [0, -animPx] : 0 }}
        transition={{ duration, repeat: Infinity, ease: 'linear', repeatType: 'loop' }}
      >
        {Array.from({ length: numCopies }, (_, i) => (
          <span
            key={i}
            ref={i === 0 ? itemRef : undefined}
            className="inline-flex items-center flex-shrink-0 whitespace-nowrap pr-2"
            style={{ gap: 4 }}
          >
            <Message style={{ width: 8, height: 8, color: 'var(--color-tertiary)' }} aria-hidden="true" />
            <span className="font-silkscreen text-[length:var(--text-mini)] text-tertiary leading-none">
              &ldquo;{status}&rdquo;
            </span>
          </span>
        ))}
      </motion.div>
    </div>
  )
}

function MemberListRow({
  profile, msgCount, loading, isOnline, isCreator, onTap, onDM, onRemove,
}: {
  profile: MiniMember; msgCount: number; loading: boolean; isOnline: boolean
  isCreator?: boolean; onTap?: () => void; onDM?: () => void; onRemove?: () => void
}) {
  const spriteInfo = spriteInfoFor(profile.avatar_class ?? null)
  const url        = profile.avatar_url
  const initial    = profile.username[0]?.toUpperCase() ?? '?'
  const classLabel = profile.avatar_class ? (CLASS_LABELS[profile.avatar_class] ?? profile.avatar_class) : 'Unknown'

  return (
    <div className="flex flex-col gap-[var(--space-3)]">
      <div
        className="flex items-center active:opacity-70 transition-opacity h-8"
        style={onTap ? { gap: 12, cursor: 'pointer' } : { gap: 12 }}
        onClick={onTap}
      >
        {/* Profile photo + online dot */}
        <div className="relative flex-shrink-0">
          <div className="w-8 h-8 overflow-hidden rounded-full bg-surface flex items-center justify-center">
            {url ? (
              <div className="relative w-full h-full">
                <Image src={url} alt={profile.username} fill sizes="32px" className="object-cover" loader={avatarImageLoader} />
              </div>
            ) : (
              <span className="font-pixel text-[8px] text-purple">{initial}</span>
            )}
          </div>
          {isOnline && (
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#66bb6a] border-[1.5px] border-black" />
          )}
        </div>

        {/* Pixel sprite */}
        <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center overflow-hidden">
          {spriteInfo ? (
            <PixelSprite spriteId={spriteInfo.id} nativePx={spriteInfo.nativePx} scale={1.5} animate />
          ) : (
            <span className="font-pixel text-[8px] text-purple">{initial}</span>
          )}
        </div>

        {/* Name + class · msg count */}
        <div className="flex flex-col gap-1 justify-center min-w-0 flex-1 h-full">
          <div className="flex items-center" style={{ gap: 4 }}>
            <p className="font-body font-bold text-white truncate leading-none" style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}>{profile.username}</p>
            {isCreator && (
              <Crown style={{ width: 12, height: 12, color: '#f59e0b', flexShrink: 0 }} aria-hidden="true" />
            )}
          </div>
          <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
            {loading ? '...' : `${classLabel} · ${msgCount.toLocaleString()} msg.`}
          </p>
        </div>

        {/* Action buttons: remove (creator only) + DM */}
        <div className="flex items-center flex-shrink-0" style={{ gap: 16 }}>
          {onRemove && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove() }}
              className="flex items-center justify-center active:opacity-70 transition-opacity"
              style={{ width: 24, height: 24 }}
              aria-label={`Remove ${profile.username}`}
            >
              <UserX style={{ width: 24, height: 24, color: 'var(--color-danger)' }} aria-hidden="true" />
            </button>
          )}
          {onDM && (
            <button
              onClick={(e) => { e.stopPropagation(); onDM() }}
              className="flex items-center justify-center active:opacity-70 transition-opacity"
              style={{ width: 24, height: 24 }}
              aria-label={`Message ${profile.username}`}
            >
              <MailRight style={{ width: 24, height: 24, color: 'var(--color-secondary)' }} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Status ticker */}
      {profile.status && <StatusTicker status={profile.status} />}
    </div>
  )
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
                <div className="relative flex-shrink-0 overflow-hidden" style={{ width: 40, height: 40 }}>
                  {crewImageUrl ? (
                    <Image src={crewImageUrl} alt={nameValue || crewName} fill sizes="40px" className="object-cover" loader={supabaseImageLoader} />
                  ) : (
                    <div className="w-full h-full bg-[var(--color-primary)] flex items-center justify-center">
                      <span className="font-body font-black text-black leading-none" style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}>
                        {(nameValue || crewName).charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
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
  crewId, crewName, memberCount, crewImageUrl, crewBackgroundImageUrl, members, onlineUserIds,
  crewXP, crewLevel, xpProgress, totalMessages, inviteCode, creatorId,
  currentUserId, memberMsgCounts, loadingCounts,
  onUploadPhoto, onUploadBackground, onNotifPress, onSave, onTapMember, onDMPress,
  onOpenGlossary, onRemoveMember, onLeave, onClose,
}: SquadDetailsSheetProps) {
  const [copied,        setCopied]        = useState(false)
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

  function handleCopyCode() {
    if (!inviteCode || copied) return
    navigator.clipboard.writeText(`Come join my squad on Nexus app ${inviteCode}`).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1000)
  }

  function handlePanelPanEnd(_: PointerEvent, info: PanInfo) {
    if (info.offset.y > 60 || info.velocity.y > 300) onClose()
  }

  const sortedMembers = [...members].sort((a, b) => {
    const aOnline = onlineUserIds.has(a.id) ? 1 : 0
    const bOnline = onlineUserIds.has(b.id) ? 1 : 0
    if (bOnline !== aOnline) return bOnline - aOnline
    return (memberMsgCounts.get(b.id) ?? 0) - (memberMsgCounts.get(a.id) ?? 0)
  })

  return (
    <motion.div
      className="absolute bottom-0 left-0 right-0 z-[70] bg-[var(--color-surface-sheet)] rounded-tl-[16px] rounded-tr-[16px] flex flex-col"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      style={{ maxHeight: '85vh' }}
      onPanEnd={handlePanelPanEnd}
    >

        {/* ── Group Header (180px, full-bleed) ── */}
        <div
          className="relative flex flex-col justify-between overflow-hidden flex-shrink-0 rounded-tl-[16px] rounded-tr-[16px]"
          style={{ height: 180, padding: 16 }}
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
            <div className="flex items-center flex-1 min-w-0" style={{ gap: 16 }}>
              {/* 40×40 crew image */}
              <div className="relative flex-shrink-0 overflow-hidden" style={{ width: 40, height: 40 }}>
                {crewImageUrl ? (
                  <div className="relative w-full h-full">
                    <Image src={crewImageUrl} alt={crewName} fill sizes="40px" className="object-cover" loader={supabaseImageLoader} />
                  </div>
                ) : (
                  <div className="w-full h-full bg-purple" />
                )}
              </div>
              {/* Name + member count */}
              <div className="flex flex-col min-w-0" style={{ gap: 4 }}>
                <p
                  className="font-body font-black leading-none truncate uppercase"
                  style={{ fontSize: 'var(--text-md)', color: 'var(--color-secondary)', fontVariationSettings: '"opsz" 14' }}
                >
                  {crewName}
                </p>
                <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
                  {memberCount} {memberCount === 1 ? 'member' : 'members'}
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
                onClick={onNotifPress}
                className="flex items-center justify-center"
                style={{ width: 24, height: 24 }}
                aria-label="Notification settings"
              >
                <Bell style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
              </button>
              <button
                onClick={onOpenGlossary}
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

        {/* ── Scrollable content ── */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto nexus-scroll flex flex-col min-h-0"
          style={{
            paddingTop:    16,
            paddingLeft:   16,
            paddingRight:  16,
            paddingBottom: 'max(env(safe-area-inset-bottom), 28px)',
            gap:           16,
          }}
        >
          {/* Invite code card */}
          {inviteCode && (
            <div
              className="flex items-center justify-between bg-[var(--color-surface)] border border-[var(--color-border)] flex-shrink-0"
              style={{ padding: 16 }}
            >
              <div className="flex flex-col" style={{ gap: 4 }}>
                <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-primary)' }}>
                  Invite new members
                </p>
                <p
                  className="font-silkscreen leading-none tracking-[0.2px] bg-clip-text text-transparent"
                  style={{
                    fontSize:        'var(--text-xl)',
                    backgroundImage: 'linear-gradient(to right, #a855f7, #d946ef)',
                    textShadow:      '0px 0px 3px #a855f7',
                  }}
                >
                  {inviteCode}
                </p>
              </div>
              <button
                onClick={handleCopyCode}
                className="flex items-center flex-shrink-0 transition-colors duration-150"
                style={{
                  gap: 8,
                  padding: '12px 16px',
                  ...(copied
                    ? { backgroundColor: 'var(--color-green)', boxShadow: '4px 4px 0px 0px rgba(34,197,94,0.5)' }
                    : { backgroundColor: 'var(--color-purple)', boxShadow: '4px 4px 0px 0px rgba(168,85,247,0.5)' }
                  ),
                }}
              >
                {copied ? (
                  <>
                    <Check style={{ width: 12, height: 12, color: 'var(--color-primary)' }} aria-hidden="true" />
                    <p className="font-silkscreen leading-none whitespace-nowrap" style={{ fontSize: 'var(--text-xxs)', color: 'var(--color-primary)' }}>copied</p>
                  </>
                ) : (
                  <>
                    <Copy style={{ width: 12, height: 12, color: 'var(--color-primary)' }} aria-hidden="true" />
                    <p className="font-silkscreen leading-none whitespace-nowrap" style={{ fontSize: 'var(--text-xxs)', color: 'var(--color-primary)' }}>Copy Code</p>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Members section */}
          <div className="flex flex-col flex-shrink-0" style={{ gap: 20 }}>
            <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary)' }}>
              Members
            </p>
            {sortedMembers.map((m) => (
              <MemberListRow
                key={m.id}
                profile={m}
                msgCount={memberMsgCounts.get(m.id) ?? 0}
                loading={loadingCounts}
                isOnline={onlineUserIds.has(m.id)}
                isCreator={m.id === creatorId}
                onTap={() => onTapMember(m.id)}
                onDM={onDMPress && m.id !== currentUserId ? () => onDMPress(m.id) : undefined}
                onRemove={
                  currentUserId === creatorId && m.id !== currentUserId && !!inviteCode && onRemoveMember
                    ? () => onRemoveMember(m)
                    : undefined
                }
              />
            ))}
          </div>

          {/* Leave Squad button */}
          {onLeave && (
            <button
              type="button"
              onClick={onLeave}
              className="w-full flex items-center justify-center flex-shrink-0 active:opacity-70 transition-opacity"
              style={{ height: 48, border: '1px solid var(--color-red)', gap: 8 }}
              aria-label="Leave squad"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/leave-pixel.svg" alt="" width={16} height={16} aria-hidden="true" />
              <span className="font-silkscreen leading-none pb-[2px]" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-red)' }}>
                leave squad
              </span>
            </button>
          )}
        </div>

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
    </motion.div>
  )
}
