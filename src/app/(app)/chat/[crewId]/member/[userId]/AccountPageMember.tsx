'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { isSupabaseStorage, resolveAvatarUrl } from '@/components/ui/Avatar'
import { useSlideBack } from '@/components/ui/SlidePage'
import { MarqueeBanner } from '@/components/ui/MarqueeBanner'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { Heart } from 'pixelarticons/react/Heart'
import { TokeCircle } from 'pixelarticons/react/TokeCircle'
import { Message } from 'pixelarticons/react/Message'
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
  viewerCoins:      number
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

export function AccountPageMember({
  userId,
  viewerId,
  isGuest,
  username,
  avatarUrl,
  backgroundUrl,
  status,
  joinedAt,
  friendship,
  globalGroupChats,
  globalMessages,
  friendshipXP,
  viewerCoins,
}: Props) {
  const goBack = useSlideBack()
  const isSelf = userId === viewerId

  const [friendState, setFriendState] = useState<FriendState>(() =>
    isSelf ? 'accepted' : deriveFriendState(friendship, viewerId)
  )
  const [friendshipId]        = useState(friendship?.id ?? null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const initial    = username[0]?.toUpperCase() ?? '?'
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
      {/* ── Hero — 280px + safe-area-top ──────────────────────────────────── */}
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

        {/* Gradient: transparent → black */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 48.668%, rgba(0,0,0,0.8) 82.216%, rgb(0,0,0) 100%)' }}
        />

        {/* Content pinned to bottom */}
        <div className="absolute inset-0 flex flex-col justify-end gap-[var(--space-5)] p-[var(--space-5)]">

          {/* Avatar + name row */}
          <div className="flex items-center gap-[var(--space-5)] w-full">
            {/* 56px circle avatar */}
            <div
              className="flex-shrink-0 relative overflow-hidden rounded-full"
              style={{ width: 56, height: 56, background: 'var(--color-primary)' }}
            >
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
            <div className="flex-1 min-w-0 flex flex-col justify-center leading-none" style={{ gap: 'var(--space-2)' }}>
              {joinedYear && (
                <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
                  Member Since {joinedYear}
                </p>
              )}
              <p
                className="font-body font-bold truncate"
                style={{ fontSize: 'var(--text-xl)', fontVariationSettings: '"opsz" 14', color: 'var(--color-primary)' }}
              >
                {username}
              </p>
              <p className="font-silkscreen" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
                {globalGroupChats} group chat{globalGroupChats !== 1 ? 's' : ''} · {globalMessages.toLocaleString()} msg
              </p>
            </div>
          </div>

          {/* Friendship XP bar (hidden for self) */}
          {!isSelf && (
            <div className="flex flex-col w-full" style={{ gap: 'var(--space-3)' }}>
              <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)' }}>
                <span style={{ color: 'var(--color-secondary)' }}>Friendship lv {bondLevel}</span>
                <span style={{ color: 'var(--color-tertiary)' }}>{` · ${bondXPInLvl} / 100XP`}</span>
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
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.25) 46.158%, rgba(0,0,0,0) 100%)',
          }}
        />

        {/* Top bar — back (left) + glass stat badges (right) */}
        <div
          className="absolute z-20 left-0 right-0 flex items-center justify-between pointer-events-none"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 18px)', paddingLeft: 16, paddingRight: 16 }}
        >
          {/* Back button — Figma: transparent bg, glass drop-shadow */}
          <div
            className="pointer-events-auto flex items-center p-2 overflow-hidden"
            style={{ filter: 'drop-shadow(0px 0px 10px rgba(0,0,0,0.4))' }}
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

          {/* Glass stat badges */}
          <div className="flex items-center" style={{ gap: 4 }}>
            {/* Viewer's coins */}
            <div
              className="flex items-center justify-center rounded-[4px]"
              style={{ gap: 4, padding: 4, backdropFilter: 'blur(7px)', filter: 'drop-shadow(0px 0px 10px rgba(0,0,0,0.1))' }}
            >
              <TokeCircle style={{ width: 12, height: 12, color: 'var(--color-primary)' }} aria-hidden="true" />
              <span className="font-silkscreen leading-none pb-[2px]" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary)' }}>
                {viewerCoins.toLocaleString()}
              </span>
            </div>
            {/* Pair friendship XP */}
            <div
              className="flex items-center justify-center rounded-[4px]"
              style={{ gap: 4, padding: '4px 8px', backdropFilter: 'blur(7px)', filter: 'drop-shadow(0px 0px 10px rgba(0,0,0,0.1))' }}
            >
              <Heart style={{ width: 12, height: 12, color: 'var(--color-primary)' }} aria-hidden="true" />
              <span className="font-silkscreen leading-none pb-[2px]" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary)' }}>
                {bondTotal}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Status ticker ─────────────────────────────────────────────────────── */}
      {status && (
        <MarqueeBanner
          text={status}
          icon={<Message style={{ width: 8, height: 8, color: 'var(--color-tertiary)' }} aria-hidden="true" />}
          quoted
        />
      )}

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto nexus-scroll flex flex-col px-4 py-4"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
      >
        {!isSelf && (
          <div className="w-full flex flex-col gap-3">
            {error && (
              <p className="font-silkscreen text-[8px] text-[#ef4444] text-center">{error}</p>
            )}

            {friendState === 'none' && (
              <button
                onClick={handleAddFriend}
                disabled={loading || isGuest}
                className="w-full h-[48px] flex items-center justify-center gap-[8px] border border-purple overflow-hidden px-[var(--space-5)] py-[var(--space-3)] disabled:opacity-40 active:opacity-70 transition-opacity"
              >
                <Heart style={{ width: 16, height: 16, color: 'var(--color-purple)' }} aria-hidden="true" />
                <span className="font-pixel text-[length:var(--text-mini)] text-purple leading-none whitespace-nowrap">
                  {loading ? 'SENDING...' : 'ADD FRIEND'}
                </span>
              </button>
            )}

            {friendState === 'pending_sent' && (
              <div className="w-full h-[48px] flex items-center justify-center border border-border">
                <span className="font-silkscreen text-[9px] text-tertiary tracking-[0.2px]">REQUEST SENT</span>
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
              <p className="font-silkscreen text-[8px] text-tertiary text-center leading-relaxed">
                Sign in with Google to add companions
              </p>
            )}
          </div>
        )}
      </div>
    </>
  )
}
