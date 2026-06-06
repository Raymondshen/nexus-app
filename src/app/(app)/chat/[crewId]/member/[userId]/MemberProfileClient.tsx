'use client'

import { useState } from 'react'
import Image from 'next/image'
import { format, parseISO } from 'date-fns'
import { useSlideBack } from '@/components/ui/SlidePage'
import { PixelSprite, spriteInfoFor } from '@/components/game/PixelSprite'
import { sendFriendRequestAction, acceptFriendRequestAction } from '@/app/(app)/friends/actions'
import type { AvatarClass } from '@/types'

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
  crewId:          string
  userId:          string
  viewerId:        string
  isGuest:         boolean
  username:        string
  avatarUrl:       string | null
  birthday:        string | null
  avatarClass:     AvatarClass | null
  msgCount:        number
  totalXP:         number
  friendship:      { id: string; requester_id: string; addressee_id: string; status: string } | null
  inviterUsername: string | null
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

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-5 gap-[6px] bg-surface border border-border">
      <span className="font-pixel text-[11px] text-primary leading-none">{value}</span>
      <span className="font-silkscreen text-[7px] text-muted leading-none tracking-[0.2px]">{label}</span>
    </div>
  )
}

export function MemberProfileClient({
  crewId,
  userId,
  viewerId,
  isGuest,
  username,
  avatarUrl,
  birthday,
  avatarClass,
  msgCount,
  totalXP,
  friendship,
  inviterUsername,
}: Props) {
  const goBack = useSlideBack()
  const isSelf = userId === viewerId

  const [friendState, setFriendState] = useState<FriendState>(() =>
    isSelf ? 'accepted' : deriveFriendState(friendship, viewerId)
  )
  const [friendshipId, setFriendshipId] = useState(friendship?.id ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const spriteInfo   = spriteInfoFor(avatarClass)
  const classLabel   = avatarClass ? (CLASS_LABELS[avatarClass] ?? avatarClass) : null
  const initial      = username[0]?.toUpperCase() ?? '?'
  const birthdayStr  = birthday
    ? format(parseISO(birthday), 'MMM d').toUpperCase()
    : '—'

  async function handleAddFriend() {
    if (loading) return
    setLoading(true)
    setError(null)
    const result = await sendFriendRequestAction(userId)
    setLoading(false)
    if (result.error) { setError(result.error); return }
    setFriendState('pending_sent')
  }

  async function handleAccept() {
    if (!friendshipId || loading) return
    setLoading(true)
    setError(null)
    const result = await acceptFriendRequestAction(friendshipId)
    setLoading(false)
    if (result.error) { setError(result.error); return }
    setFriendState('accepted')
  }

  return (
    <>
      {/* ── Header ── */}
      <div
        className="flex-shrink-0 flex items-center gap-3 px-4 pb-2 border-b border-border"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}
      >
        <button onClick={goBack} aria-label="Back" className="flex items-center">
          <i className="hn hn-angle-left-solid" style={{ fontSize: 24, color: 'var(--color-tertiary)' }} aria-hidden="true" />
        </button>
        <span className="font-pixel text-[12px] text-primary leading-none">PROFILE</span>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto">

        {/* Hero section */}
        <div className="flex flex-col items-center pt-10 pb-8 bg-[#0a0612] border-b border-border">

          {/* Sprite */}
          <div className="flex items-center justify-center" style={{ height: 96, width: 96 }}>
            {spriteInfo ? (
              <PixelSprite
                spriteId={spriteInfo.id}
                nativePx={spriteInfo.nativePx}
                scale={4}
                animate
              />
            ) : (
              // Placeholder grid when no sprite unlocked yet
              <div
                className="flex items-center justify-center"
                style={{ width: 96, height: 96, border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(10,6,18,0.8)' }}
              >
                <span className="font-pixel text-[20px] text-purple/40">?</span>
              </div>
            )}
          </div>

          {/* Avatar */}
          <div className="w-16 h-16 mt-4 bg-surface border border-border overflow-hidden flex-shrink-0 relative">
            {avatarUrl ? (
              <Image src={avatarUrl} alt={username} fill sizes="64px" className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="font-pixel text-[18px] text-purple">{initial}</span>
              </div>
            )}
          </div>

          {/* Name + class + recruited-by */}
          <div className="mt-4 flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <h1 className="font-pixel text-[14px] text-primary leading-none">{username}</h1>
              {isSelf && (
                <span className="font-silkscreen text-[6px] text-purple border border-purple px-1 py-[2px] leading-none">YOU</span>
              )}
            </div>
            {classLabel && (
              <span className="font-silkscreen text-[10px] text-purple leading-none tracking-[0.2px]">
                {classLabel.toUpperCase()}
              </span>
            )}
            {inviterUsername && (
              <span className="font-silkscreen text-[8px] leading-none tracking-[0.2px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                RECRUITED BY {inviterUsername.toUpperCase()}
              </span>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-[1px] bg-border mt-[1px]">
          <StatCard value={msgCount.toLocaleString()} label="MESSAGES" />
          <StatCard value={totalXP.toLocaleString()} label="XP EARNED" />
          <StatCard value={birthdayStr}              label="BIRTHDAY"  />
        </div>

        {/* Friend action */}
        {!isSelf && (
          <div className="px-4 pt-6 pb-8">
            {error && (
              <p className="font-silkscreen text-[8px] text-[#ef4444] mb-3 text-center">{error}</p>
            )}

            {friendState === 'none' && (
              <button
                onClick={handleAddFriend}
                disabled={loading || isGuest}
                className="w-full h-12 font-pixel text-[10px] border border-purple text-purple disabled:opacity-40 active:opacity-70 transition-opacity"
              >
                {loading ? 'SENDING...' : '⚔ ADD COMPANION'}
              </button>
            )}

            {friendState === 'pending_sent' && (
              <div className="w-full h-12 flex items-center justify-center border border-border">
                <span className="font-silkscreen text-[9px] text-muted tracking-[0.2px]">REQUEST SENT</span>
              </div>
            )}

            {friendState === 'pending_received' && (
              <div className="flex gap-3">
                <button
                  onClick={handleAccept}
                  disabled={loading}
                  className="flex-1 h-12 font-pixel text-[10px] border border-[#22c55e] text-[#22c55e] disabled:opacity-40 active:opacity-70 transition-opacity"
                >
                  {loading ? '...' : 'ACCEPT'}
                </button>
              </div>
            )}

            {friendState === 'accepted' && (
              <div className="w-full h-12 flex items-center justify-center border border-[#22c55e]/40">
                <span className="font-silkscreen text-[9px] text-[#22c55e] tracking-[0.2px]">COMPANIONS ✓</span>
              </div>
            )}

            {isGuest && friendState === 'none' && (
              <p className="font-silkscreen text-[8px] text-muted text-center mt-3 leading-relaxed">
                Sign in with Google to add companions
              </p>
            )}
          </div>
        )}
      </div>
    </>
  )
}
