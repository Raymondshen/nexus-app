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

const XP_PER_LEVEL = 500
function getLevelFromXP(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1
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
  joinedAt:        string | null
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
}: Props) {
  const goBack = useSlideBack()
  const isSelf = userId === viewerId

  const [friendState, setFriendState] = useState<FriendState>(() =>
    isSelf ? 'accepted' : deriveFriendState(friendship, viewerId)
  )
  const [friendshipId]    = useState(friendship?.id ?? null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const classLabel  = avatarClass ? (CLASS_LABELS[avatarClass] ?? avatarClass) : '???'
  const initial     = username[0]?.toUpperCase() ?? '?'
  const spriteInfo  = spriteInfoFor(avatarClass)
  const level       = getLevelFromXP(totalXP)
  const birthdayStr = birthday ? format(parseISO(birthday), 'MMM d').toLowerCase() : null
  const joinedYear  = joinedAt ? new Date(joinedAt).getFullYear() : null

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

  function Avatar({ size }: { size: 80 | 48 }) {
    const wh     = size === 80 ? 'w-[80px] h-[80px]' : 'w-[48px] h-[48px]'
    const txtSz  = size === 80 ? 'text-[22px]' : 'text-[13px]'
    return (
      <div className={`${wh} bg-surface overflow-hidden relative flex-shrink-0`}>
        {avatarUrl ? (
          <Image src={resolveAvatarUrl(avatarUrl, size)} alt={username} fill sizes={`${size}px`} className="object-cover" unoptimized={isSupabaseStorage(avatarUrl)} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className={`font-pixel ${txtSz} text-purple`}>{initial}</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {/* ── Header ── */}
      <div
        className="flex-shrink-0 border-b border-border px-4 py-[8px]"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}
      >
        <div className="flex items-center gap-[8px] h-[40px]">
          <button
            onClick={goBack}
            aria-label="Back"
            style={{ width: 44 }}
            className="flex items-center"
          >
            <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-tertiary)' }} aria-hidden="true" />
          </button>
          <span className="font-pixel text-[18px] text-primary leading-none whitespace-nowrap">PROFILE</span>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto nexus-scroll">
        <div className="flex flex-col items-center gap-[24px] px-4 py-4">

          {/* ── Hero sprite ── */}
          <div className="flex flex-col items-center gap-[8px] w-full">
            <div
              className="w-full flex items-center justify-center"
              style={{ minHeight: 128, background: 'radial-gradient(ellipse at center, rgba(191,95,255,0.12) 0%, transparent 70%)' }}
            >
              {spriteInfo ? (
                <PixelSprite
                  spriteId={spriteInfo.id}
                  nativePx={spriteInfo.nativePx}
                  scale={4}
                  animate
                />
              ) : (
                <Avatar size={80} />
              )}
            </div>
            {inviterUsername && (
              <p className="font-silkscreen text-[8px] text-center leading-none">
                <span style={{ color: '#a1a1aa' }}>Recruited by: </span>
                <span className="text-primary">{inviterUsername}</span>
              </p>
            )}
          </div>

          {/* ── Stats list ── */}
          <div className="flex flex-col gap-[8px] items-start w-full">
            <p className="font-silkscreen text-[11px] text-primary leading-none">
              {`Lv.${level} · ${classLabel}`}
            </p>
            {inviterUsername && (
              <p className="font-silkscreen text-[11px] leading-none">
                <span style={{ color: '#a1a1aa' }}>Recruited by: </span>
                <span className="text-primary">{inviterUsername}</span>
              </p>
            )}
            <p className="font-silkscreen text-[11px] leading-none">
              <span className="text-primary">{`${msgCount.toLocaleString()} `}</span>
              <span style={{ color: '#a1a1aa' }}>Messages sent</span>
            </p>
            <p className="font-silkscreen text-[11px] leading-none">
              <span className="text-primary">{`${totalXP.toLocaleString()} `}</span>
              <span style={{ color: '#a1a1aa' }}>Xp earned</span>
            </p>
            {birthdayStr && (
              <p className="font-silkscreen text-[11px] leading-none">
                <span className="text-primary">{`${birthdayStr} `}</span>
                <span style={{ color: '#a1a1aa' }}>birthday</span>
              </p>
            )}
          </div>

          {/* ── Profile banner card ── */}
          <div className="w-full bg-surface border border-border rounded-[8px] p-4">
            <div className="flex gap-4 items-center w-full">
              <Avatar size={48} />
              <div className="flex flex-col gap-[4px] items-start justify-center flex-1 min-w-0">
                <p
                  className="font-silkscreen text-[8px] leading-none w-full"
                  style={{ color: 'var(--color-tertiary)' }}
                >
                  {joinedYear ? `Member Since ${joinedYear}` : 'Member'}
                </p>
                <p
                  className="font-body font-bold text-[18px] text-primary leading-none w-full truncate"
                  style={{ fontVariationSettings: '"opsz" 14' }}
                >
                  {username}
                </p>
                <p
                  className="font-silkscreen text-[8px] leading-none w-full"
                  style={{ color: 'var(--color-secondary)' }}
                >
                  {`${msgCount.toLocaleString()} msg · Lv.${level}`}
                </p>
              </div>
            </div>
          </div>

          {/* ── Divider ── */}
          <div className="w-full border-t border-border" />

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
                  className="w-full h-[48px] flex items-center justify-center gap-[8px] border border-purple overflow-hidden px-4 py-[8px] disabled:opacity-40 active:opacity-70 transition-opacity"
                >
                  <UserPlus style={{ width: 16, height: 16, color: 'var(--color-purple)' }} aria-hidden="true" />
                  <span className="font-pixel text-[8px] text-purple leading-none whitespace-nowrap">
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
                  className="w-full h-[48px] flex items-center justify-center gap-[8px] border border-[#22c55e] px-4 py-[8px] disabled:opacity-40 active:opacity-70 transition-opacity"
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
                <p className="font-silkscreen text-[8px] text-muted text-center mt-3 leading-relaxed">
                  Sign in with Google to add companions
                </p>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  )
}
