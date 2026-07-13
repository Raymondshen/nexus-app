'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { ProfileHeroBackground } from '@/shared/components/ui/ProfileHeroBackground'
import { useSlideBack } from '@/app/layouts/SlidePage'
import { TickerBanner } from '@/shared/components/banners/TickerBanner'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { UserPlus } from 'pixelarticons/react/UserPlus'
import { sendFriendRequestAction, acceptFriendRequestAction } from '@/app/(app)/friends/actions'
import type { AvatarClass } from '@/types'

type FriendState = 'none' | 'pending_sent' | 'pending_received' | 'accepted'

interface Props {
  crewId:           string
  userId:           string
  viewerId:         string
  isGuest:          boolean
  username:         string
  avatarUrl:        string | null
  backgroundUrl:    string | null
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
  friendshipXP:     number | null
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
  backgroundUrl,
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
  friendshipXP,
}: Props) {
  const goBack  = useSlideBack()
  const isSelf  = userId === viewerId

  const [friendState, setFriendState] = useState<FriendState>(() =>
    isSelf ? 'accepted' : deriveFriendState(friendship, viewerId)
  )
  const [friendshipId]        = useState(friendship?.id ?? null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const joinedYear = joinedAt ? new Date(joinedAt).getFullYear() : null

  const BOND_XP_PER_LEVEL = 100
  const bondTotal   = friendshipXP ?? 0
  const bondLevel   = Math.floor(bondTotal / BOND_XP_PER_LEVEL) + 1
  const bondXPInLvl = bondTotal % BOND_XP_PER_LEVEL
  const bondPct     = (bondXPInLvl / BOND_XP_PER_LEVEL) * 100

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
        <ProfileHeroBackground url={backgroundUrl} />

        {/* Full-height image overlay — light top → dark bottom (--gradient-image-overlay) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'var(--gradient-image-overlay)' }}
        />

        {/* Content anchored to bottom — Figma: flex-col justify-end gap-16px p-16px */}
        <div className="absolute inset-0 flex flex-col justify-end gap-[var(--space-5)] p-[var(--space-5)]">

          {/* Details row — Figma I105:628;105:535 */}
          <div className="flex items-center gap-[var(--space-5)] w-full">
            <UserAvatar avatarUrl={avatarUrl} username={username} size={56} bg="border" />

            {/* Name + stats — Figma I105:628;105:537: flex-col gap-4px */}
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

          {/* Friendship XP indicator — Figma I105:628;177:992: flex-col gap-8px */}
          {!isSelf && (
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

        {/* Top gradient for back-button legibility */}
        <div
          className="absolute left-0 right-0 top-0 pointer-events-none"
          style={{
            height:     'calc(86px + env(safe-area-inset-top, 0px))',
            background: 'var(--gradient-hero-top-scrim)',
          }}
        />

        {/* Floating back button — Figma: bg-black border-border p-8px */}
        <div className="absolute z-20 pointer-events-none" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 18px)', left: 16 }}>
          <div
            className="pointer-events-auto flex items-center bg-black border border-border p-2 overflow-hidden"
            style={{ boxShadow: '0px 0px 20px 12px rgba(0,0,0,0.1)' }}
          >
            <button
              onClick={goBack}
              aria-label="Back"
              className="flex items-center justify-center flex-shrink-0"
              style={{ width: 24, height: 24 }}
            >
              <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Status ticker — full-width row between hero and body ──────────── */}
      {status && <TickerBanner text={status} />}

      {/* ── Body — Figma 57:172: flex-col items-center px-16px py-16px ── */}
      <div
        className="flex-1 overflow-y-auto nexus-scroll flex flex-col items-center px-4 py-4"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
      >
        {/* Friend action button — Figma 57:246 */}
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
      </div>
    </>
  )
}
