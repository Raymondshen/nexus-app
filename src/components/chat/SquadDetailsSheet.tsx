'use client'

import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { PanInfo } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { isSupabaseStorage, resolveAvatarUrl } from '@/components/ui/Avatar'
import { XP_PER_LEVEL } from '@/lib/game/xp'
import { PixelSprite, spriteInfoFor } from '@/components/game/PixelSprite'
import { MagicEdit } from 'pixelarticons/react/MagicEdit'
import { Bell } from 'pixelarticons/react/Bell'
import { ChevronRight } from 'pixelarticons/react/ChevronRight'
import { Crown } from 'pixelarticons/react/Crown'
import { Copy } from 'pixelarticons/react/Copy'
import { Check } from 'pixelarticons/react/Check'
import { UserMinus } from 'pixelarticons/react/UserMinus'
import { Braces } from 'pixelarticons/react/Braces'
import { Message } from 'pixelarticons/react/Message'

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
  crewId:          string
  crewName:        string
  memberCount:     number
  crewImageUrl:    string | null
  members:         MiniMember[]
  onlineUserIds:   Set<string>
  crewXP:          number
  crewLevel:       number
  xpProgress:      number
  totalMessages:   number
  inviteCode?:     string
  creatorId?:      string
  currentUserId:   string
  memberMsgCounts: Map<string, number>
  loadingCounts:   boolean
  onUploadPhoto:   () => void
  onNotifPress:    () => void
  onSave:          (newName: string) => Promise<void>
  onTapMember:     (memberId: string) => void
  onRemoveMember?: (member: MiniMember) => void
  onClose:         () => void
}

function StatusTicker({ status }: { status: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRef      = useRef<HTMLSpanElement>(null)
  const [numCopies, setNumCopies] = useState(6)
  const [animPx,    setAnimPx]    = useState(0)

  // Measure after each status change so we always fill the full container width.
  // useLayoutEffect runs before paint → no visible flash on first render.
  useLayoutEffect(() => {
    const container = containerRef.current
    const item      = itemRef.current
    if (!container || !item) return
    const cw = container.clientWidth
    const iw = item.offsetWidth
    if (iw <= 0) return
    // Need track ≥ 2× container so ticker fills the visible area.
    // Keep copy count even so the -half animation is seamless.
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
  profile, msgCount, loading, isOnline, isCreator, onTap, onRemove,
}: {
  profile: MiniMember; msgCount: number; loading: boolean; isOnline: boolean
  isCreator?: boolean; onTap?: () => void; onRemove?: () => void
}) {
  const spriteInfo = spriteInfoFor(profile.avatar_class ?? null)
  const url        = profile.avatar_url
  const initial    = profile.username[0]?.toUpperCase() ?? '?'
  const classLabel = profile.avatar_class ? (CLASS_LABELS[profile.avatar_class] ?? profile.avatar_class) : 'Unknown'

  return (
    <div className="flex flex-col gap-[var(--space-3)]">
      <div
        className="flex items-center gap-3 active:opacity-70 transition-opacity"
        onClick={onTap}
        style={onTap ? { cursor: 'pointer' } : undefined}
      >
        {/* Profile photo + online dot */}
        <div className="relative flex-shrink-0">
          <div className="w-8 h-8 overflow-hidden bg-surface flex items-center justify-center">
            {url ? (
              <div className="relative w-full h-full">
                <Image src={resolveAvatarUrl(url, 32)} alt={profile.username} fill sizes="32px" className="object-cover" unoptimized={isSupabaseStorage(url)} />
              </div>
            ) : (
              <span className="font-pixel text-[8px] text-purple">{initial}</span>
            )}
          </div>
          {isOnline && (
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#66bb6a] border-[1.5px] border-black" />
          )}
        </div>

        {/* Pixel sprite — no background, overflow clips */}
        <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center overflow-hidden">
          {spriteInfo ? (
            <PixelSprite spriteId={spriteInfo.id} nativePx={spriteInfo.nativePx} scale={1.5} animate />
          ) : (
            <span className="font-pixel text-[8px] text-purple">{initial}</span>
          )}
        </div>

        {/* Name + class · msg count */}
        <div className="flex flex-col gap-1 justify-center min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="font-body font-bold text-[16px] text-white truncate leading-none" style={{ fontVariationSettings: '"opsz" 14' }}>{profile.username}</p>
            {isCreator && (
              <Crown style={{ width: 12, height: 12, color: '#f59e0b' }} aria-hidden="true" />
            )}
          </div>
          <p className="font-silkscreen text-[8px] text-secondary leading-none">
            {loading ? '...' : `${classLabel} · ${msgCount.toLocaleString()} msg.`}
          </p>
        </div>

        {/* Remove button — creator only */}
        {onRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            className="flex-shrink-0 flex items-center justify-center w-8 h-8 text-[#ef4444] active:opacity-70 transition-opacity"
            aria-label={`Remove ${profile.username}`}
          >
            <UserMinus style={{ width: 16, height: 16 }} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Status ticker — only renders when the member has a status */}
      {profile.status && <StatusTicker status={profile.status} />}
    </div>
  )
}

// ─── Squad Details Edit Sheet (Figma 113:516) ────────────────────────────────

interface SquadDetailsEditSheetProps {
  crewName:     string
  memberCount:  number
  crewImageUrl: string | null
  members:      MiniMember[]
  onlineUserIds: Set<string>
  crewXP:       number
  crewLevel:    number
  xpProgress:   number
  totalMessages: number
  onUploadPhoto: () => void
  onSave:        (newName: string) => Promise<void>
  onClose:       () => void
}

function SquadDetailsEditSheet({
  crewName, memberCount, crewImageUrl, members, onlineUserIds,
  crewXP, crewLevel, xpProgress, totalMessages,
  onUploadPhoto, onSave, onClose,
}: SquadDetailsEditSheetProps) {
  const [nameValue, setNameValue] = useState(crewName)
  const [saving,    setSaving]    = useState(false)

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
      {/* Backdrop — above the squad details sheet (z-[50]) */}
      <motion.div
        className="fixed inset-0 z-[58] bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      />

      {/* Sheet — Figma 113:516: bg-black border-t border-border flex-col gap-[--x7] pt-[--x7] pb-[--md] px-[--md] */}
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[59] bg-[var(--background)] border-t border-border flex flex-col overflow-y-auto nexus-scroll"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        style={{
          maxHeight: '90vh',
          gap: 'var(--space-7)',
          padding: 'var(--space-7) var(--space-5)',
          paddingBottom: 'max(env(safe-area-inset-bottom), var(--space-5))',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title — Figma 113:519: DM Sans Bold --lg text-primary */}
        <h2
          className="font-body font-bold text-primary leading-none flex-shrink-0"
          style={{ fontSize: 'var(--text-lg)', fontVariationSettings: '"opsz" 14' }}
        >
          Squad Details
        </h2>

        {/* group_header preview — 200px, title row top + avatar/XP bottom (Figma 113:557) */}
        <div className="flex flex-col justify-between flex-shrink-0" style={{ height: 200 }}>
          {/* header_container: image + name/count */}
          <div className="flex items-start gap-2">
            <div className="relative flex-shrink-0 w-8 h-8 overflow-hidden">
              {crewImageUrl ? (
                <div className="relative w-full h-full">
                  <Image src={crewImageUrl} alt={nameValue || crewName} fill sizes="32px" className="object-cover" unoptimized={isSupabaseStorage(crewImageUrl)} />
                </div>
              ) : (
                <div className="w-full h-full bg-purple" />
              )}
            </div>
            <div className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
              <p
                className="font-silkscreen text-purple leading-none uppercase"
                style={{ fontSize: 'var(--text-md)' }}
              >
                {nameValue || crewName}
              </p>
              <p
                className="font-silkscreen text-tertiary leading-none"
                style={{ fontSize: 'var(--text-mini)' }}
              >
                {memberCount} {memberCount === 1 ? 'member' : 'members'}
              </p>
            </div>
          </div>

          {/* avatar list + XP bar (pinned to bottom) */}
          <div className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
            <div className="flex items-center" style={{ gap: 'var(--space-4)' }}>
              {members.slice(0, 8).map((m) => {
                const url     = m.avatar_url
                const initial = m.username[0]?.toUpperCase() ?? '?'
                const online  = onlineUserIds.has(m.id)
                return (
                  <div key={m.id} className="relative flex-shrink-0" title={m.username}>
                    <div className="w-6 h-6 overflow-hidden bg-surface flex items-center justify-center">
                      {url ? (
                        <div className="relative w-full h-full">
                          <Image src={resolveAvatarUrl(url, 24)} alt={m.username} fill sizes="24px" className="object-cover" unoptimized={isSupabaseStorage(url)} />
                        </div>
                      ) : (
                        <span className="font-pixel text-purple" style={{ fontSize: 'var(--text-mini)' }}>{initial}</span>
                      )}
                    </div>
                    {online && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#66bb6a] border-[1.5px] border-black" />
                    )}
                  </div>
                )
              })}
            </div>
            <div className="flex flex-col w-full" style={{ gap: 'var(--space-3)' }}>
              <p className="leading-[0] text-[0px] font-silkscreen flex-1 min-w-0">
                <span className="leading-none text-primary" style={{ fontSize: 'var(--text-mini)' }}>Level {crewLevel}</span>
                <span className="leading-none text-tertiary" style={{ fontSize: 'var(--text-mini)' }}>
                  {` · ${crewXP % XP_PER_LEVEL} / ${XP_PER_LEVEL}XP`}
                </span>
                {totalMessages > 0 && (
                  <span className="leading-none text-tertiary" style={{ fontSize: 'var(--text-mini)' }}>
                    {` · ${totalMessages.toLocaleString()} total msg.`}
                  </span>
                )}
              </p>
              <div className="bg-surface h-1 overflow-hidden w-full relative">
                <motion.div
                  className="absolute left-0 top-0 h-full bg-purple"
                  animate={{ width: `${xpProgress}%` }}
                  transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Fields — gap-[--x5] (Figma 113:528) */}
        <div className="flex flex-col flex-shrink-0" style={{ gap: 'var(--space-5)' }}>

          {/* Squad Profile Picture — Figma 113:535 */}
          <div className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
            <p
              className="font-body font-medium text-primary tracking-[0.2px] leading-normal"
              style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
            >
              Squad Profile Picture
            </p>
            {/* row: 48px image + upload button */}
            <div className="flex items-center" style={{ gap: 'var(--space-5)' }}>
              {/* 48×48 crew image — Figma 113:595 */}
              <div className="relative flex-shrink-0 w-12 h-12 overflow-hidden">
                {crewImageUrl ? (
                  <div className="relative w-full h-full">
                    <Image src={crewImageUrl} alt={crewName} fill sizes="48px" className="object-cover" unoptimized={isSupabaseStorage(crewImageUrl)} />
                  </div>
                ) : (
                  <div className="w-full h-full bg-purple" />
                )}
              </div>
              {/* Upload button — Figma 113:592: border-purple h-[48px] Silkscreen --sm text-purple */}
              <button
                onClick={onUploadPhoto}
                className="flex-1 h-12 border border-purple flex items-center justify-center overflow-hidden active:opacity-70 transition-opacity"
                style={{ padding: 'var(--space-3) var(--space-5)' }}
              >
                <span
                  className="font-silkscreen text-purple leading-none whitespace-nowrap uppercase"
                  style={{ fontSize: 'var(--text-sm)' }}
                >
                  upload photo
                </span>
              </button>
            </div>
          </div>

          {/* Squad Name — Figma 113:529 */}
          <div className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
            <p
              className="font-body font-medium text-primary tracking-[0.2px] leading-normal"
              style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
            >
              Squad Name
            </p>
            {/* Input — Figma 113:533: bg-black border border-border-hover h-[48px] p-[12px] */}
            <input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value.slice(0, 30))}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
              maxLength={30}
              placeholder={crewName}
              className="w-full h-12 bg-black border border-border-hover font-body text-primary placeholder:text-muted focus:outline-none focus:border-purple transition-colors"
              style={{ padding: 'var(--space-4)', fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
              autoComplete="off"
              autoCapitalize="off"
            />
          </div>
        </div>

        {/* Buttons — Figma 113:541: flex-col gap-[--x5] */}
        <div className="flex flex-col flex-shrink-0" style={{ gap: 'var(--space-5)' }}>
          {/* Save Changes — Figma 113:616: bg-purple h-[48px] Silkscreen --sm text-primary */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-12 bg-purple flex items-center justify-center overflow-hidden disabled:opacity-40 active:opacity-80 transition-opacity"
            style={{ padding: 'var(--space-3) var(--space-5)' }}
          >
            <span
              className="font-silkscreen text-primary leading-none whitespace-nowrap"
              style={{ fontSize: 'var(--text-sm)' }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </span>
          </button>
          {/* Cancel — Figma 113:620: border-red h-[48px] Silkscreen --sm text-red */}
          <button
            onClick={onClose}
            disabled={saving}
            className="w-full h-12 border flex items-center justify-center overflow-hidden disabled:opacity-40 active:opacity-70 transition-opacity"
            style={{ borderColor: 'var(--red, #ef4444)', padding: 'var(--space-3) var(--space-5)' }}
          >
            <span
              className="font-silkscreen leading-none whitespace-nowrap"
              style={{ fontSize: 'var(--text-sm)', color: 'var(--red, #ef4444)' }}
            >
              Cancel
            </span>
          </button>
        </div>
      </motion.div>
    </>
  )
}

// ─── SquadDetailsSheet ────────────────────────────────────────────────────────

export function SquadDetailsSheet({
  crewId, crewName, memberCount, crewImageUrl, members, onlineUserIds,
  crewXP, crewLevel, xpProgress, totalMessages, inviteCode, creatorId,
  currentUserId, memberMsgCounts, loadingCounts,
  onUploadPhoto, onNotifPress, onSave, onTapMember, onRemoveMember, onClose,
}: SquadDetailsSheetProps) {
  const router = useRouter()
  const [copied,         setCopied]         = useState(false)
  const [showSquadEdit,  setShowSquadEdit]  = useState(false)
  const memberListRef  = useRef<HTMLDivElement>(null)
  const pullToCloseRef = useRef({ startY: 0, atTop: false })

  // Pull-to-close: drag down from scroll-top dismisses the sheet
  useEffect(() => {
    const el = memberListRef.current
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
        className="absolute bottom-0 left-0 right-0 z-[50] bg-[var(--background)] border-t border-border flex flex-col"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        style={{ maxHeight: '85vh' }}
        onPanEnd={handlePanelPanEnd}
      >
        {/* ── Fixed header ── */}
        <div className="flex-shrink-0 flex flex-col gap-4 px-4 pt-6">

          {/* group_header — 200px tall, title row at top, avatar+XP at bottom */}
          <div className="flex flex-col justify-between" style={{ height: 200 }}>

            {/* Title row: crew image + name/count | action buttons */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {/* 32×32 crew image */}
                <div className="relative flex-shrink-0 w-8 h-8 overflow-hidden">
                  {crewImageUrl ? (
                    <div className="relative w-full h-full">
                      <Image src={crewImageUrl} alt={crewName} fill sizes="32px" className="object-cover" unoptimized={isSupabaseStorage(crewImageUrl)} />
                    </div>
                  ) : (
                    <div className="w-full h-full bg-purple" />
                  )}
                </div>

                {/* Name + member count */}
                <div className="flex flex-col gap-1 min-w-0">
                  <p className="font-silkscreen text-[16px] text-purple leading-none truncate uppercase">
                    {crewName}
                  </p>
                  <p className="font-silkscreen text-[8px] text-tertiary leading-none">
                    {memberCount} {memberCount === 1 ? 'member' : 'members'}
                  </p>
                </div>
              </div>

              {/* Action buttons — Edit (creator) | Braces | Bell | Collapse */}
              <div className="flex items-center gap-4 flex-shrink-0">
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
                  onClick={() => { onClose(); router.push(`/chat/${crewId}/definitions`) }}
                  className="flex items-center justify-center"
                  style={{ width: 24, height: 24 }}
                  aria-label="Squad glossary"
                >
                  <Braces style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
                </button>
                <button
                  onClick={onNotifPress}
                  className="flex items-center justify-center"
                  style={{ width: 24, height: 24 }}
                  aria-label="Notification settings"
                >
                  <Bell style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
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

            {/* Avatar list + XP bar (pinned to bottom of 200px block) */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                {members.slice(0, 8).map((m) => {
                  const url     = m.avatar_url
                  const initial = m.username[0]?.toUpperCase() ?? '?'
                  const online  = onlineUserIds.has(m.id)
                  return (
                    <div key={m.id} className="relative flex-shrink-0" title={m.username}>
                      <div className="w-6 h-6 overflow-hidden bg-surface flex items-center justify-center">
                        {url ? (
                          <div className="relative w-full h-full">
                            <Image src={resolveAvatarUrl(url, 24)} alt={m.username} fill sizes="24px" className="object-cover" unoptimized={isSupabaseStorage(url)} />
                          </div>
                        ) : (
                          <span className="font-pixel text-[8px] text-purple">{initial}</span>
                        )}
                      </div>
                      {online && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#66bb6a] border-[1.5px] border-black" />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* XP stats + bar */}
              <div className="flex flex-col gap-2 w-full">
                <div className="flex items-center w-full">
                  <p className="flex-1 min-w-0 leading-[0] text-[0px] font-silkscreen">
                    <span className="text-[8px] leading-none text-[#fafafa]">Level {crewLevel}</span>
                    <span className="text-[8px] leading-none text-tertiary">
                      {` · ${crewXP % XP_PER_LEVEL} / ${XP_PER_LEVEL}XP`}
                    </span>
                    {totalMessages > 0 && (
                      <span className="text-[8px] leading-none text-tertiary">
                        {` · ${totalMessages.toLocaleString()} total msg.`}
                      </span>
                    )}
                  </p>
                  <p className="font-silkscreen text-[8px] leading-none whitespace-nowrap text-tertiary">Next Boss</p>
                </div>
                <div className="bg-surface h-1 overflow-hidden w-full relative">
                  <motion.div
                    className="absolute left-0 top-0 h-full bg-purple"
                    animate={{ width: `${xpProgress}%` }}
                    transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Invite code block — group chats only */}
          {inviteCode && (
            <div className="flex items-center justify-between bg-[rgba(168,85,247,0.1)] border border-purple p-3 overflow-hidden">
              <div className="flex flex-col gap-1">
                <p className="font-silkscreen text-[8px] text-secondary leading-none tracking-[0.2px]">
                  Invite your squad
                </p>
                <p
                  className="font-silkscreen text-[24px] text-purple leading-none tracking-[0.2px]"
                  style={{ textShadow: '0px 0px 3px #a855f7' }}
                >
                  {inviteCode}
                </p>
              </div>
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1 px-4 py-3 flex-shrink-0 transition-colors duration-150"
                style={copied
                  ? { backgroundColor: '#22c55e', boxShadow: '2px 2px 0px 0px rgba(34,197,94,0.5)' }
                  : { backgroundColor: 'var(--color-purple)' }
                }
              >
                {copied ? (
                  <>
                    <Check style={{ width: 12, height: 12, color: 'white' }} aria-hidden="true" />
                    <p className="font-silkscreen text-[11px] text-white leading-none whitespace-nowrap">copied</p>
                  </>
                ) : (
                  <>
                    <Copy style={{ width: 12, height: 12, color: 'white' }} aria-hidden="true" />
                    <p className="font-silkscreen text-[11px] text-white leading-none whitespace-nowrap">Copy Code</p>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* ── Scrollable member list ── */}
        <div ref={memberListRef} className="flex-1 overflow-y-auto nexus-scroll px-4 min-h-0 mt-4" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}>
          <div className="flex flex-col gap-[var(--space-6)]">
            {members.map((m) => (
              <MemberListRow
                key={m.id}
                profile={m}
                msgCount={memberMsgCounts.get(m.id) ?? 0}
                loading={loadingCounts}
                isOnline={onlineUserIds.has(m.id)}
                isCreator={m.id === creatorId}
                onTap={() => onTapMember(m.id)}
                onRemove={
                  currentUserId === creatorId && m.id !== currentUserId && !!inviteCode && onRemoveMember
                    ? () => onRemoveMember(m)
                    : undefined
                }
              />
            ))}
          </div>
        </div>

      </motion.div>

      {/* ── Squad Details edit sheet — slides above the squad panel ── */}
      <AnimatePresence>
        {showSquadEdit && (
          <SquadDetailsEditSheet
            key="squad-edit"
            crewName={crewName}
            memberCount={memberCount}
            crewImageUrl={crewImageUrl}
            members={members}
            onlineUserIds={onlineUserIds}
            crewXP={crewXP}
            crewLevel={crewLevel}
            xpProgress={xpProgress}
            totalMessages={totalMessages}
            onUploadPhoto={() => { setShowSquadEdit(false); onUploadPhoto() }}
            onSave={onSave}
            onClose={() => setShowSquadEdit(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
