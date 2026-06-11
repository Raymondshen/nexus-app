'use client'

import { useState } from 'react'
import Image from 'next/image'
import { isSupabaseStorage, resolveAvatarUrl } from '@/components/ui/Avatar'
import { format, parseISO } from 'date-fns'
import { useSlideBack } from '@/components/ui/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { UserPlus } from 'pixelarticons/react/UserPlus'
import { sendFriendRequestAction, acceptFriendRequestAction } from '@/app/(app)/friends/actions'
import { PixelSprite, spriteInfoFor } from '@/components/game/PixelSprite'
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
  crewId:           string
  userId:           string
  viewerId:         string
  isGuest:          boolean
  username:         string
  avatarUrl:        string | null
  birthday:         string | null
  avatarClass:      AvatarClass | null
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
      {/* ── Header ── */}
      <div
        className="flex-shrink-0 bg-black border-b border-border px-4 pb-2"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}
      >
        <div className="flex items-center h-10 gap-2">
          <button
            onClick={goBack}
            aria-label="Back"
            className="flex-shrink-0 flex items-center justify-center"
            style={{ width: 24, height: 40 }}
          >
            <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-purple)' }} aria-hidden="true" />
          </button>
          <h1 className="font-pixel text-[18px] text-primary leading-none whitespace-nowrap">SQUAD PROFILE</h1>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto nexus-scroll">
        <div className="flex flex-col items-center gap-6 px-4 py-4">

          {/* ── Profile banner card ── */}
          <div className="bg-surface border border-border rounded-[8px] p-4 flex items-center gap-4 w-full">
            {/* Avatar 48×48 */}
            <div className="relative w-12 h-12 bg-surface overflow-hidden flex-shrink-0">
              {avatarUrl ? (
                <Image
                  src={resolveAvatarUrl(avatarUrl, 48)}
                  alt={username}
                  fill
                  sizes="48px"
                  className="object-cover"
                  unoptimized={isSupabaseStorage(avatarUrl)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="font-pixel text-[12px] text-purple">{initial}</span>
                </div>
              )}
            </div>
            {/* Text details */}
            <div className="flex-1 min-w-0 flex flex-col gap-1 justify-center">
              {joinedYear && (
                <p className="font-silkscreen text-[8px] text-tertiary leading-none">
                  Member Since {joinedYear}
                </p>
              )}
              <p
                className="font-body font-bold text-[18px] text-primary leading-none truncate w-full"
                style={{ fontVariationSettings: '"opsz" 14' }}
              >
                {username}
              </p>
              <p className="font-silkscreen text-[8px] text-secondary leading-none w-full">
                {globalGroupChats} group chat{globalGroupChats !== 1 ? 's' : ''} · {globalMessages.toLocaleString()} msg
              </p>
            </div>
            {isSelf && (
              <span className="font-silkscreen text-[8px] text-purple leading-none flex-shrink-0">YOU</span>
            )}
          </div>

          {/* ── Sprite + Recruited by ── */}
          <div className="flex flex-col items-center gap-2 w-full">
            <div className="flex items-center justify-center">
              {spriteInfo ? (
                <PixelSprite
                  spriteId={spriteInfo.id}
                  nativePx={spriteInfo.nativePx}
                  scale={4}
                  animate
                />
              ) : (
                <div className="w-20 h-20 bg-surface overflow-hidden flex items-center justify-center">
                  {avatarUrl ? (
                    <Image
                      src={resolveAvatarUrl(avatarUrl, 80)}
                      alt={username}
                      width={80}
                      height={80}
                      className="object-cover"
                      unoptimized={isSupabaseStorage(avatarUrl)}
                    />
                  ) : (
                    <span className="font-pixel text-[22px] text-purple">{initial}</span>
                  )}
                </div>
              )}
            </div>
            {inviterUsername && (
              <p className="font-silkscreen text-[8px] text-center leading-none">
                <span style={{ color: 'var(--color-tertiary)' }}>Recruited by: </span>
                <span className="text-primary">{inviterUsername}</span>
              </p>
            )}
          </div>

          {/* ── Stats row — two columns ── */}
          <div className="flex gap-2 items-start w-full">
            {/* Left column */}
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <p className="font-silkscreen text-[11px] leading-none">
                <span style={{ color: 'var(--color-tertiary)' }}>Class: </span>
                <span className="text-primary">{classLabel}</span>
              </p>
              {birthdayStr && (
                <p className="font-silkscreen text-[11px] leading-none">
                  <span style={{ color: 'var(--color-tertiary)' }}>Born: </span>
                  <span className="text-primary">{birthdayStr}</span>
                </p>
              )}
            </div>
            {/* Right column */}
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <p className="font-silkscreen text-[11px] leading-none">
                <span style={{ color: 'var(--color-tertiary)' }}>Messages sent: </span>
                <span className="text-primary">{msgCount.toLocaleString()}</span>
              </p>
              <p className="font-silkscreen text-[11px] leading-none">
                <span style={{ color: 'var(--color-tertiary)' }}>Xp earned: </span>
                <span className="text-primary">{totalXP.toLocaleString()}</span>
              </p>
            </div>
          </div>

          {/* ── Friend action ── */}
          {!isSelf && (
            <div className="w-full">
              {error && (
                <p className="font-silkscreen text-[8px] text-[#ef4444] mb-3 text-center">{error}</p>
              )}

              {friendState === 'none' && (
                <button
                  onClick={handleAddFriend}
                  disabled={loading || isGuest}
                  className="w-full h-12 flex items-center justify-center gap-2 border border-purple overflow-hidden px-4 py-2 disabled:opacity-40 active:opacity-70 transition-opacity"
                >
                  <UserPlus style={{ width: 16, height: 16, color: 'var(--color-purple)' }} aria-hidden="true" />
                  <span className="font-pixel text-[8px] text-purple leading-none whitespace-nowrap">
                    {loading ? 'SENDING...' : 'ADD FRIEND'}
                  </span>
                </button>
              )}

              {friendState === 'pending_sent' && (
                <div className="w-full h-12 flex items-center justify-center border border-border">
                  <span className="font-silkscreen text-[9px] text-muted tracking-[0.2px]">REQUEST SENT</span>
                </div>
              )}

              {friendState === 'pending_received' && (
                <button
                  onClick={handleAccept}
                  disabled={loading}
                  className="w-full h-12 flex items-center justify-center gap-2 border border-[#22c55e] px-4 py-2 disabled:opacity-40 active:opacity-70 transition-opacity"
                >
                  <span className="font-pixel text-[8px] text-[#22c55e] leading-none">
                    {loading ? '...' : 'ACCEPT'}
                  </span>
                </button>
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

          <div style={{ height: 'max(env(safe-area-inset-bottom), 16px)' }} />
        </div>
      </div>
    </>
  )
}
