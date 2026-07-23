'use client'

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import type { PanInfo } from 'framer-motion'
import { ChevronRight } from 'pixelarticons/react/ChevronRight'
import { TokeCircle } from 'pixelarticons/react/TokeCircle'
import { Heart } from 'pixelarticons/react/Heart'
import { Copy } from 'pixelarticons/react/Copy'
import { TickerBanner } from '@/shared/components/banners/TickerBanner'
import { MailRight } from 'pixelarticons/react/MailRight'
import Image from 'next/image'
import { supabaseImageLoader } from '@/shared/supabase/imageLoader'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { GroupAvatar } from '@/shared/components/ui/GroupAvatar'
import { InviteCodeCard } from '@/shared/components/ui/InviteCodeCard'
import { UserCard, type MiniMember } from '@/shared/components/ui/UserCard'
import { createClient } from '@/shared/supabase/client'
import { leaveCrewAction, joinCrewFromHomeAction, joinSelectClassAction } from '@/app/(app)/home/actions'
import { spriteIdFor } from '@/shared/components/game/PixelSprite'
import { CLASS_BASE_STATS } from '@/shared/constants/classStats'
import type { CombatClass } from '@/types'
import { Button } from '@/shared/components/ui/Button'
import type { CrewSummary } from '@/app/(app)/home/page'
import type { Message, MessageWithProfile } from '@/types'
import { useChatStore } from '@/store/chatStore'
import { clearSkipNextSlideEnter, consumeHomeParallaxReveal } from '@/app/layouts/SlidePage'
import { AnnouncementsSheet } from '@/shared/components/banners/AnnouncementsSheet'
import type { AnnouncementItem } from '@/shared/components/banners/AnnouncementsSheet'
import { DiamondGem } from 'pixelarticons/react/DiamondGem'
import { isGemGateOpen } from '@/shared/utils/gems'
import { GEM_DAILY_LIMIT } from '@/shared/constants/config'
import { consumeHomeLastMessage } from '@/features/home/utils/homePreviewCache'
import { getXPInCurrentLevel, getXPForCurrentLevel, getXPProgress } from '@/shared/utils/xp'
import { relativeTime } from '@/shared/utils/date'
import { MUSIC_DOMAINS } from '@/shared/constants/config'
import { makeLocalStorageFlagStore, getServerFlagSnapshotFalse } from '@/shared/utils/localStorageFlag'

// Dev feature flags — read via useSyncExternalStore (see makeLocalStorageFlagStore's
// own doc comment for why an effect-body setState isn't the React-idiomatic way to
// sync from an external store like localStorage).
const INFINITE_COINS_STORE = makeLocalStorageFlagStore('nexus_infinite_coins', 'nexus-infinite-coins-change')
const AFK_EXP_STORE        = makeLocalStorageFlagStore('nexus_afk_exp',        'nexus-afk-exp-change')
const FRIENDSHIP_XP_STORE  = makeLocalStorageFlagStore('nexus_friendship_xp',  'nexus-friendship-xp-change')

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
        <UserAvatar avatarUrl={avatarUrl} username={username} size={48} bg="primary" initialColor="black" priority />

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
      <TickerBanner text={status ?? 'Whats the mood today...'} />
    </div>
  )
}

// ─── Home action sheet (Create / Join / Invite) ───────────────────────────────

type SheetView = 'menu' | 'join' | 'class'

const JOIN_CLASSES: {
  id:          CombatClass
  name:        string
  role:        string
  attackDesc:  string
  abilityName: string
  abilityDesc: string
  passiveName: string
  passiveDesc: string
}[] = [
  {
    id:          'warrior',
    name:        'WARRIOR',
    role:        'tank/dps',
    attackDesc:  'atk-scaled strike. hits harder at low hp.',
    abilityName: 'guard',
    abilityDesc: 'force the boss to attack you for 60s. your def rises 40%.',
    passiveName: 'last stand',
    passiveDesc: 'below 30% hp, all damage dealt increases by 20%.',
  },
  {
    id:          'healer',
    name:        'HEALER',
    role:        'support/sustain',
    attackDesc:  'weak hit. restores 5% of damage dealt back to yourself.',
    abilityName: 'mend',
    abilityDesc: 'int-scaled heal to all living crew members. cannot revive the downed.',
    passiveName: 'second wind',
    passiveDesc: '+15% to all healing — both mend and normal attack self-heal.',
  },
  {
    id:          'archer',
    name:        'ARCHER',
    role:        'dps/accuracy',
    attackDesc:  'atk-scaled hit. high dex raises crit chance significantly.',
    abilityName: 'volley',
    abilityDesc: 'hit + apply a 20% damage-taken debuff on the boss for 30s.',
    passiveName: 'precision',
    passiveDesc: 'highest natural crit chance in the squad. aim true.',
  },
  {
    id:          'rogue',
    name:        'ROGUE',
    role:        'burst/speed',
    attackDesc:  'fast atk-scaled hit. consecutive messages stack a damage bonus.',
    abilityName: 'backstab',
    abilityDesc: 'guaranteed crit. 2.5× damage if boss is above 50% hp.',
    passiveName: 'momentum',
    passiveDesc: 'each message stacks +5% dmg (cap 25%). resets after 1hr silence.',
  },
  {
    id:          'mage',
    name:        'MAGE',
    role:        'high damage/fragile',
    attackDesc:  'highest atk of any class. hits hardest on every normal attack.',
    abilityName: 'cast',
    abilityDesc: '3× atk arcane nuke. crit-eligible.',
    passiveName: 'arcane ward',
    passiveDesc: 'below 40% hp, your def is multiplied by 1.3 dynamically.',
  },
]

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
  const router = useRouter()
  const [view, setView] = useState<SheetView>('menu')

  // ── Join state ───────────────────────────────────────────────────────────
  const [joinCode,    setJoinCode]    = useState('')
  const [joinLoading, setJoinLoading] = useState(false)
  const [joinError,   setJoinError]   = useState<string | null>(null)

  // ── Class picker state (shown after crew join) ───────────────────────────
  const [joinedCrewId,     setJoinedCrewId]     = useState('')
  const [joinedCrewName,   setJoinedCrewName]   = useState('')
  const [joinedCrewImg,    setJoinedCrewImg]     = useState<string | null>(null)
  const [joinedCrewBgUrl,  setJoinedCrewBgUrl]  = useState<string | null>(null)
  const [joinedMemberCount,setJoinedMemberCount]= useState(1)
  const [classIdx,         setClassIdx]         = useState(0)
  const [classLoading,     setClassLoading]     = useState(false)
  const [classError,       setClassError]       = useState<string | null>(null)

  async function handleJoin() {
    if (joinLoading || joinCode.length !== 6) return
    setJoinLoading(true)
    setJoinError(null)
    const result = await joinCrewFromHomeAction(joinCode)
    if ('error' in result) { setJoinError(result.error); setJoinLoading(false); return }
    setJoinedCrewId(result.crewId)
    setJoinedCrewName(result.crewName)
    setJoinedCrewImg(result.crewImageUrl)
    setJoinedCrewBgUrl(result.crewBackgroundImageUrl)
    setJoinedMemberCount(result.memberCount)
    setClassIdx(0)
    setClassError(null)
    setJoinLoading(false)
    setView('class')
  }

  async function handleClassJoin() {
    if (classLoading) return
    setClassLoading(true)
    setClassError(null)
    const result = await joinSelectClassAction(joinedCrewId, JOIN_CLASSES[classIdx].id)
    if ('error' in result) { setClassError(result.error); setClassLoading(false); return }
    sessionStorage.setItem('nexus_chat_from', '/home')
    router.push(`/chat/${joinedCrewId}`)
    onClose()
  }

  function handleJoinCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
  }

  const sheetContent = (() => {
    if (view === 'class') {
      const selected  = JOIN_CLASSES[classIdx]
      const spriteId  = spriteIdFor(selected.id as import('@/types').AvatarClass)
      const stats     = CLASS_BASE_STATS[selected.id]

      return (
        <>
          {/* Header */}
          <div className="flex flex-col flex-shrink-0" style={{ gap: 8 }}>
            <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
              Squad Sh**t...
            </p>
            <div className="flex flex-col" style={{ gap: 4 }}>
              <p className="font-body font-bold text-primary leading-none" style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}>
                Choose Your Class
              </p>
              <p className="font-body font-light text-tertiary leading-none" style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}>
                You cannot change your class afterwards.
              </p>
            </div>
          </div>

          {/* Group header */}
          <div className="relative w-full flex-shrink-0 overflow-hidden" style={{ height: 180, padding: 8 }}>
            {joinedCrewBgUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={joinedCrewBgUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ position: 'absolute', inset: 0, background: 'var(--color-surface)' }} />
            )}
            <div style={{ position: 'absolute', inset: 0, background: 'var(--gradient-image-overlay)' }} />
            <div className="relative flex items-start justify-between w-full">
              <div className="flex items-center flex-1 min-w-0" style={{ gap: 16 }}>
                {/* Crew avatar */}
                <div className="flex-shrink-0 overflow-hidden" style={{ width: 40, height: 40, background: joinedCrewImg ? 'transparent' : 'var(--color-primary)' }}>
                  {joinedCrewImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={joinedCrewImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="font-body font-black text-black leading-none" style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}>
                        {joinedCrewName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                {/* Name + count */}
                <div className="flex flex-col" style={{ gap: 4 }}>
                  <p className="font-body font-black leading-none" style={{ fontSize: 'var(--text-md)', color: 'var(--color-secondary)', fontVariationSettings: '"opsz" 14' }}>
                    {joinedCrewName.toUpperCase()}
                  </p>
                  <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
                    {joinedMemberCount} member{joinedMemberCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Class tabs */}
          <div className="flex items-center justify-between flex-shrink-0">
            {JOIN_CLASSES.map((cls, i) => {
              const id         = spriteIdFor(cls.id as import('@/types').AvatarClass)
              const isSelected = i === classIdx
              return (
                <button
                  key={cls.id}
                  type="button"
                  onClick={() => setClassIdx(i)}
                  className="flex items-center justify-center overflow-hidden flex-shrink-0"
                  style={{
                    width:      48,
                    height:     48,
                    background: 'var(--color-surface-sheet)',
                    border:     `1px solid ${isSelected ? 'var(--color-purple)' : 'var(--color-border-hover)'}`,
                  }}
                >
                  {id && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/sprites/${id}/south.png`}
                      alt={cls.name}
                      style={{ width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated' }}
                    />
                  )}
                </button>
              )
            })}
          </div>

          {/* Class detail */}
          <div className="flex flex-col flex-shrink-0" style={{ gap: 8 }}>
            <div className="flex items-center justify-between">
              {/* Left: sprite + name */}
              <div className="flex items-center" style={{ gap: 8 }}>
                <div className="relative flex-shrink-0" style={{ width: 56, height: 56 }}>
                  {spriteId && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/sprites/${spriteId}/south.png`}
                      alt={selected.name}
                      style={{
                        position:       'absolute',
                        top:            '50%',
                        left:           '50%',
                        transform:      'translate(-50%, -50%)',
                        width:          80,
                        height:         80,
                        imageRendering: 'pixelated',
                        maxWidth:       'none',
                        objectFit:      'contain',
                      }}
                    />
                  )}
                </div>
                <div className="flex flex-col" style={{ gap: 4 }}>
                  <span className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>lv. 1</span>
                  <span className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-md)', color: 'var(--color-primary)' }}>{selected.name}</span>
                  <span className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>{selected.role}</span>
                </div>
              </div>
              {/* Right: stats */}
              <div className="flex items-start" style={{ gap: 8 }}>
                <div className="flex flex-col" style={{ gap: 8 }}>
                  <span className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>HP: {stats.hp}</span>
                  <span className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>ATK: {stats.atk}</span>
                  <span className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>DEF: {stats.def}</span>
                </div>
                <div className="flex flex-col" style={{ gap: 8 }}>
                  <span className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>Dex: {stats.dex}</span>
                  <span className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>int: {stats.int}</span>
                </div>
              </div>
            </div>

            {/* Descriptions */}
            <div className="flex flex-col" style={{ gap: 16 }}>
              <p className="font-silkscreen leading-normal" style={{ fontSize: 11, color: 'var(--color-secondary)' }}>
                <span style={{ color: '#f59e0b' }}>normal attack</span>
                {` - ${selected.attackDesc}`}
              </p>
              <p className="font-silkscreen leading-normal" style={{ fontSize: 11, color: 'var(--color-secondary)' }}>
                <span style={{ color: '#f59e0b' }}>ability {selected.abilityName}</span>
                {` - ${selected.abilityDesc}`}
              </p>
              <p className="font-silkscreen leading-normal" style={{ fontSize: 11, color: 'var(--color-secondary)' }}>
                <span style={{ color: '#60a5fa' }}>passive {selected.passiveName}</span>
                {` - ${selected.passiveDesc}`}
              </p>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex flex-col flex-shrink-0" style={{ gap: 20 }}>
            {classError && (
              <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-danger)' }}>{classError}</p>
            )}
            <button
              type="button"
              onClick={handleClassJoin}
              disabled={classLoading}
              className="w-full flex items-center justify-center font-silkscreen text-primary bg-[var(--color-purple)] overflow-hidden disabled:opacity-40"
              style={{ fontSize: 'var(--text-xs)', height: 48, boxShadow: '4px 4px 0 rgba(168,85,247,0.5)' }}
            >
              {classLoading ? '...' : 'Join the squad'}
            </button>
            <button
              type="button"
              onClick={() => setView('join')}
              disabled={classLoading}
              className="w-full flex items-center justify-center font-silkscreen overflow-hidden disabled:opacity-40"
              style={{ height: 48, fontSize: 'var(--text-xs)', color: 'var(--red)', border: '1px solid var(--red)' }}
            >
              Cancel
            </button>
          </div>
        </>
      )
    }

    if (view === 'join') {
      return (
        <>
          {/* Header */}
          <div className="flex flex-col" style={{ gap: 8 }}>
            <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
              Squad Sh**t...
            </p>
            <div className="flex flex-col" style={{ gap: 4 }}>
              <p className="font-body font-bold text-primary leading-none" style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}>
                Join A Squad
              </p>
              <p className="font-body font-light text-tertiary leading-none" style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}>
                Join the squad from the code you&apos;ve received from a member.
              </p>
            </div>
          </div>

          <div className="flex flex-col" style={{ gap: 'var(--space-7)' }}>
            <div className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
              <p className="font-body leading-none tracking-[0.2px] text-primary" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14', fontWeight: 500 }}>
                Invite Code
              </p>
              <input
                value={joinCode}
                onChange={handleJoinCodeChange}
                placeholder="A3X9KP"
                autoComplete="off"
                autoFocus
                className="w-full bg-[var(--color-surface-sheet)] font-silkscreen text-primary placeholder:text-muted focus:outline-none uppercase tracking-[0.2px]"
                style={{ border: '1px solid var(--color-border-hover)', padding: 12, fontSize: 'var(--text-xl)', height: 48 }}
              />
              {joinError && (
                <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--red)' }}>{joinError}</p>
              )}
            </div>
            <div className="flex flex-col" style={{ gap: 'var(--space-5)' }}>
              <button
                type="button"
                onClick={handleJoin}
                disabled={joinLoading || joinCode.length !== 6}
                className="w-full flex items-center justify-center font-silkscreen text-primary bg-[var(--color-purple)] overflow-hidden disabled:opacity-40"
                style={{ fontSize: 'var(--text-xs)', height: 48, boxShadow: '4px 4px 0 rgba(168,85,247,0.5)' }}
              >
                {joinLoading ? '...' : 'Join the Squad'}
              </button>
              <button
                type="button"
                onClick={() => setView('menu')}
                disabled={joinLoading}
                className="w-full flex items-center justify-center font-silkscreen overflow-hidden disabled:opacity-40"
                style={{ height: 48, fontSize: 'var(--text-xs)', color: 'var(--red)', border: '1px solid var(--red)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )
    }

    // Menu view
    return (
      <>
        <div className="flex flex-col" style={{ gap: 'var(--space-3)' }}>
          <p className="font-silkscreen leading-none whitespace-nowrap" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>SQUAD SH**!</p>
          <h2 className="font-body font-bold text-primary leading-none" style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}>
            What would you like to do?
          </h2>
        </div>

        <div className="flex flex-col" style={{ gap: 'var(--space-5)' }}>
          <Button shadow className="w-full" onClick={() => { onClose(); router.push('/home/create') }}>
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
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        drag={joinLoading || classLoading ? false : 'y'}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 80 || info.velocity.y > 400) onClose()
        }}
        className="relative w-full max-w-[480px] bg-[var(--color-surface-sheet)] rounded-tl-[16px] rounded-tr-[16px] overflow-hidden"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="overflow-y-auto nexus-scroll flex flex-col"
          style={{
            gap:           view === 'class' ? 20 : 'var(--space-7)',
            paddingTop:    24,
            paddingLeft:   16,
            paddingRight:  16,
            paddingBottom: 'max(env(safe-area-inset-bottom), 28px)',
          }}
        >
          {sheetContent}
        </div>
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
              : 'Your XP gains will be redistributed to the remaining members.'}
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
  const { crew, lastMessage, unreadCount, msgCount } = summary
  const hasUnread = unreadCount > 0
  const imageUrl  = crew.image_url as string | null | undefined
  const state     = !lastMessage ? 'default' : hasUnread ? 'unread' : 'active'

  return (
    <div className="w-full flex items-center gap-4 h-12">
      {/* Group photo — 48×48 box */}
      <GroupAvatar imageUrl={imageUrl} name={crew.name} size={48} />

      {/* Group details — 3-row column */}
      <div className="flex-1 min-w-0 flex flex-col gap-[var(--space-2)] h-full justify-center">
        {/* Row 1: level · total msg [· unread count (unread only)] */}
        <div className="flex items-center gap-2 w-full">
          <span className="font-silkscreen text-[length:var(--text-mini)] text-tertiary leading-none whitespace-nowrap">
            lv. {crew.level}
          </span>
          <div className="w-[2px] h-[2px] bg-border flex-shrink-0" />
          <span className="font-silkscreen text-[length:var(--text-mini)] text-tertiary leading-none whitespace-nowrap">
            Total MSG. {msgCount.toLocaleString()}
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

const SWIPE_OPEN_THRESHOLD = 40

function SwipeableCrewCard({
  summary,
  onTap,
  onLongPress,
}: {
  summary:     CrewSummary
  onTap:       () => void
  onLongPress: () => void
}) {
  const router          = useRouter()
  const wasDragging    = useRef(false)
  const longPressRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressedRef = useRef(false)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)

  // Clear any pending timer on unmount
  useEffect(() => () => { if (longPressRef.current) clearTimeout(longPressRef.current) }, [])

  function handleDragEnd(_: unknown, info: PanInfo) {
    // Only mark as dragged when the finger actually moved — Framer Motion fires
    // onDragStart even for micro-movements (1–2px), causing onClick to be swallowed
    // and requiring a double-tap to navigate. Setting the flag synchronously here
    // (so onClick sees it) and only for real drags fixes the issue.
    if (Math.abs(info.offset.x) > 5) {
      wasDragging.current = true
      setTimeout(() => { wasDragging.current = false }, 50)
    }
    // Swipe-left past threshold → open squad details sheet (same as long-press)
    if (info.offset.x < -SWIPE_OPEN_THRESHOLD) {
      onLongPress()
    }
  }

  function handleClick() {
    if (wasDragging.current) return
    if (longPressedRef.current) {
      longPressedRef.current = false
      return
    }
    onTap()
  }

  function cancelLongPress() {
    if (longPressRef.current !== null) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
    pointerStartRef.current = null
  }

  function handlePointerDown(e: React.PointerEvent) {
    // Prefetch on press — gives Next.js 100–300ms head start before navigation
    router.prefetch(`/chat/${summary.crew.id}`)
    pointerStartRef.current = { x: e.clientX, y: e.clientY }
    cancelLongPress()
    longPressRef.current = setTimeout(() => {
      longPressRef.current  = null
      longPressedRef.current = true
      onLongPress()
    }, 500)
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!pointerStartRef.current) return
    const dx = e.clientX - pointerStartRef.current.x
    const dy = e.clientY - pointerStartRef.current.y
    if (dx * dx + dy * dy > 100) cancelLongPress()  // > 10px movement
  }

  return (
    <motion.div
      className="bg-black cursor-pointer"
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0.25, right: 0 }}
      onDragStart={cancelLongPress}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      whileTap={{ scale: 0.98 }}
      onPointerDown={handlePointerDown}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onPointerMove={handlePointerMove}
    >
      <SquadCardPreview summary={summary} />
    </motion.div>
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

// ─── Home Squad Details Sheet ─────────────────────────────────────────────────
// Read-only mirror of ChatRoomBrowseSheet's Group Details section (Figma 470:5082) —
// same header/invite/member-card layout, minus the creator-only edit affordances and
// notif/library actions that belong only to the in-chat version. Reuses UserCard +
// InviteCodeCard rather than re-inlining them.

function HomeCrewDetailsSheet({
  summary,
  onLeaveRequest,
  onClose,
}: {
  summary:         CrewSummary
  onLeaveRequest:  () => void
  onClose:         () => void
}) {
  const router = useRouter()
  const { crew, memberCount } = summary
  const [members,   setMembers]   = useState<MiniMember[]>([])
  const [creatorId, setCreatorId] = useState<string | null>(null)
  const [msgCounts, setMsgCounts] = useState<Map<string, number>>(new Map())
  const [vinyls,    setVinyls]    = useState<Record<string, { imageUrl: string | null; title: string | null }>>({})
  const [bgUrl,     setBgUrl]     = useState<string | null>(
    (crew.background_image_url as string | null | undefined) ?? null,
  )
  const [loading, setLoading] = useState(true)

  const xpProgress    = getXPProgress(crew.total_xp)
  const imageUrl      = crew.image_url as string | null | undefined
  const totalMessages = [...msgCounts.values()].reduce((s, n) => s + n, 0)

  useEffect(() => {
    const supabase  = createClient()
    let cancelled   = false

    async function fetchData() {
      const needsBg = !bgUrl

      const [membersResult, msgCountResult, crewResult, vibeNotesResult, memberPinResult] = await Promise.all([
        supabase
          .from('crew_members')
          .select('user_id, class, joined_at, profiles(username, avatar_url, avatar_class, background_url, status)')
          .eq('crew_id', crew.id),
        supabase.rpc('get_crew_member_msg_counts', { p_crew_id: crew.id }),
        needsBg
          ? supabase.from('crews').select('background_image_url').eq('id', crew.id).single()
          : Promise.resolve({ data: null as unknown }),
        // Most-recent music notes per member within this crew (fallback source)
        supabase
          .from('notes')
          .select('id, created_by, og_title, og_image_url')
          .eq('crew_id', crew.id)
          .in('source_domain', MUSIC_DOMAINS)
          .order('created_at', { ascending: false })
          .limit(100),
        // Each member's pinned_vinyl_id from their profile
        supabase
          .from('crew_members')
          .select('user_id, profile:profiles(pinned_vinyl_id)')
          .eq('crew_id', crew.id),
      ])

      if (cancelled) return

      const msgMap = new Map<string, number>()
      for (const row of (msgCountResult.data ?? []) as Array<{ user_id: string; msg_count: number }>) {
        msgMap.set(row.user_id, row.msg_count)
      }

      const rawMembers = (membersResult.data ?? []) as unknown as Array<{
        user_id:   string
        class:     string | null
        joined_at: string
        profiles:  {
          username: string; avatar_url: string | null; avatar_class: string | null
          background_url: string | null; status: string | null
        } | null
      }>

      const creator = rawMembers.reduce<{ id: string; ts: string } | null>((earliest, m) => {
        if (earliest === null || m.joined_at < earliest.ts) return { id: m.user_id, ts: m.joined_at }
        return earliest
      }, null)?.id ?? null

      const list: MiniMember[] = rawMembers
        .map((m) => ({
          id:             m.user_id,
          username:       m.profiles?.username       ?? 'Unknown',
          avatar_url:     m.profiles?.avatar_url     ?? null,
          avatar_class:   m.profiles?.avatar_class   ?? null,
          background_url: m.profiles?.background_url ?? null,
          status:         m.profiles?.status         ?? null,
        }))
        .sort((a, b) => (msgMap.get(b.id) ?? 0) - (msgMap.get(a.id) ?? 0))

      setMembers(list)
      setMsgCounts(msgMap)
      setCreatorId(creator)

      // Vinyl pill map — priority: user's pinned vibe → most-recent music note in this crew.
      // Mirrors chat/[crewId]/page.tsx's server-side logic (see CLAUDE.md UserCard vinyl notes).
      type NoteRow = { id: string; created_by: string; og_title: string | null; og_image_url: string | null }
      type PinRow  = { user_id: string; profile: { pinned_vinyl_id: string | null } | null }

      const noteById:    Record<string, NoteRow>   = {}
      const notesByUser: Record<string, NoteRow[]> = {}
      for (const n of (vibeNotesResult.data ?? []) as unknown as NoteRow[]) {
        noteById[n.id] = n
        if (!notesByUser[n.created_by]) notesByUser[n.created_by] = []
        notesByUser[n.created_by].push(n)
      }

      const pinnedMap: Record<string, string | null> = {}
      for (const r of (memberPinResult.data ?? []) as unknown as PinRow[]) {
        pinnedMap[r.user_id] = r.profile?.pinned_vinyl_id ?? null
      }

      const missingIds = Object.values(pinnedMap).filter((id): id is string => !!id && !noteById[id])
      const extraNotesResult = missingIds.length > 0
        ? await supabase.from('notes').select('id, created_by, og_title, og_image_url').in('id', missingIds)
        : { data: null }
      if (cancelled) return

      const extraById: Record<string, NoteRow> = {}
      for (const n of (extraNotesResult.data ?? []) as unknown as NoteRow[]) extraById[n.id] = n

      const vinylMap: Record<string, { imageUrl: string | null; title: string | null }> = {}
      for (const [userId, pinnedId] of Object.entries(pinnedMap)) {
        if (pinnedId) {
          const note = noteById[pinnedId] ?? extraById[pinnedId]
          if (note) {
            vinylMap[userId] = { imageUrl: note.og_image_url, title: note.og_title }
            continue
          }
        }
        const fallback = notesByUser[userId]?.[0]
        if (fallback) vinylMap[userId] = { imageUrl: fallback.og_image_url, title: fallback.og_title }
      }
      for (const [userId, notes] of Object.entries(notesByUser)) {
        if (!vinylMap[userId] && notes.length > 0) {
          vinylMap[userId] = { imageUrl: notes[0].og_image_url, title: notes[0].og_title }
        }
      }
      setVinyls(vinylMap)

      if (needsBg && crewResult.data) {
        const bg = (crewResult.data as { background_image_url?: string | null }).background_image_url
        if (bg) setBgUrl(bg)
      }

      setLoading(false)
    }

    fetchData()
    return () => { cancelled = true }
  }, [crew.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 z-[60] bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[70] bg-[var(--color-surface-sheet)] rounded-tl-[16px] rounded-tr-[16px] flex flex-col overflow-hidden"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 400) onClose() }}
        style={{ maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Group header — 240px, full-bleed (Figma 470:5082 / matches ChatRoomBrowseSheet's Group Details) ── */}
        <div
          className="relative flex-shrink-0 flex flex-col justify-between rounded-tl-[16px] rounded-tr-[16px] overflow-hidden"
          style={{ height: 240, padding: 16 }}
        >
          {bgUrl ? (
            <div className="absolute inset-0 pointer-events-none">
              <Image
                src={bgUrl}
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
            style={{ background: 'var(--gradient-image-overlay)' }}
          />

          {/* Top row: crew image + name/level/count | close */}
          <div className="relative flex items-start justify-between">
            <div className="flex items-center min-w-0 flex-1" style={{ gap: 8 }}>
              <GroupAvatar imageUrl={imageUrl} name={crew.name} size={40} />
              <div className="flex flex-col min-w-0" style={{ gap: 4 }}>
                <p
                  className="font-body font-black leading-none truncate uppercase"
                  style={{ fontSize: 'var(--text-md)', color: 'var(--color-secondary)', fontVariationSettings: '"opsz" 14' }}
                >
                  {crew.name}
                </p>
                <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
                  Lv.{crew.level} · {memberCount} {memberCount === 1 ? 'member' : 'members'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex items-center justify-center flex-shrink-0"
              style={{ width: 24, height: 24 }}
              aria-label="Close"
            >
              <ChevronRight
                style={{ width: 24, height: 24, color: 'var(--color-tertiary)', transform: 'rotate(90deg)' }}
                aria-hidden="true"
              />
            </button>
          </div>

          {/* XP bar */}
          <div className="relative flex flex-col w-full" style={{ gap: 8 }}>
            <p className="leading-[0] text-[0px] font-silkscreen w-full">
              <span className="leading-none text-tertiary" style={{ fontSize: 'var(--text-mini)' }}>
                {`${getXPInCurrentLevel(crew.total_xp)} / ${getXPForCurrentLevel(crew.total_xp)}XP`}
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

        {/* ── Members section (flex-1, vertical overflow only on short viewports —
             matches ChatRoomBrowseSheet's Group Details member row exactly) ── */}
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto nexus-scroll" style={{ padding: 16, gap: 16 }}>
          <p className="flex-shrink-0 font-silkscreen leading-none" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary)' }}>
            Members
          </p>

          {crew.invite_code && <InviteCodeCard inviteCode={crew.invite_code} style={{ flexShrink: 0 }} />}

          {/* Horizontally-scrollable member card row */}
          <div className="flex overflow-x-auto no-scrollbar flex-shrink-0" style={{ gap: 8 }}>
            {(loading ? Array.from({ length: Math.min(memberCount, 3) }) : members).map((m, i) => (
              loading || !m ? (
                <div key={i} className="flex-shrink-0 bg-border animate-pulse rounded-[var(--x3,8px)]" style={{ width: 180, height: 216 }} />
              ) : (
                <UserCard
                  key={(m as MiniMember).id}
                  profile={m as MiniMember}
                  msgCount={msgCounts.get((m as MiniMember).id) ?? 0}
                  loading={false}
                  isOnline={false}
                  isCreator={(m as MiniMember).id === creatorId}
                  vinyl={vinyls[(m as MiniMember).id] ?? null}
                  onTap={() => router.push(`/chat/${crew.id}/member/${(m as MiniMember).id}`)}
                />
              )
            ))}
          </div>
        </div>

        {/* ── Fixed bottom: leave squad ── */}
        <div
          className="flex-shrink-0"
          style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 16, paddingBottom: 'max(env(safe-area-inset-bottom), 28px)' }}
        >
          <button
            type="button"
            onClick={onLeaveRequest}
            className="w-full flex items-center justify-center font-silkscreen overflow-hidden"
            style={{ height: 48, fontSize: 'var(--text-xs)', color: 'var(--red)', border: '1px solid var(--red)' }}
            aria-label="Leave squad"
          >
            leave squad
          </button>
        </div>
      </motion.div>
    </>
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

  // Read-and-clear on mount only — true when chat's tap-to-back button sent us
  // here (see markHomeParallaxReveal), false for every other way of reaching Home.
  const [playParallaxReveal] = useState(() => consumeHomeParallaxReveal())

  const [crews,             setCrews]             = useState<CrewSummary[]>(() =>
    initialCrews.map((cs) => {
      const cached = consumeHomeLastMessage(cs.crew.id)
      if (!cached) return cs
      if (cs.lastMessage && cached.created_at <= cs.lastMessage.created_at) return cs
      return { ...cs, lastMessage: { content: cached.content, sender: cached.sender, created_at: cached.created_at } }
    })
  )
  const [showCreate,        setShowCreate]        = useState(false)

  const [detailsTarget,     setDetailsTarget]     = useState<CrewSummary | null>(null)
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
  const fxpEnabled     = useSyncExternalStore(FRIENDSHIP_XP_STORE.subscribe,  FRIENDSHIP_XP_STORE.getSnapshot,  getServerFlagSnapshotFalse)
  const [showCoinTip,          setShowCoinTip]          = useState(false)
  const [showHeartTip,         setShowHeartTip]         = useState(false)
  const infiniteCoins = useSyncExternalStore(INFINITE_COINS_STORE.subscribe, INFINITE_COINS_STORE.getSnapshot, getServerFlagSnapshotFalse)
  const afkExpEnabled = useSyncExternalStore(AFK_EXP_STORE.subscribe,        AFK_EXP_STORE.getSnapshot,        getServerFlagSnapshotFalse)
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

  // Sync dmUnread down when a server-fresh friends prop arrives (router.refresh or
  // remount) — genuinely divergent local state, not a state-mirroring anti-pattern:
  // dmUnread is also incremented locally on realtime DM arrival and reset to 0 on
  // tap (see below), so it can't just be computed from `friends` during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDmUnread(friends.reduce((sum, f) => sum + f.unreadCount, 0))
  }, [friends])

  const profileCacheRef = useRef<Record<string, string>>(profileCache)
  useEffect(() => { profileCacheRef.current = profileCache }, [profileCache])

  useEffect(() => {
    isGemGateOpen().then((open) => setClaimedGemToday(!open))
  }, [])

  useEffect(() => {
    return useChatStore.subscribe((s) => {
      setGemBalance(s.gemBalance)
      if (s.gemBalance > 0) setClaimedGemToday(true)
    })
  }, [])

  // Sync crews down when a server-fresh initialCrews prop arrives — genuinely
  // divergent local state, not a state-mirroring anti-pattern: crews is also
  // mutated locally elsewhere (realtime updates, unread reset, leave-crew removal),
  // so it can't just be computed from initialCrews during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCrews(initialCrews)
  }, [initialCrews])

  // Unlocks NotificationPrompt eligibility for any device that has a crew to be
  // notified about, not just the device that happened to run onboarding. Without
  // this, `nexus_crew_created` (set once by WelcomeDetector during onboarding)
  // stays unset forever on a second device/reinstall/new phone — the prompt then
  // never appears there and the user has no way to ever get subscribed.
  useEffect(() => {
    if (initialCrews.length > 0 && !localStorage.getItem('nexus_crew_created')) {
      localStorage.setItem('nexus_crew_created', '1')
    }
  }, [initialCrews])

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
    <motion.div
      className="h-screen bg-black flex flex-col overflow-hidden relative"
      initial={playParallaxReveal ? { x: '-30%' } : false}
      animate={{ x: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 36, mass: 0.9 }}
    >
      {/* Dim scrim matching the parallax reveal, mirrors the tap-back exit's
          feel when chat's own custom drag handler isn't in play (nativeSwipe). */}
      {playParallaxReveal && (
        <motion.div
          className="absolute inset-0 z-40 pointer-events-none"
          style={{ background: '#000' }}
          initial={{ opacity: 0.35 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        />
      )}

      {/* ── Static header: account card ── */}
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

        {/* Squads section */}
        <div className="flex flex-col w-full" style={{ gap: 20 }}>
          <p className="font-silkscreen text-primary leading-none whitespace-nowrap" style={{ fontSize: 'var(--text-xs)' }}>Group chat</p>
          {crews.length === 0 ? (
            <EmptyState onCreate={() => setShowCreate(true)} />
          ) : (
            <div className="flex flex-col" style={{ gap: 20 }}>
              {crews.map((summary) => (
                <motion.div
                  key={summary.crew.id}
                  layout
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                >
                  <SwipeableCrewCard
                    summary={summary}
                    onTap={() => handleCrewTap(summary.crew.id)}
                    onLongPress={() => setDetailsTarget(summary)}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      <AnnouncementsSheet announcements={announcements} />
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
        {detailsTarget && !leaveTarget && (
          <HomeCrewDetailsSheet
            key="details-sheet"
            summary={detailsTarget}
            onLeaveRequest={() => {
              const target = detailsTarget
              setDetailsTarget(null)
              setLeaveTarget(target)
              setLeaveError(null)
            }}
            onClose={() => setDetailsTarget(null)}
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
    </motion.div>
  )
}
