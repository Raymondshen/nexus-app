'use client'

import { useState, useLayoutEffect, useRef } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { isSupabaseStorage, resolveAvatarUrl } from '@/components/ui/Avatar'
import { format, parseISO } from 'date-fns'
import { useSlideBack } from '@/components/ui/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { UserPlus } from 'pixelarticons/react/UserPlus'
import { Message } from 'pixelarticons/react/Message'
import { sendFriendRequestAction, acceptFriendRequestAction } from '@/app/(app)/friends/actions'
import { PixelSprite, spriteInfoFor } from '@/components/game/PixelSprite'
import type { AvatarClass } from '@/types'

// ─── Status ticker ───────────────────────────────────────────────────────────

function ProfileStatusTicker({ status }: { status: string }) {
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
      className="overflow-hidden border-t border-b border-border bg-black px-2"
      style={{ paddingTop: 12, paddingBottom: 12 }}
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
            className="inline-flex items-center gap-1 pr-6 flex-shrink-0 whitespace-nowrap"
          >
            <Message style={{ width: 8, height: 8, color: 'var(--color-tertiary)' }} aria-hidden="true" />
            <span className="font-silkscreen text-tertiary leading-none" style={{ fontSize: 'var(--text-xxs)' }}>
              &ldquo;{status}&rdquo;
            </span>
          </span>
        ))}
      </motion.div>
    </div>
  )
}

const CLASS_LABELS: Record<string, string> = {
  berserker: 'Berserker',
  sage:      'Sage',
  ghost:     'Ghost',
  hype_man:  'Hype Man',
  the_voice: 'The Voice',
  meme_lord: 'Meme Lord',
  mage:      'Mage',
  warrior:   'Warrior',
  rogue:     'Rogue',
  healer:    'Healer',
  archer:    'Archer',
}

type FriendState = 'none' | 'pending_sent' | 'pending_received' | 'accepted'

interface Props {
  crewId:           string
  userId:           string
  viewerId:         string
  isGuest:          boolean
  username:         string
  avatarUrl:        string | null
  birthday:         string | null
  avatarClass:      AvatarClass | null
  status:           string | null
  msgCount:         number
  totalXP:          number
  joinedAt:         string | null
  friendship:       { id: string; requester_id: string; addressee_id: string; status: string } | null
  inviterUsername:  string | null
  globalGroupChats: number
  globalMessages:   number
}

function deriveFriendState(
  friendship: Props['friendship'],
  viewerId: string,
): FriendState {
  if (!friendship) return 'none'
  if (friendship.status === 'accepted') return 'accepted'
  if (friendship.requester_id === viewerId) return 'pending_sent'
  return 'pending_received'
}

export function MemberProfileClient({
  userId,
  viewerId,
  isGuest,
  username,
  avatarUrl,
  birthday,
  avatarClass,
  status,
  msgCount,
  totalXP,
  joinedAt,
  friendship,
  inviterUsername,
  globalGroupChats,
  globalMessages,
}: Props) {
  const goBack  = useSlideBack()
  const isSelf  = userId === viewerId

  const [friendState, setFriendState] = useState<FriendState>(() =>
    isSelf ? 'accepted' : deriveFriendState(friendship, viewerId)
  )
  const [friendshipId]        = useState(friendship?.id ?? null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const classLabel  = avatarClass ? (CLASS_LABELS[avatarClass] ?? avatarClass) : '???'
  const initial     = username[0]?.toUpperCase() ?? '?'
  const spriteInfo  = spriteInfoFor(avatarClass)
  const birthdayStr = birthday ? format(parseISO(birthday), 'MMM d').toLowerCase() : null
  const joinedYear  = joinedAt ? new Date(joinedAt).getFullYear() : null

  async function handleAddFriend() {
    if (loading) return
    setLoading(true); setError(null)
    const result = await sendFriendRequestAction(userId)
    setLoading(false)
    if (result.error) { setError(result.error); return }
    setFriendState('pending_sent')
  }

  async function handleAccept() {
    if (!friendshipId || loading) return
    setLoading(true); setError(null)
    const result = await acceptFriendRequestAction(friendshipId)
    setLoading(false)
    if (result.error) { setError(result.error); return }
    setFriendState('accepted')
  }

  return (
    <>
      {/* ── Hero section — full bleed ────────────────────────────────────── */}
      <div
        className="relative flex-shrink-0 w-full bg-black overflow-hidden"
        style={{ height: 'calc(280px + env(safe-area-inset-top, 0px))' }}
      >
        {/* Background image */}
        <img
          src="/img/default_image.png"
          alt=""
          aria-hidden
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
        />

        {/* Full-height gradient — transparent top → black bottom */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 48.668%, rgba(0,0,0,0.8) 82.216%, rgb(0,0,0) 100%)' }}
        />

        {/* Content anchored to bottom */}
        <div className="absolute inset-0 flex flex-col justify-end gap-[var(--space-5)] p-[var(--space-5)]">

          {/* Details row */}
          <div className="flex items-center gap-[var(--space-5)] w-full">
            {/* Avatar 56×56 */}
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

            {/* Name + stats */}
            <div className="flex-1 min-w-0 flex flex-col gap-[var(--space-2)] justify-center leading-none">
              {joinedYear && (
                <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
                  Member Since {joinedYear}
                </p>
              )}
              <p className="font-body font-bold truncate" style={{ fontSize: 'var(--text-xl)', fontVariationSettings: '"opsz" 14', color: 'var(--color-primary)' }}>
                {username}
              </p>
              <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
                {globalGroupChats} group chat{globalGroupChats !== 1 ? 's' : ''} · {globalMessages.toLocaleString()} msg
              </p>
              {inviterUsername && (
                <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
                  Recruited by {inviterUsername}
                </p>
              )}
            </div>
          </div>

        </div>

        {/* Top gradient overlay — covers safe area + 86px for back button readability */}
        <div
          className="absolute left-0 right-0 top-0 pointer-events-none"
          style={{
            height:     'calc(86px + env(safe-area-inset-top, 0px))',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.25) 46.158%, rgba(0,0,0,0) 100%)',
          }}
        />

        {/* Floating back button */}
        <div className="absolute z-20 pointer-events-none" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 18px)', left: 16 }}>
          <div
            className="pointer-events-auto flex items-center bg-surface border border-purple p-2 overflow-hidden"
            style={{ boxShadow: '0px 0px 20px 12px rgba(0,0,0,0.1)' }}
          >
            <button
              onClick={goBack}
              aria-label="Back"
              className="flex items-center justify-center flex-shrink-0"
              style={{ width: 24, height: 24 }}
            >
              <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-purple)' }} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Status ticker — full-width row between hero and body ──────────── */}
      {status && <ProfileStatusTicker status={status} />}

      {/* ── Scrollable body ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto nexus-scroll">
        <div
          className="flex flex-col"
          style={{ gap: 'var(--space-7)', padding: 'var(--space-5) var(--space-5)' }}
        >

          {/* Friend action button */}
          {!isSelf && (
            <div className="w-full flex flex-col gap-3">
              {error && (
                <p className="font-silkscreen text-[8px] text-[#ef4444] text-center">{error}</p>
              )}

              {friendState === 'none' && (
                <button
                  onClick={handleAddFriend}
                  disabled={loading || isGuest}
                  className="w-full h-[48px] flex items-center justify-center gap-[var(--space-3)] border border-purple overflow-hidden px-[var(--space-5)] py-[var(--space-3)] disabled:opacity-40 active:opacity-70 transition-opacity"
                >
                  <UserPlus style={{ width: 16, height: 16, color: 'var(--color-purple)' }} aria-hidden="true" />
                  <span className="font-pixel text-[length:var(--text-mini)] text-purple leading-none whitespace-nowrap">
                    {loading ? 'SENDING...' : 'ADD FRIEND'}
                  </span>
                </button>
              )}

              {friendState === 'pending_sent' && (
                <div className="w-full h-[48px] flex items-center justify-center border border-border">
                  <span className="font-silkscreen text-[9px] text-muted tracking-[0.2px]">REQUEST SENT</span>
                </div>
              )}

              {friendState === 'pending_received' && (
                <button
                  onClick={handleAccept}
                  disabled={loading}
                  className="w-full h-[48px] flex items-center justify-center gap-2 border border-[#22c55e] px-4 py-2 disabled:opacity-40 active:opacity-70 transition-opacity"
                >
                  <span className="font-pixel text-[8px] text-[#22c55e] leading-none">
                    {loading ? '...' : 'ACCEPT'}
                  </span>
                </button>
              )}

              {friendState === 'accepted' && (
                <div className="w-full h-[48px] flex items-center justify-center border border-[#22c55e]/40">
                  <span className="font-silkscreen text-[9px] text-[#22c55e] tracking-[0.2px]">COMPANIONS ✓</span>
                </div>
              )}

              {isGuest && friendState === 'none' && (
                <p className="font-silkscreen text-[8px] text-muted text-center leading-relaxed">
                  Sign in with Google to add companions
                </p>
              )}
            </div>
          )}

          {/* Sprite + stats row */}
          <div className="flex items-center w-full" style={{ gap: 'var(--space-4)' }}>
            {/* Sprite 56×56 */}
            <div
              className="flex-shrink-0 flex items-center justify-center overflow-hidden"
              style={{ width: 56, height: 56 }}
            >
              {spriteInfo ? (
                <PixelSprite
                  spriteId={spriteInfo.id}
                  nativePx={spriteInfo.nativePx}
                  scale={2}
                  animate
                />
              ) : (
                <div className="w-full h-full bg-surface flex items-center justify-center">
                  {avatarUrl ? (
                    <Image
                      src={resolveAvatarUrl(avatarUrl, 56)}
                      alt={username}
                      width={56}
                      height={56}
                      className="object-cover w-full h-full"
                      unoptimized={isSupabaseStorage(avatarUrl)}
                    />
                  ) : (
                    <span className="font-pixel text-[16px] text-purple">{initial}</span>
                  )}
                </div>
              )}
            </div>

            {/* Stats column */}
            <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 'var(--space-2)' }}>
              <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-xxs)' }}>
                <span style={{ color: 'var(--color-tertiary)' }}>Class: </span>
                <span className="text-primary">{classLabel}</span>
              </p>
              {birthdayStr && (
                <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-xxs)' }}>
                  <span style={{ color: 'var(--color-tertiary)' }}>Born: </span>
                  <span className="text-primary">{birthdayStr}</span>
                </p>
              )}
              <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-xxs)' }}>
                <span style={{ color: 'var(--color-tertiary)' }}>Messages sent: </span>
                <span className="text-primary">{msgCount.toLocaleString()}</span>
              </p>
              <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-xxs)' }}>
                <span style={{ color: 'var(--color-tertiary)' }}>Xp earned: </span>
                <span className="text-primary">{totalXP.toLocaleString()}</span>
              </p>
            </div>
          </div>

          <div style={{ height: 'max(env(safe-area-inset-bottom), 16px)' }} />
        </div>
      </div>
    </>
  )
}
