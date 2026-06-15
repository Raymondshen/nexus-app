'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion'
import type { PanInfo } from 'framer-motion'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { ChevronRight } from 'pixelarticons/react/ChevronRight'
import { TokeCircle } from 'pixelarticons/react/TokeCircle'
import { Heart } from 'pixelarticons/react/Heart'
import { Logout } from 'pixelarticons/react/Logout'
import { Notebook } from 'pixelarticons/react/Notebook'
import { Plus } from 'pixelarticons/react/Plus'
import { Message as MessageIcon } from 'pixelarticons/react/Message'
import Image from 'next/image'
import { isSupabaseStorage, resolveAvatarUrl } from '@/components/ui/Avatar'
import { createClient } from '@/lib/supabase/client'
import { createCrewAction } from '@/app/(app)/onboarding/create/actions'
import { joinCrewAction }   from '@/app/(app)/onboarding/join/actions'
import { leaveCrewAction } from './actions'
import { InviteArsenal } from './InviteArsenal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { CrewSummary } from './page'
import type { Message, MessageWithProfile } from '@/types'
import { useChatStore } from '@/store/chatStore'
import { clearSkipNextSlideEnter } from '@/components/ui/SlidePage'
import { AnnouncementBanner } from '@/components/ui/AnnouncementBanner'
import type { AnnouncementItem } from '@/components/ui/AnnouncementBanner'

export interface FriendSummary {
  id:            string
  username:      string
  avatarUrl:     string | null
  dmChannelId:   string | null
  lastDMMessage: { content: string; created_at: string } | null
}

interface HomeClientProps {
  initialCrews:       CrewSummary[]
  userId:             string
  username:           string
  avatarUrl:          string | null
  memberSince:        string
  profileCache:       Record<string, string>
  totalMessages:      number
  status:             string | null
  friends:            FriendSummary[]
  initialCoins:       number
  announcements:      AnnouncementItem[]
  totalFriendshipXP:  number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const XP_PER_LEVEL = 500

function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max - 1) + '…'
}

function relativeTime(iso: string): string {
  try {
    const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (seconds < 60)    return 'just now'
    if (seconds < 3600)  return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  } catch {
    return ''
  }
}

// ─── Home status ticker ───────────────────────────────────────────────────────

function HomeStatusTicker({ status }: { status: string }) {
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

  const duration = Math.max(21, status.length * 0.28 + 15)

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
            <MessageIcon style={{ width: 8, height: 8, color: 'var(--color-tertiary)' }} aria-hidden="true" />
            <span className="font-silkscreen text-[length:var(--text-mini)] text-tertiary leading-none">
              &ldquo;{status}&rdquo;
            </span>
          </span>
        ))}
      </motion.div>
    </div>
  )
}

// ─── Account preview container ───────────────────────────────────────────────

function AccountPreviewContainer({
  username,
  avatarUrl,
  memberSince,
  crewCount,
  totalMessages,
  status,
  onEditProfile,
  afkExpEnabled,
  coins,
  infiniteCoins,
  showCoinTip,
  onCoinTap,
  onFriends,
  onInviteSquad,
  totalFriendshipXP,
  infiniteFriendshipXP,
}: {
  username:          string
  avatarUrl:         string | null
  memberSince:       string
  crewCount:         number
  totalMessages:     number
  status:            string | null
  onEditProfile:     () => void
  afkExpEnabled:     boolean
  coins:             number
  infiniteCoins:     boolean
  showCoinTip:       boolean
  onCoinTap:         () => void
  onFriends:            () => void
  onInviteSquad:        () => void
  totalFriendshipXP:    number
  infiniteFriendshipXP: boolean
}) {
  return (
    <div
      className="bg-[rgba(17,17,17,0.5)] border border-[var(--color-surface)] rounded-[8px] overflow-hidden flex flex-col gap-[var(--space-5)] cursor-pointer active:opacity-80 transition-opacity"
      style={{ padding: 'var(--space-5)' }}
      onClick={onEditProfile}
      role="button"
      aria-label="Edit profile"
    >
      {/* Details row */}
      <div className="flex items-start gap-[var(--space-5)]">
        {/* Avatar + text */}
        <div className="flex gap-[var(--space-5)] items-center flex-1 min-w-0">
          {/* Avatar 48×48 */}
          <div className="w-12 h-12 flex-shrink-0 overflow-hidden relative bg-primary">
            {avatarUrl ? (
              <Image src={resolveAvatarUrl(avatarUrl, 48)} alt={username} fill sizes="48px" className="object-cover" priority unoptimized={isSupabaseStorage(avatarUrl)} />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-pixel text-[10px] text-black">
                {username[0]?.toUpperCase() ?? '?'}
              </div>
            )}
          </div>

          {/* Name + stats */}
          <div className="flex-1 min-w-0 flex flex-col gap-[var(--space-2)] justify-center leading-none">
            {memberSince && (
              <span className="font-silkscreen text-[length:var(--text-mini)] text-secondary leading-none">
                Member Since {memberSince}
              </span>
            )}
            <span className="font-body font-bold text-[length:var(--text-xl)] text-primary leading-none truncate" style={{ fontVariationSettings: '"opsz" 14' }}>
              {username}
            </span>
            <span className="font-silkscreen text-[length:var(--text-mini)] text-secondary leading-none">
              {crewCount} group chat{crewCount !== 1 ? 's' : ''} · {totalMessages.toLocaleString()} msg
            </span>
          </div>
        </div>

        {/* Right column: coin badge + friendship XP badge */}
        <div className="flex-shrink-0 flex flex-col items-end" style={{ gap: 'var(--space-2)' }}>
          {/* Coin badge — Figma 178:1077: no background, number w-[26px] + coin icon 12×12 */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); onCoinTap() }}
              aria-label={`${infiniteCoins ? '∞' : coins} coins`}
              className="flex items-center justify-end"
              style={{ gap: 'var(--space-2)' }}
            >
              <span className="font-silkscreen leading-none w-[26px] pb-[2px] text-right" style={{ fontSize: 'var(--text-xs)', color: '#f59e0b' }}>
                {infiniteCoins ? '∞' : coins.toLocaleString()}
              </span>
              <TokeCircle style={{ width: 12, height: 12, color: '#f59e0b' }} aria-hidden="true" />
            </button>
            <AnimatePresence>
              {showCoinTip && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-1 z-50 whitespace-nowrap font-silkscreen text-[8px] text-primary bg-surface border border-border px-2 py-1"
                >
                  25 COINS = 1 CREW INVITE
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Friendship XP badge — Figma 116:742: no background, gradient text + heart icon 12×12 */}
          <div className="flex items-center justify-end" style={{ gap: 'var(--space-2)' }}>
            <span
              className="font-silkscreen leading-none pb-[2px]"
              style={{
                fontSize: 'var(--text-xs)',
                background: 'linear-gradient(to right, #a855f7, #d946ef)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {infiniteFriendshipXP ? '∞' : totalFriendshipXP}
            </span>
            <Heart style={{ width: 12, height: 12, color: '#d946ef' }} aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Status ticker — animated when status set, static placeholder otherwise */}
      {status
        ? <HomeStatusTicker status={status} />
        : (
          <p
            className="font-silkscreen text-[length:var(--text-mini)] text-tertiary leading-none"
          >
            &ldquo;Whats the mood today...&rdquo;
          </p>
        )
      }

      {/* AFK XP bar — dev-only feature flag: nexus_afk_exp */}
      {afkExpEnabled && (
        <div className="flex items-stretch gap-2">
          <div className="flex-1 flex flex-col gap-2 justify-center">
            <span className="font-silkscreen text-[8px] text-primary">
              AFK EXP ACCUMULATED · 100 / 100 XP
            </span>
            <div className="h-1 w-full bg-purple" />
          </div>
          <button className="bg-purple px-4 py-2 font-pixel text-[8px] text-primary whitespace-nowrap">
            CLAIM
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex" style={{ gap: 'var(--space-5)' }}>
        <button
          onClick={(e) => { e.stopPropagation(); onFriends() }}
          className="flex-1 flex items-center justify-center font-silkscreen text-[length:var(--text-xxs)] text-purple leading-none border border-purple bg-black active:opacity-70 transition-opacity"
          style={{ gap: 'var(--space-2)', padding: '12px 16px', boxShadow: '2px 2px 0px 0px rgba(168,85,247,0.5)' }}
        >
          <Notebook style={{ width: 12, height: 12, color: 'var(--color-purple)' }} aria-hidden="true" />
          friends
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onInviteSquad() }}
          className="flex-1 flex items-center justify-center font-silkscreen text-[length:var(--text-xxs)] text-primary leading-none bg-purple active:opacity-70 transition-opacity"
          style={{ gap: 'var(--space-2)', padding: '12px 16px', boxShadow: '2px 2px 0px 0px rgba(168,85,247,0.5)' }}
        >
          <Plus style={{ width: 12, height: 12, color: 'var(--color-primary)' }} aria-hidden="true" />
          Invite squad
        </button>
      </div>
    </div>
  )
}

// ─── Home action sheet (Create / Join / Invite) ───────────────────────────────

type SheetView = 'menu' | 'create' | 'join'

function HomeActionSheet({
  onClose,
  coins,
  infiniteCoins,
  onOpenArsenal,
}: {
  onClose:       () => void
  coins:         number
  infiniteCoins: boolean
  onOpenArsenal: () => void
}) {
  const [view, setView] = useState<SheetView>('menu')

  const [createState, createAction, createPending] = useActionState(createCrewAction, null)
  const [joinState,   joinAction,   joinPending]   = useActionState(joinCrewAction,   null)
  const [joinCode, setJoinCode] = useState('')

  function handleJoinCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
  }

  const sheetContent = (() => {
    if (view === 'create') {
      return (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 mb-1">
            <button onClick={() => setView('menu')} className="text-muted hover:text-primary transition-colors">
              <ChevronLeft style={{ width: 16, height: 16 }} aria-hidden="true" />
            </button>
            <h2 className="font-pixel text-[11px] text-primary">CREATE A CREW</h2>
          </div>

          {createState?.error && (
            <div className="bg-[#ff4444]/10 border border-[#ff4444]/50 px-3 py-2">
              <p className="font-pixel text-[9px] text-[#ff4444] leading-relaxed">{createState.error}</p>
            </div>
          )}

          <form action={createAction} className="flex flex-col gap-4">
            <Input
              name="crewName"
              type="text"
              label="CREW NAME"
              placeholder="The Void Slayers"
              required
              minLength={2}
              maxLength={30}
              autoComplete="off"
              autoFocus
            />
            <Button type="submit" variant="primary" loading={createPending} className="w-full">
              FORGE THE CREW
            </Button>
          </form>
        </div>
      )
    }

    if (view === 'join') {
      return (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 mb-1">
            <button onClick={() => setView('menu')} className="text-muted hover:text-primary transition-colors">
              <ChevronLeft style={{ width: 16, height: 16 }} aria-hidden="true" />
            </button>
            <h2 className="font-pixel text-[11px] text-primary">JOIN A CREW</h2>
          </div>

          {joinState?.error && (
            <div className="bg-[#ff4444]/10 border border-[#ff4444]/50 px-3 py-2">
              <p className="font-pixel text-[9px] text-[#ff4444] leading-relaxed">{joinState.error}</p>
            </div>
          )}

          <form action={joinAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-[6px]">
              <label className="font-pixel text-[9px] text-purple tracking-widest">INVITE CODE</label>
              <input
                value={joinCode}
                onChange={handleJoinCodeChange}
                placeholder="A3X9KP"
                autoComplete="off"
                autoFocus
                className="w-full bg-black border border-border px-3 py-3 text-white font-pixel text-[16px] tracking-[0.4em] text-center placeholder:text-muted placeholder:tracking-[0.2em] focus:outline-none focus:border-purple"
              />
              <input type="hidden" name="inviteCode" value={joinCode} />
              <p className="font-pixel text-[7px] text-muted">{joinCode.length}/6 characters</p>
            </div>
            <Button
              type="submit"
              variant="primary"
              loading={joinPending}
              disabled={joinCode.length !== 6}
              className="w-full"
            >
              ENTER THE WAR
            </Button>
          </form>
        </div>
      )
    }

    // Menu view
    return (
      <>
        <div className="flex flex-col gap-[var(--space-3)]">
          <p className="font-silkscreen text-[length:var(--text-mini)] text-tertiary leading-none whitespace-nowrap">SQUAD SH**!</p>
          <h2
            className="font-body font-bold text-[length:var(--text-lg)] text-primary leading-none"
            style={{ fontVariationSettings: '"opsz" 14' }}
          >
            What would you like to do?
          </h2>
        </div>

        <div className="flex flex-col gap-[var(--space-7)]">
          <Button shadow className="w-full" onClick={() => setView('create')}>
            CREATE A SQUAD
          </Button>

          <Button variant="outlined" shadow className="w-full" onClick={() => setView('join')}>
            JOIN A SQUAD
          </Button>

          <div className="flex flex-col gap-[var(--space-3)]">
            <button
              onClick={onOpenArsenal}
              className="w-full h-[48px] flex items-center justify-center bg-black border overflow-hidden"
              style={{ borderColor: '#f59e0b', boxShadow: '4px 4px 0px 0px rgba(245,158,11,0.5)' }}
            >
              <span className="font-silkscreen leading-none whitespace-nowrap" style={{ fontSize: 'var(--text-xs)', color: '#f59e0b' }}>INVITE A FRIEND</span>
            </button>
            <p className="font-silkscreen text-[length:var(--text-mini)] tracking-[0.2px] leading-none" style={{ color: '#f59e0b' }}>
              <span className="text-tertiary">Cost 25 COINS Per INVITE</span>
              {` · ${infiniteCoins ? '∞' : coins.toLocaleString()} coins available`}
            </p>
          </div>
        </div>

      </>
    )
  })()

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70" />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 80 || info.velocity.y > 400) onClose()
        }}
        className="relative w-full max-w-[480px] bg-[var(--background)] border-t border-border flex flex-col gap-[var(--space-7)] px-[16px] overflow-hidden"
        style={{ paddingTop: 12, paddingBottom: 'max(env(safe-area-inset-bottom), 28px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {sheetContent}
      </motion.div>
    </motion.div>
  )
}

// ─── Leave confirm sheet ──────────────────────────────────────────────────────

function LeaveConfirmSheet({
  summary,
  onConfirm,
  onClose,
  pending,
  leaveError,
}: {
  summary:    CrewSummary
  onConfirm:  () => void
  onClose:    () => void
  pending:    boolean
  leaveError: string | null
}) {
  const isLast = summary.memberCount <= 1

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70" />
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0,  opacity: 1 }}
        exit={{   y: 80, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        className="relative w-full max-w-[480px] bg-[var(--background)] border-t border-border flex flex-col gap-[var(--space-7)] pt-[24px] px-[16px]"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 28px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-col gap-[var(--space-2)]">
          <h2
            className="font-body font-bold text-[length:var(--text-lg)] text-primary leading-none"
            style={{ fontVariationSettings: '"opsz" 14' }}
          >
            {isLast ? `Delete ${summary.crew.name}?` : `Leave ${summary.crew.name}?`}
          </h2>
          <p
            className="font-body text-[length:var(--text-xs)] text-tertiary leading-normal"
            style={{ fontVariationSettings: '"opsz" 14' }}
          >
            {isLast
              ? 'You are the last member. This will permanently delete the crew and all its history.'
              : 'Your XP and artifact gains will be redistributed to the remaining members.'}
          </p>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-[var(--space-3)]">
          {leaveError && (
            <p className="font-silkscreen text-[length:var(--text-mini)] text-[#ef4444]">{leaveError}</p>
          )}
          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={pending}
            loading={pending}
            className="w-full"
          >
            {isLast ? 'Delete crew' : 'Leave squad'}
          </Button>
          <Button variant="outlined" onClick={onClose} disabled={pending} className="w-full">
            Never mind
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Crew card content ────────────────────────────────────────────────────────

const CREW_AVATAR_COLORS = ['#bf5fff', '#00e5ff', '#ffd700', '#ff4444', '#66bb6a', '#ff9800']

function CrewCardContent({ summary, onAvatarTap }: { summary: CrewSummary; onAvatarTap?: () => void }) {
  const { crew, lastMessage, unreadCount } = summary
  const hasUnread   = unreadCount > 0
  const xpInLevel   = crew.total_xp % XP_PER_LEVEL
  const colorIndex  = crew.name.charCodeAt(0) % CREW_AVATAR_COLORS.length
  const avatarColor = CREW_AVATAR_COLORS[colorIndex]
  const imageUrl    = crew.image_url as string | null | undefined

  return (
    <div className="w-full text-left flex items-center gap-4 pr-2">
      {/* Crew avatar — 40×40px per Figma node 50:465 */}
      <button
        className="flex-shrink-0 w-10 h-10 overflow-hidden flex items-center justify-center font-pixel text-[10px] active:opacity-70 transition-opacity"
        style={!imageUrl ? {
          background:  avatarColor + '22',
          border:      `1px solid ${avatarColor}60`,
          color:       avatarColor,
        } : undefined}
        onClick={(e) => { e.stopPropagation(); onAvatarTap?.() }}
        aria-label={`View ${crew.name} info`}
      >
        {imageUrl ? (
          <div className="relative w-full h-full pointer-events-none">
            <Image
              src={resolveAvatarUrl(imageUrl, 40)}
              alt={crew.name}
              fill
              sizes="40px"
              className="object-cover"
              unoptimized={isSupabaseStorage(imageUrl)}
            />
          </div>
        ) : (
          crew.name[0]?.toUpperCase()
        )}
      </button>

      {/* Content — leading-none on container matches Figma node 4:62 */}
      <div className="flex-1 min-w-0 flex flex-col gap-2 justify-center leading-none">
        {/* XP / level */}
        <span className="font-silkscreen text-[8px] text-tertiary whitespace-nowrap leading-none">
          {xpInLevel}/{XP_PER_LEVEL} XP · Lv. {crew.level}
          {hasUnread ? ` · +${unreadCount} new` : ''}
        </span>

        <div className="flex flex-col gap-1">
          {/* Crew name + timestamp */}
          <div className="flex items-center gap-2 w-full">
            <span
              className="font-body font-bold text-[16px] leading-none text-white truncate flex-1 min-w-0"
              style={{ fontVariationSettings: '"opsz" 14' }}
            >
              {crew.name}
            </span>
            {lastMessage && (
              <span
                className="font-body font-light text-[12px] leading-none text-muted flex-shrink-0 whitespace-nowrap"
                style={{ fontVariationSettings: '"opsz" 14' }}
              >
                {relativeTime(lastMessage.created_at)}
              </span>
            )}
          </div>

          {/* Last message preview */}
          <p
            className="font-body font-normal text-[14px] leading-none truncate w-full"
            style={{
              color: hasUnread ? 'var(--color-primary)' : 'var(--color-muted)',
              fontVariationSettings: '"opsz" 14',
            }}
          >
            {lastMessage
              ? lastMessage.sender
                ? `${lastMessage.sender}: ${truncate(lastMessage.content, 40)}`
                : truncate(lastMessage.content, 44)
              : 'Group journey just started… send a message'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Friend card ─────────────────────────────────────────────────────────────

function FriendCard({ friend, onTap, onAvatarTap }: { friend: FriendSummary; onTap: () => void; onAvatarTap: () => void }) {
  const colorIndex  = friend.username.charCodeAt(0) % CREW_AVATAR_COLORS.length
  const avatarColor = CREW_AVATAR_COLORS[colorIndex]
  const preview     = friend.lastDMMessage?.content ?? 'Send a message'

  return (
    <motion.div
      className="w-full flex items-center gap-4 cursor-pointer"
      onClick={onTap}
      whileTap={{ scale: 0.98 }}
    >
      {/* Avatar — 40×40px per Figma node 50:483 */}
      <button
        className="flex-shrink-0 w-10 h-10 flex items-center justify-center font-pixel text-[10px] overflow-hidden active:opacity-70 transition-opacity"
        style={{ background: avatarColor + '22', border: `1px solid ${avatarColor}60`, color: avatarColor }}
        onClick={(e) => { e.stopPropagation(); onAvatarTap() }}
        aria-label={`View ${friend.username}'s profile`}
      >
        {friend.avatarUrl ? (
          <Image src={resolveAvatarUrl(friend.avatarUrl, 40)} alt={friend.username} width={40} height={40} className="object-cover w-full h-full pointer-events-none" unoptimized={isSupabaseStorage(friend.avatarUrl)} />
        ) : (
          friend.username[0]?.toUpperCase()
        )}
      </button>

      {/* Content — matches Figma node 50:484/485: name+timestamp row then preview */}
      <div className="flex-1 min-w-0 flex flex-col gap-1 justify-center leading-none">
        {/* Name + timestamp on same row */}
        <div className="flex items-center gap-2 w-full">
          <span
            className="font-body font-bold text-[16px] leading-none text-white truncate flex-1 min-w-0"
            style={{ fontVariationSettings: '"opsz" 14' }}
          >
            {friend.username}
          </span>
          {friend.lastDMMessage && (
            <span
              className="font-body font-light text-[12px] leading-none text-muted flex-shrink-0 whitespace-nowrap"
              style={{ fontVariationSettings: '"opsz" 14' }}
            >
              {relativeTime(friend.lastDMMessage.created_at)}
            </span>
          )}
        </div>

        {/* Message preview */}
        <p
          className="font-body font-normal text-[14px] leading-none truncate w-full text-muted"
          style={{ fontVariationSettings: '"opsz" 14' }}
        >
          {truncate(preview, 44)}
        </p>
      </div>
    </motion.div>
  )
}

// ─── Swipeable crew card ──────────────────────────────────────────────────────

const LEAVE_REVEAL = 104

function SwipeableCrewCard({
  summary,
  onTap,
  onLeaveRequest,
  openCardId,
  onOpen,
}: {
  summary:        CrewSummary
  onTap:          () => void
  onLeaveRequest: () => void
  openCardId:     string | null
  onOpen:         (id: string) => void
}) {
  const x           = useMotionValue(0)
  const [open, setOpen] = useState(false)
  const wasDragging = useRef(false)

  useEffect(() => {
    if (openCardId !== summary.crew.id) {
      animate(x, 0, { type: 'spring', stiffness: 300, damping: 28 })
      setOpen(false)
    }
  }, [openCardId]) // eslint-disable-line react-hooks/exhaustive-deps

  function snapTo(target: number, isOpen: boolean) {
    animate(x, target, { type: 'spring', stiffness: 300, damping: 28 })
    setOpen(isOpen)
  }

  function handleDragEnd(_: unknown, info: PanInfo) {
    setTimeout(() => { wasDragging.current = false }, 50)
    if (info.offset.x < -(LEAVE_REVEAL / 2)) {
      snapTo(-LEAVE_REVEAL, true)
    } else {
      snapTo(0, false)
    }
  }

  function handleClick() {
    if (wasDragging.current) return
    if (open) {
      snapTo(0, false)
    } else {
      onTap()
    }
  }

  return (
    <div className="overflow-hidden">
      <motion.div
        className="flex"
        drag="x"
        dragConstraints={{ left: -LEAVE_REVEAL, right: 0 }}
        dragElastic={{ left: 0.05, right: 0.1 }}
        style={{ x, width: `calc(100% + ${LEAVE_REVEAL}px)` }}
        onDragStart={() => { wasDragging.current = true; onOpen(summary.crew.id) }}
        onDragEnd={handleDragEnd}
      >
        <motion.div
          className="flex-1 min-w-0 bg-black cursor-pointer"
          onClick={handleClick}
          whileTap={{ scale: open ? 1 : 0.98 }}
        >
          <CrewCardContent summary={summary} onAvatarTap={onTap} />
        </motion.div>

        <button
          className="flex-shrink-0 self-stretch flex flex-row items-center justify-center gap-[4px] bg-[#ef4444] px-[12px] py-[8px] overflow-hidden"
          style={{ width: LEAVE_REVEAL }}
          onClick={(e) => { e.stopPropagation(); snapTo(0, false); onLeaveRequest() }}
          tabIndex={open ? 0 : -1}
          aria-label={`Leave ${summary.crew.name}`}
        >
          <Logout style={{ width: 16, height: 16, color: 'white' }} aria-hidden="true" />
          <span className="font-silkscreen text-[12px] text-white whitespace-nowrap leading-none">LEAVE</span>
        </button>
      </motion.div>
    </div>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-8 text-center py-12">
      <h2 className="font-pixel text-[10px] text-primary mb-2">NO CREWS YET</h2>
      <p className="font-pixel text-[8px] text-muted leading-relaxed mb-8">
        Assemble your war party<br />and start fighting.
      </p>
      <button
        onClick={onCreate}
        className="w-full max-w-[280px] h-12 font-pixel text-[10px] text-black bg-purple active:opacity-80 transition-opacity mb-3"
      >
        ⚔ CREATE CREW
      </button>
      <a
        href="/onboarding/join"
        className="w-full max-w-[280px] flex items-center justify-center h-12 font-pixel text-[10px] text-purple border border-purple/50 hover:border-purple transition-colors"
      >
        🔗 JOIN WITH CODE
      </a>
    </div>
  )
}

// ─── HomeClient ───────────────────────────────────────────────────────────────

export function HomeClient({
  initialCrews,
  userId,
  username,
  avatarUrl,
  memberSince,
  profileCache,
  totalMessages,
  status,
  friends,
  initialCoins,
  announcements,
  totalFriendshipXP,
}: HomeClientProps) {
  const router = useRouter()

  const [crews,             setCrews]             = useState<CrewSummary[]>(initialCrews)
  const [showCreate,        setShowCreate]        = useState(false)
  const [showInviteArsenal, setShowInviteArsenal] = useState(false)
  const [openCardId,        setOpenCardId]        = useState<string | null>(null)
  const [leaveTarget,       setLeaveTarget]       = useState<CrewSummary | null>(null)
  const [leaving,           setLeaving]           = useState(false)
  const [leaveError,        setLeaveError]        = useState<string | null>(null)
  const [coins,             setCoins]             = useState(() => {
    const store = useChatStore.getState()
    const base = Math.max(initialCoins, store.userCoins)
    // Seed the store with the absolute balance so addUserCoins in chat accumulates correctly
    if (store.userCoins < base) store.setUserCoins(base)
    return base
  })
  const [localFriendshipXP,    setLocalFriendshipXP]    = useState(totalFriendshipXP)
  const [showCoinTip,          setShowCoinTip]          = useState(false)
  const [infiniteCoins,        setInfiniteCoins]        = useState(false)
  const [infiniteFriendshipXP, setInfiniteFriendshipXP] = useState(false)
  const [afkExpEnabled,        setAfkExpEnabled]        = useState(false)

  const profileCacheRef = useRef<Record<string, string>>(profileCache)
  useEffect(() => { profileCacheRef.current = profileCache }, [profileCache])

  // Sync infinite coins flag from localStorage + listen for dev-section toggle
  useEffect(() => {
    setInfiniteCoins(localStorage.getItem('nexus_infinite_coins') === '1')
    function onFlagChange(e: Event) {
      setInfiniteCoins((e as CustomEvent<{ on: boolean }>).detail.on)
    }
    window.addEventListener('nexus-infinite-coins-change', onFlagChange)
    return () => window.removeEventListener('nexus-infinite-coins-change', onFlagChange)
  }, [])

  // Sync infinite friendship XP flag from localStorage + listen for dev-section toggle
  useEffect(() => {
    setInfiniteFriendshipXP(localStorage.getItem('nexus_infinite_fxp') === '1')
    function onFlagChange(e: Event) {
      setInfiniteFriendshipXP((e as CustomEvent<{ on: boolean }>).detail.on)
    }
    window.addEventListener('nexus-infinite-fxp-change', onFlagChange)
    return () => window.removeEventListener('nexus-infinite-fxp-change', onFlagChange)
  }, [])

  // Sync AFK XP feature flag from localStorage + listen for dev-section toggle
  useEffect(() => {
    setAfkExpEnabled(localStorage.getItem('nexus_afk_exp') === '1')
    function onFlagChange(e: Event) {
      setAfkExpEnabled((e as CustomEvent<{ on: boolean }>).detail.on)
    }
    window.addEventListener('nexus-afk-exp-change', onFlagChange)
    return () => window.removeEventListener('nexus-afk-exp-change', onFlagChange)
  }, [])

  useEffect(() => { setCrews(initialCrews) }, [initialCrews])

  useEffect(() => {
    router.refresh()
    // Clear any stale _skipNextSlideEnter flag from a previous back-navigation.
    // Pages that use router.back() to return here (friends, vault, DM) set the
    // flag but home has no SlidePage to consume it, so it must be cleared here
    // to prevent the next forward-navigation's slide-in from being suppressed.
    clearSkipNextSlideEnter()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: live coin balance updates from profiles table
  useEffect(() => {
    const supabase = createClient()
    const ch = supabase
      .channel(`home-profile-coins:${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload) => {
          const newCoins = (payload.new as { coins?: number }).coins
          if (typeof newCoins === 'number') {
            setCoins(newCoins)
            useChatStore.getState().setUserCoins(newCoins)
          }
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId])

  // Realtime: live friendship XP total — re-fetch sum on any insert/update to friendship_xp
  useEffect(() => {
    const supabase = createClient()
    async function refetchFriendshipXP() {
      const { data } = await supabase
        .from('friendship_xp')
        .select('total_xp')
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      const total = (data ?? []).reduce((sum, r) => sum + ((r as { total_xp: number }).total_xp ?? 0), 0)
      setLocalFriendshipXP(total)
    }
    const chA = supabase
      .channel(`home-fxp-a:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendship_xp', filter: `user_a=eq.${userId}` }, refetchFriendshipXP)
      .subscribe()
    const chB = supabase
      .channel(`home-fxp-b:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendship_xp', filter: `user_b=eq.${userId}` }, refetchFriendshipXP)
      .subscribe()
    return () => { supabase.removeChannel(chA); supabase.removeChannel(chB) }
  }, [userId])

  const crewIds = crews.map((c) => c.crew.id)

  // ── Realtime: live message previews + unread counts ──────────────────────
  useEffect(() => {
    if (crewIds.length === 0) return
    const supabase = createClient()
    const seenIds  = new Set<string>()

    function applyNewMessage(
      crewId: string,
      msg: { id: string; content: string; user_id: string; created_at: string; sender: string },
    ) {
      if (seenIds.has(msg.id)) return
      seenIds.add(msg.id)

      setCrews((prev) =>
        prev
          .map((cs) => {
            if (cs.crew.id !== crewId) return cs
            return {
              ...cs,
              lastMessage: { content: msg.content, sender: msg.sender, created_at: msg.created_at },
              unreadCount: msg.user_id === userId ? cs.unreadCount : cs.unreadCount + 1,
            }
          })
          .sort((a, b) =>
            (b.lastMessage?.created_at ?? '').localeCompare(a.lastMessage?.created_at ?? ''),
          ),
      )
    }

    const channels = crewIds.map((crewId) =>
      supabase
        .channel(`messages:${crewId}`)
        .on('broadcast', { event: 'new_message' }, (payload) => {
          const msg = payload.payload as MessageWithProfile
          if (!msg?.id || msg.message_type === 'system') return
          applyNewMessage(crewId, {
            id:         msg.id,
            content:    msg.content,
            user_id:    msg.user_id,
            created_at: msg.created_at,
            sender:     profileCacheRef.current[msg.user_id] ?? msg.profile?.username ?? '',
          })
        })
        .subscribe(),
    )

    return () => { channels.forEach((ch) => supabase.removeChannel(ch)) }
  }, [[...crewIds].sort().join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation: mark as read on tap ──────────────────────────────────────
  const handleCrewTap = useCallback(
    (crewId: string) => {
      setCrews((prev) => prev.map((cs) => cs.crew.id === crewId ? { ...cs, unreadCount: 0 } : cs))
      const supabase = createClient()
      supabase
        .from('crew_members')
        .update({ last_seen: new Date().toISOString() })
        .eq('crew_id', crewId)
        .eq('user_id', userId)
        .then(() => {})
      sessionStorage.setItem('nexus_chat_from', '/home')
      router.push(`/chat/${crewId}`)
    },
    [userId, router],
  )

  // ── Leave crew ────────────────────────────────────────────────────────────
  const handleLeaveCrew = useCallback(async () => {
    if (!leaveTarget || leaving) return
    setLeaving(true)
    setLeaveError(null)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const result = await leaveCrewAction(leaveTarget.crew.id, session?.access_token ?? '')
      if (result.error) { setLeaveError(result.error); return }
      setCrews((prev) => prev.filter((c) => c.crew.id !== leaveTarget.crew.id))
      setLeaveTarget(null)
    } catch (err) {
      setLeaveError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLeaving(false)
    }
  }, [leaveTarget, leaving])

  const handleCoinsDeducted    = useCallback(() => setCoins(c => {
    const next = c - 25
    useChatStore.getState().setUserCoins(next)
    return next
  }), [])
  const handleCloseCreate      = useCallback(() => setShowCreate(false), [])
  const handleCloseArsenal     = useCallback(() => setShowInviteArsenal(false), [])
  const handleOpenArsenal      = useCallback(() => {
    setShowCreate(false)
    setShowInviteArsenal(true)
  }, [])
  const handleCloseLeave  = useCallback(() => {
    if (!leaving) { setLeaveTarget(null); setLeaveError(null) }
  }, [leaving])

  return (
    <div className="h-screen bg-black flex flex-col overflow-hidden">

      {/* ── Static header: account card + announcements ── */}
      <div
        className="flex-shrink-0 px-4 flex flex-col gap-6"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)', marginTop: 'var(--space-5)' }}
      >
        <AccountPreviewContainer
          username={username}
          avatarUrl={avatarUrl}
          memberSince={memberSince}
          crewCount={crews.length}
          totalMessages={totalMessages}
          status={status}
          onEditProfile={() => router.push('/profile')}
          afkExpEnabled={afkExpEnabled}
          coins={coins}
          infiniteCoins={infiniteCoins}
          showCoinTip={showCoinTip}
          onCoinTap={() => {
            setShowCoinTip(true)
            setTimeout(() => setShowCoinTip(false), 2000)
          }}
          onFriends={() => router.push('/friends')}
          onInviteSquad={() => setShowCreate(true)}
          totalFriendshipXP={localFriendshipXP}
          infiniteFriendshipXP={infiniteFriendshipXP}
        />
        <AnnouncementBanner announcements={announcements} />
      </div>

      {/* ── Scrollable list: squads + DMs ── */}
      <div
        className="flex-1 overflow-y-auto min-h-0 px-4 flex flex-col gap-6"
        style={{
          paddingTop:    'var(--space-5)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 24px)',
        }}
      >

        {/* Squads section */}
        <div className="flex flex-col gap-4 w-full">
          <p className="font-body font-medium text-[14px] text-primary tracking-[0.2px] leading-normal">Squads</p>
          {crews.length === 0 ? (
            <EmptyState onCreate={() => setShowCreate(true)} />
          ) : (
            crews.map((summary) => (
              <motion.div
                key={summary.crew.id}
                layout
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              >
                <SwipeableCrewCard
                  summary={summary}
                  onTap={() => handleCrewTap(summary.crew.id)}
                  onLeaveRequest={() => { setLeaveTarget(summary); setLeaveError(null) }}
                  openCardId={openCardId}
                  onOpen={setOpenCardId}
                />
              </motion.div>
            ))
          )}
        </div>

        {/* Direct Messages section */}
        {friends.length > 0 && (
          <div className="flex flex-col gap-4 w-full">
            <p className="font-body font-medium text-[14px] text-primary tracking-[0.2px] leading-normal">Direct Messages</p>
            {friends.map((friend) => (
              <FriendCard
                key={friend.id}
                friend={friend}
                onTap={() => router.push(`/dm/${friend.id}`)}
                onAvatarTap={() => {
                  if (friend.dmChannelId) {
                    router.push(`/chat/${friend.dmChannelId}/member/${friend.id}`)
                  } else {
                    router.push(`/dm/${friend.id}`)
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showCreate && (
          <HomeActionSheet
            key="action-sheet"
            onClose={handleCloseCreate}
            coins={coins}
            infiniteCoins={infiniteCoins}
            onOpenArsenal={handleOpenArsenal}
          />
        )}
        {leaveTarget && (
          <LeaveConfirmSheet
            key="leave-sheet"
            summary={leaveTarget}
            onConfirm={handleLeaveCrew}
            onClose={handleCloseLeave}
            pending={leaving}
            leaveError={leaveError}
          />
        )}
        {showInviteArsenal && (
          <InviteArsenal
            key="invite-arsenal"
            userId={userId}
            coins={coins}
            infiniteCoins={infiniteCoins}
            onClose={handleCloseArsenal}
            onCoinsDeducted={handleCoinsDeducted}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
