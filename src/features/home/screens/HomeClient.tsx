'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion'
import type { PanInfo } from 'framer-motion'
import { ChevronRight } from 'pixelarticons/react/ChevronRight'
import { TokeCircle } from 'pixelarticons/react/TokeCircle'
import { Heart } from 'pixelarticons/react/Heart'
import { Copy } from 'pixelarticons/react/Copy'
import { Message as MessageIcon } from 'pixelarticons/react/Message'
import { TickerBanner } from '@/shared/components/banners/TickerBanner'
import { MailRight } from 'pixelarticons/react/MailRight'
import Image from 'next/image'
import { isSupabaseStorage, resolveAvatarUrl } from '@/shared/components/ui/Avatar'
import { createClient } from '@/shared/supabase/client'
import { createCrewAction } from '@/app/(app)/onboarding/create/actions'
import { joinCrewAction }   from '@/app/(app)/onboarding/join/actions'
import { leaveCrewAction } from '@/app/(app)/home/actions'
import { Button } from '@/shared/components/ui/Button'
import type { CrewSummary } from '@/app/(app)/home/page'
import type { Message, MessageWithProfile } from '@/types'
import { useChatStore } from '@/store/chatStore'
import { clearSkipNextSlideEnter } from '@/app/layouts/SlidePage'
import { AnnouncementBanner } from '@/shared/components/banners/AnnouncementBanner'
import type { AnnouncementItem } from '@/shared/components/banners/AnnouncementBanner'
import { DiamondGem } from 'pixelarticons/react/DiamondGem'
import { isGemGateOpen } from '@/shared/utils/gems'
import { GEM_DAILY_LIMIT } from '@/shared/constants/config'
import { consumeHomeLastMessage } from '@/features/home/utils/homePreviewCache'

export interface FriendSummary {
  id:            string
  username:      string
  avatarUrl:     string | null
  dmChannelId:   string | null
  lastDMMessage: { content: string; created_at: string } | null
  unreadCount:   number
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
  initialGemBalance:  number
  announcements:      AnnouncementItem[]
  totalFriendshipXP:  number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Account preview ─────────────────────────────────────────────────────────

function AccountPreview({
  username,
  avatarUrl,
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
  fxpEnabled,
  totalFriendshipXP,
  showHeartTip,
  onHeartTap,
  gemBalance,
  claimedGemToday,
  showGemTip,
  onGemTap,
}: {
  username:          string
  avatarUrl:         string | null
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
  fxpEnabled:           boolean
  totalFriendshipXP:    number
  showHeartTip:         boolean
  onHeartTap:           () => void
  gemBalance:           number
  claimedGemToday:      boolean
  showGemTip:           boolean
  onGemTap:             () => void
}) {
  return (
    <div
      className="bg-[#111] border border-border rounded-[8px] overflow-hidden flex flex-col gap-4 cursor-pointer active:opacity-80 transition-opacity"
      style={{ paddingTop: 16 }}
      onClick={onEditProfile}
      role="button"
      aria-label="Edit profile"
    >
      {/* Details row */}
      <div className="flex items-center gap-4 px-4">
        {/* Avatar 48×48 */}
        <div className="w-12 h-12 flex-shrink-0 overflow-hidden relative bg-primary rounded-full">
          {avatarUrl ? (
            <Image src={resolveAvatarUrl(avatarUrl, 48)} alt={username} fill sizes="48px" className="object-cover" priority unoptimized={isSupabaseStorage(avatarUrl)} />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-pixel text-[10px] text-black">
              {username[0]?.toUpperCase() ?? '?'}
            </div>
          )}
        </div>

        {/* Name + stats + currency */}
        <div className="flex-1 min-w-0 flex flex-col gap-[var(--space-2)] justify-center">
          <span className="font-silkscreen text-[length:var(--text-mini)] text-tertiary leading-none">
            Lifetime msg: {totalMessages.toLocaleString()}
          </span>
          <span className="font-body font-bold text-[length:var(--text-xl)] text-primary leading-none truncate" style={{ fontVariationSettings: '"opsz" 14' }}>
            {username}
          </span>

          {/* Currency pills */}
          <div className="flex items-center gap-[var(--space-3)]">
            {/* Gems (purple gradient) */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); onGemTap() }}
                aria-label={`${gemBalance} gems`}
                className="flex items-center gap-[var(--space-2)]"
              >
                <DiamondGem style={{ width: 12, height: 12, color: 'var(--color-purple)' }} aria-hidden="true" />
                <span
                  className="font-silkscreen leading-none"
                  style={{
                    fontSize: 'var(--text-xxs)',
                    background: 'linear-gradient(to right, var(--color-purple), #d946ef)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {gemBalance}
                </span>
              </button>
              <AnimatePresence>
                {showGemTip && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 top-full mt-1 z-50 whitespace-nowrap font-silkscreen text-[8px] text-primary bg-surface border border-border px-2 py-1"
                  >
                    {claimedGemToday ? `${GEM_DAILY_LIMIT}/${GEM_DAILY_LIMIT} DAILY GEMS` : `0/${GEM_DAILY_LIMIT} DAILY GEMS`}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Separator */}
            <div className="w-[2px] h-[2px] bg-border-hover flex-shrink-0" aria-hidden="true" />

            {/* Coins */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); onCoinTap() }}
                aria-label={`${infiniteCoins ? '∞' : coins} coins`}
                className="flex items-center gap-[var(--space-2)]"
              >
                <TokeCircle style={{ width: 12, height: 12, color: 'var(--color-coins)' }} aria-hidden="true" />
                <span className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-xxs)', color: 'var(--color-coins)' }}>
                  {infiniteCoins ? '∞' : coins.toLocaleString()}
                </span>
              </button>
              <AnimatePresence>
                {showCoinTip && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 top-full mt-1 z-50 whitespace-nowrap font-silkscreen text-[8px] text-primary bg-surface border border-border px-2 py-1"
                  >
                    25 COINS = 1 CREW INVITE
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Friendship XP — dev-gated: nexus_friendship_xp */}
            {fxpEnabled && (
              <>
                <div className="w-[2px] h-[2px] bg-border-hover flex-shrink-0" aria-hidden="true" />
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); onHeartTap() }}
                    aria-label={`${totalFriendshipXP} friendship points`}
                    className="flex items-center gap-[var(--space-2)]"
                  >
                    <Heart style={{ width: 12, height: 12, color: 'var(--color-purple)' }} aria-hidden="true" />
                    <span
                      className="font-silkscreen leading-none"
                      style={{
                        fontSize: 'var(--text-xxs)',
                        background: 'linear-gradient(to right, var(--color-purple), #d946ef)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                      }}
                    >
                      {totalFriendshipXP}
                    </span>
                  </button>
                  <AnimatePresence>
                    {showHeartTip && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 top-full mt-1 z-50 whitespace-nowrap font-silkscreen text-[8px] text-primary bg-surface border border-border px-2 py-1"
                      >
                        EARN FRIENDSHIP POINTS, SPEND ON COSMETICS SOON
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Chevron — indicates card is tappable */}
        <ChevronRight style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
      </div>

      {/* AFK XP bar — dev-only feature flag: nexus_afk_exp */}
      {afkExpEnabled && (
        <div className="flex items-stretch gap-2 px-4">
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

      {/* Invite Squad — full-width purple button */}
      <div className="px-4">
        <button
          onClick={(e) => { e.stopPropagation(); onInviteSquad() }}
          className="w-full flex items-center justify-center gap-2 bg-purple font-silkscreen text-[length:var(--text-xxs)] text-primary leading-none overflow-hidden active:opacity-70 transition-opacity"
          style={{ padding: '12px 16px', boxShadow: '4px 4px 0px 0px rgba(168,85,247,0.5)' }}
        >
          <Copy style={{ width: 12, height: 12, color: 'var(--color-primary)' }} aria-hidden="true" />
          Invite squad
        </button>
      </div>

      {/* Status ticker — full-width, flush at card bottom */}
      <TickerBanner
        text={status ?? 'Whats the mood today...'}
        icon={<MessageIcon style={{ width: 8, height: 8, color: 'var(--color-secondary)' }} aria-hidden="true" />}
        quoted
      />
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
        <>
          <p
            className="font-body font-bold text-primary leading-none"
            style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}
          >
            Create a Squad
          </p>

          {createState?.error && (
            <div className="border px-3 py-2" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.5)' }}>
              <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--red)' }}>{createState.error}</p>
            </div>
          )}

          <form action={createAction} className="flex flex-col" style={{ gap: 'var(--space-7)' }}>
            <div className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
              <p
                className="font-body leading-none tracking-[0.2px]"
                style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14', fontWeight: 500 }}
              >
                <span className="text-primary">Squad Name </span>
                <span style={{ color: 'var(--red)' }}>*</span>
              </p>
              <input
                name="crewName"
                type="text"
                placeholder="BFF Hangout, Family, etc..."
                required
                minLength={2}
                maxLength={30}
                autoComplete="off"
                autoFocus
                className="w-full bg-[var(--background)] font-body font-normal text-primary placeholder:text-muted focus:outline-none"
                style={{ border: '1px solid #3f3f46', padding: 12, fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
              />
            </div>
            <div className="flex flex-col" style={{ gap: 'var(--space-5)' }}>
              <Button type="submit" shadow loading={createPending} className="w-full">
                CREATE SQUAD
              </Button>
              <Button
                type="button"
                variant="outlined"
                color="red"
                shadow
                className="w-full h-[48px]"
                onClick={() => setView('menu')}
              >
                CANCEL CREATION
              </Button>
            </div>
          </form>
        </>
      )
    }

    if (view === 'join') {
      return (
        <>
          <p
            className="font-body font-bold text-primary leading-none"
            style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}
          >
            Join a Squad
          </p>

          {joinState?.error && (
            <div className="border px-3 py-2" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.5)' }}>
              <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--red)' }}>{joinState.error}</p>
            </div>
          )}

          <form action={joinAction} className="flex flex-col" style={{ gap: 'var(--space-7)' }}>
            <div className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
              <p
                className="font-body leading-none tracking-[0.2px]"
                style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14', fontWeight: 500 }}
              >
                <span className="text-primary">Enter Invite Code </span>
                <span style={{ color: 'var(--red)' }}>*</span>
              </p>
              <input
                value={joinCode}
                onChange={handleJoinCodeChange}
                placeholder="A3X9KP"
                autoComplete="off"
                autoFocus
                className="w-full bg-[var(--background)] font-silkscreen text-primary placeholder:text-muted focus:outline-none text-center uppercase tracking-[0.4em] placeholder:tracking-[0.2em]"
                style={{ border: '1px solid var(--color-purple)', padding: 12, fontSize: 'var(--text-xxl)' }}
              />
              <input type="hidden" name="inviteCode" value={joinCode} />
            </div>
            <div className="flex flex-col" style={{ gap: 'var(--space-5)' }}>
              <Button
                type="submit"
                shadow
                loading={joinPending}
                disabled={joinCode.length !== 6}
                className="w-full"
              >
                JOIN THE SQUAD
              </Button>
              <Button
                type="button"
                variant="outlined"
                color="red"
                shadow
                className="w-full h-[48px]"
                onClick={() => setView('menu')}
              >
                NEVER MIND...
              </Button>
            </div>
          </form>
        </>
      )
    }

    // Menu view
    return (
      <>
        <div className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
          <p className="font-silkscreen leading-none whitespace-nowrap" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>SQUAD SH**!</p>
          <h2
            className="font-body font-bold text-primary leading-none"
            style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}
          >
            What would you like to do?
          </h2>
        </div>

        <div className="flex flex-col" style={{ gap: 'var(--space-5)' }}>
          <Button shadow className="w-full" onClick={() => setView('create')}>
            CREATE A SQUAD
          </Button>

          <Button variant="outlined" shadow className="w-full" onClick={() => setView('join')}>
            JOIN A SQUAD
          </Button>

          <div className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
            <button
              onClick={onOpenArsenal}
              className="w-full h-[48px] flex items-center justify-center bg-black border overflow-hidden"
              style={{ borderColor: 'var(--color-yellow)', boxShadow: '4px 4px 0px 0px rgba(245,158,11,0.5)' }}
            >
              <span className="font-silkscreen leading-none whitespace-nowrap" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-yellow)' }}>INVITE A FRIEND</span>
            </button>
            <p className="font-silkscreen leading-none tracking-[0.2px]" style={{ fontSize: 'var(--text-xxs)' }}>
              <span style={{ color: 'var(--color-tertiary)' }}>25 coins = invite code · </span>
              <span style={{ color: 'var(--color-yellow)' }}>{infiniteCoins ? '∞' : coins.toLocaleString()} coins</span>
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
        style={{ paddingTop: 'var(--space-5)', paddingBottom: 'max(env(safe-area-inset-bottom), var(--space-8))' }}
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
        <div className="flex flex-col" style={{ gap: 'var(--space-2)' }}>
          <h2
            className="font-body font-bold text-primary leading-none"
            style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}
          >
            {isLast ? `Delete ${summary.crew.name}?` : `Leave ${summary.crew.name}?`}
          </h2>
          <p
            className="font-body leading-normal"
            style={{ fontSize: 'var(--text-xs)', color: 'var(--color-tertiary)', fontVariationSettings: '"opsz" 14' }}
          >
            {isLast
              ? 'You are the last member. This will permanently delete the crew and all its history.'
              : 'Your XP and artifact gains will be redistributed to the remaining members.'}
          </p>
        </div>

        {/* Buttons */}
        <div className="flex flex-col" style={{ gap: 'var(--space-5)' }}>
          {leaveError && (
            <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-red)' }}>{leaveError}</p>
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

function SquadCardPreview({ summary }: { summary: CrewSummary }) {
  const { crew, lastMessage, unreadCount } = summary
  const hasUnread = unreadCount > 0
  const imageUrl  = crew.image_url as string | null | undefined
  const state     = !lastMessage ? 'default' : hasUnread ? 'unread' : 'active'

  return (
    <div className="w-full flex items-center gap-4 h-12">
      {/* Group photo — white 48×48 box */}
      <div className="flex-shrink-0 w-12 h-12 overflow-hidden bg-primary flex items-center justify-center font-pixel text-[10px] text-black">
        {imageUrl ? (
          <div className="relative w-full h-full">
            <Image
              src={resolveAvatarUrl(imageUrl, 48)}
              alt={crew.name}
              fill
              sizes="48px"
              className="object-cover"
              unoptimized={isSupabaseStorage(imageUrl)}
            />
          </div>
        ) : (
          crew.name[0]?.toUpperCase()
        )}
      </div>

      {/* Group details — 3-row column */}
      <div className="flex-1 min-w-0 flex flex-col gap-[var(--space-2)] h-full justify-center">
        {/* Row 1: level · total msg [· unread count (unread only)] */}
        <div className="flex items-center gap-2 w-full">
          <span className="font-silkscreen text-[length:var(--text-mini)] text-tertiary leading-none whitespace-nowrap">
            lv. {crew.level}
          </span>
          <div className="w-[2px] h-[2px] bg-border flex-shrink-0" />
          <span className="font-silkscreen text-[length:var(--text-mini)] text-tertiary leading-none whitespace-nowrap">
            Total MSG. {crew.total_xp.toLocaleString()}
          </span>
          {hasUnread && (
            <>
              <div className="w-[2px] h-[2px] bg-border flex-shrink-0" />
              <span
                className="font-silkscreen text-[length:var(--text-mini)] leading-none flex-1 min-w-0 truncate"
                style={{ color: 'var(--green)' }}
              >
                +{unreadCount} unread msg
              </span>
            </>
          )}
        </div>

        {/* Row 2: crew name + timestamp */}
        <div className="flex items-center gap-2 w-full leading-none">
          <span
            className="font-body font-bold text-[length:var(--text-md)] text-primary leading-none flex-1 min-w-0 truncate"
            style={{ fontVariationSettings: '"opsz" 14' }}
          >
            {crew.name}
          </span>
          {lastMessage && (
            <span
              className="font-body font-light text-[length:var(--text-xs)] text-muted leading-none flex-shrink-0 whitespace-nowrap"
              style={{ fontVariationSettings: '"opsz" 14' }}
            >
              {relativeTime(lastMessage.created_at)}
            </span>
          )}
        </div>

        {/* Row 3: last message preview */}
        <p
          className={`font-body leading-none truncate w-full text-[length:var(--text-sm)] ${
            state === 'unread' ? 'font-medium text-primary'   :
            state === 'active' ? 'font-normal text-secondary' :
                                 'font-normal text-muted'
          }`}
          style={{ fontVariationSettings: '"opsz" 14' }}
        >
          {lastMessage ? truncate(lastMessage.content, 44) : "Your party's journey begins here."}
        </p>
      </div>
    </div>
  )
}

// ─── DM notification preview card ────────────────────────────────────────────

function DmNotificationPreviewCard({ dmUnread, onTap }: { dmUnread: number; onTap: () => void }) {
  if (dmUnread === 0) return null
  return (
    <button
      className="w-full bg-surface border border-border rounded-[8px] p-[var(--space-5)] flex items-center gap-[var(--space-4)] text-left active:opacity-80 transition-opacity"
      onClick={onTap}
      aria-label="Open Direct Messages"
    >
      <MailRight style={{ width: 16, height: 16, color: 'var(--color-primary)' }} aria-hidden="true" />
      <div className="flex-1 min-w-0 flex flex-col">
        <span
          className="font-body font-medium text-[length:var(--text-sm)] text-primary leading-normal tracking-[0.2px]"
          style={{ fontVariationSettings: '"opsz" 14' }}
        >
          Direct Messages
        </span>
        <span
          className="font-body font-normal text-[length:var(--text-xxs)] text-tertiary leading-normal"
          style={{ fontVariationSettings: '"opsz" 14' }}
        >
          {dmUnread} unread message{dmUnread !== 1 ? 's' : ''}
        </span>
      </div>
      <ChevronRight style={{ width: 16, height: 16, color: 'var(--color-primary)' }} aria-hidden="true" />
    </button>
  )
}

// ─── Swipeable crew card ──────────────────────────────────────────────────────

const LEAVE_BTN_WIDTH = 40
const LEAVE_GAP       = 16  // var(--x5) gap between card and button (Figma 189-2385)
const LEAVE_REVEAL    = LEAVE_BTN_WIDTH + LEAVE_GAP

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
        className="flex items-center"
        drag="x"
        dragConstraints={{ left: -LEAVE_REVEAL, right: 0 }}
        dragElastic={{ left: 0.05, right: 0.1 }}
        style={{ x, width: `calc(100% + ${LEAVE_REVEAL}px)`, gap: LEAVE_GAP }}
        onDragStart={() => { wasDragging.current = true; onOpen(summary.crew.id) }}
        onDragEnd={handleDragEnd}
      >
        <motion.div
          className="flex-1 min-w-0 bg-black cursor-pointer"
          onClick={handleClick}
          whileTap={{ scale: open ? 1 : 0.98 }}
        >
          <SquadCardPreview summary={summary} />
        </motion.div>

        <button
          className="flex-shrink-0 flex items-center justify-center bg-[var(--red)] p-[12px] overflow-hidden rounded-[8px]"
          style={{ width: LEAVE_BTN_WIDTH }}
          onClick={(e) => { e.stopPropagation(); snapTo(0, false); onLeaveRequest() }}
          tabIndex={open ? 0 : -1}
          aria-label={`Leave ${summary.crew.name}`}
        >
          <img
            src="/icons/leave-pixel.svg"
            alt=""
            aria-hidden="true"
            style={{ width: 16, height: 16, imageRendering: 'pixelated', maxWidth: 'none' }}
          />
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
  initialGemBalance,
  announcements,
  totalFriendshipXP,
}: HomeClientProps) {
  const router = useRouter()

  const [crews,             setCrews]             = useState<CrewSummary[]>(() =>
    initialCrews.map((cs) => {
      const cached = consumeHomeLastMessage(cs.crew.id)
      if (!cached) return cs
      if (cs.lastMessage && cached.created_at <= cs.lastMessage.created_at) return cs
      return { ...cs, lastMessage: { content: cached.content, sender: cached.sender, created_at: cached.created_at } }
    })
  )
  const [showCreate,        setShowCreate]        = useState(false)
  const [openCardId,        setOpenCardId]        = useState<string | null>(null)
  const [leaveTarget,       setLeaveTarget]       = useState<CrewSummary | null>(null)
  const [leaving,           setLeaving]           = useState(false)
  const [leaveError,        setLeaveError]        = useState<string | null>(null)
  const [coins,             setCoins]             = useState(() => {
    const store = useChatStore.getState()
    // Prefer the store when it has been seeded (trust spent/earned adjustments).
    // Fall back to server value only when the store is uninitialized (0).
    const base = store.userCoins || initialCoins
    if (!store.userCoins) store.setUserCoins(base)
    return base
  })
  const [localFriendshipXP,    setLocalFriendshipXP]    = useState(totalFriendshipXP)
  const [fxpEnabled,           setFxpEnabled]           = useState(false)
  const [showCoinTip,          setShowCoinTip]          = useState(false)
  const [showHeartTip,         setShowHeartTip]         = useState(false)
  const [infiniteCoins,        setInfiniteCoins]        = useState(false)
  const [afkExpEnabled,        setAfkExpEnabled]        = useState(false)
  const [gemBalance,           setGemBalance]           = useState(() => {
    const store = useChatStore.getState()
    const base = Math.max(initialGemBalance, store.gemBalance)
    if (store.gemBalance < base) store.setGemBalance(base)
    return base
  })
  const [claimedGemToday,      setClaimedGemToday]      = useState(false)
  const [showGemTip,           setShowGemTip]           = useState(false)
  const [dmUnread,             setDmUnread]             = useState(() =>
    friends.reduce((sum, f) => sum + f.unreadCount, 0)
  )

  // Sync dmUnread down when server-fresh friends prop arrives (router.refresh or remount)
  useEffect(() => {
    setDmUnread(friends.reduce((sum, f) => sum + f.unreadCount, 0))
  }, [friends])

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

  // Sync AFK XP feature flag from localStorage + listen for dev-section toggle
  useEffect(() => {
    setAfkExpEnabled(localStorage.getItem('nexus_afk_exp') === '1')
    function onFlagChange(e: Event) {
      setAfkExpEnabled((e as CustomEvent<{ on: boolean }>).detail.on)
    }
    window.addEventListener('nexus-afk-exp-change', onFlagChange)
    return () => window.removeEventListener('nexus-afk-exp-change', onFlagChange)
  }, [])

  // Sync Friendship XP feature flag from localStorage + listen for dev-section toggle
  useEffect(() => {
    setFxpEnabled(localStorage.getItem('nexus_friendship_xp') === '1')
    function onFlagChange(e: Event) {
      setFxpEnabled((e as CustomEvent<{ on: boolean }>).detail.on)
    }
    window.addEventListener('nexus-friendship-xp-change', onFlagChange)
    return () => window.removeEventListener('nexus-friendship-xp-change', onFlagChange)
  }, [])

  useEffect(() => {
    isGemGateOpen().then((open) => setClaimedGemToday(!open))
  }, [])

  useEffect(() => {
    return useChatStore.subscribe((s) => {
      setGemBalance(s.gemBalance)
      if (s.gemBalance > 0) setClaimedGemToday(true)
    })
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

  // Realtime: live friendship XP total — dev-gated: nexus_friendship_xp
  useEffect(() => {
    if (!fxpEnabled) return
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
  }, [userId, fxpEnabled])

  const crewIds = crews.map((c) => c.crew.id)

  // ── Realtime: increment dmUnread when a new DM arrives from another user ──
  useEffect(() => {
    const dmChannelIds = friends.map(f => f.dmChannelId).filter(Boolean) as string[]
    if (dmChannelIds.length === 0) return
    const supabase = createClient()
    const seenIds  = new Set<string>()
    const channels = dmChannelIds.map((crewId) =>
      supabase
        .channel(`messages:${crewId}`)
        .on('broadcast', { event: 'new_message' }, (payload) => {
          const msg = payload.payload as MessageWithProfile
          if (!msg?.id || msg.user_id === userId || msg.message_type === 'system') return
          if (seenIds.has(msg.id)) return
          seenIds.add(msg.id)
          setDmUnread(n => n + 1)
        })
        .subscribe()
    )
    return () => { channels.forEach((ch) => supabase.removeChannel(ch)) }
  }, [friends.map(f => f.dmChannelId).filter(Boolean).sort().join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime: live message previews via postgres_changes UPDATE on crews ─
  // Single consolidated channel replaces the previous one-per-crew broadcast setup.
  // The trigger update_crew_last_message() fires after every non-system INSERT and
  // updates the three denormalized columns; we receive that UPDATE here.
  // Guard: skip if the timestamp didn't change (handles XP/level-only updates).
  useEffect(() => {
    if (crewIds.length === 0) return
    const supabase = createClient()
    const ch = supabase
      .channel('home-crews-preview')
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'crews',
          filter: `id=in.(${crewIds.join(',')})`,
        },
        (payload) => {
          const updated = payload.new as {
            id: string
            last_message_preview: string | null
            last_message_at: string | null
            last_message_sender_id: string | null
          }
          if (!updated.last_message_preview || !updated.last_message_at) return
          setCrews((prev) => {
            let changed = false
            const next = prev.map((cs) => {
              if (cs.crew.id !== updated.id) return cs
              if (cs.lastMessage?.created_at === updated.last_message_at) return cs
              changed = true
              return {
                ...cs,
                lastMessage: {
                  content:    updated.last_message_preview!,
                  sender:     profileCacheRef.current[updated.last_message_sender_id ?? ''] ?? '',
                  created_at: updated.last_message_at!,
                },
                unreadCount:
                  updated.last_message_sender_id === userId
                    ? cs.unreadCount
                    : cs.unreadCount + 1,
              }
            })
            if (!changed) return prev
            return next.sort((a, b) =>
              (b.lastMessage?.created_at ?? '').localeCompare(a.lastMessage?.created_at ?? ''),
            )
          })
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(ch) }
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

  const handleCloseCreate      = useCallback(() => setShowCreate(false), [])
  const handleOpenArsenal      = useCallback(() => {
    router.push('/home/invite')
  }, [router])
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
        <AccountPreview
          username={username}
          avatarUrl={avatarUrl}
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
          fxpEnabled={fxpEnabled}
          totalFriendshipXP={localFriendshipXP}
          showHeartTip={showHeartTip}
          onHeartTap={() => {
            setShowHeartTip(true)
            setTimeout(() => setShowHeartTip(false), 2000)
          }}
          gemBalance={gemBalance}
          claimedGemToday={claimedGemToday}
          showGemTip={showGemTip}
          onGemTap={() => {
            setShowGemTip(true)
            setTimeout(() => setShowGemTip(false), 2000)
          }}
        />
        <AnnouncementBanner announcements={announcements} />
      </div>

      {/* ── Scrollable list: DM banner + squads ── */}
      <div
        className="flex-1 overflow-y-auto min-h-0 px-4 flex flex-col gap-6"
        style={{
          paddingTop:    'var(--space-5)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 24px)',
        }}
      >

        <DmNotificationPreviewCard
          dmUnread={dmUnread}
          onTap={() => { setDmUnread(0); router.push('/friends') }}
        />

        {/* Squads section — 8px gap between label and list, 16px between items */}
        <div className="flex flex-col gap-[var(--space-3)] w-full">
          <p className="font-body font-medium text-[14px] text-primary tracking-[0.2px] leading-normal">Squads</p>
          {crews.length === 0 ? (
            <EmptyState onCreate={() => setShowCreate(true)} />
          ) : (
            <div className="flex flex-col gap-4">
              {crews.map((summary) => (
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
              ))}
            </div>
          )}
        </div>
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
      </AnimatePresence>
    </div>
  )
}
