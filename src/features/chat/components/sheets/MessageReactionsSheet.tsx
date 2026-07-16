'use client'

import type { Profile } from '@/types'
import { BottomSheet } from '@/shared/components/ui/sheet/BottomSheet'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { LottieReactionIcon } from '@/shared/components/ui/LottieReactionIcon'
import { REACTION_LOTTIE_MAP, REACTION_LABEL_MAP } from '@/shared/constants/config'

type ReactorProfile = Pick<Profile, 'id' | 'username' | 'avatar_url'>

interface MessageReactionsSheetProps {
  /** [emoji, userIds][], already sorted by reaction count desc — see MessageBubble's sortedReactions. */
  reactions:     [string, string[]][]
  profiles:      Record<string, ReactorProfile>
  onlineUserIds: Set<string>
  onClose:       () => void
}

// Figma 537:2202 "chat - msgBubbleSheet" — opened by long-pressing a reaction pill
// (MsgReactionPills, MessageBubble.tsx). Lists every emoji reacted to the message and
// who reacted with each, grouped in the same order as the pill row above the message.
export function MessageReactionsSheet({ reactions, profiles, onlineUserIds, onClose }: MessageReactionsSheetProps) {
  return (
    <BottomSheet onClose={onClose} zIndex={90} maxHeight="70vh" dismissOnPointerDown>
      <div
        className="flex flex-col flex-1 min-h-0 overflow-y-auto nexus-scroll"
        style={{
          gap: 'var(--x5)',
          paddingLeft: 'var(--md)',
          paddingRight: 'var(--md)',
          paddingBottom: 'max(env(safe-area-inset-bottom), var(--x8))',
        }}
      >
        <p
          className="font-body font-bold leading-none flex-shrink-0"
          style={{ fontSize: 'var(--md)', color: 'var(--color-primary)', fontVariationSettings: '"opsz" 14' }}
        >
          Friends Reacted
        </p>

        {reactions.map(([emoji, userIds]) => {
          const lottieSrc = REACTION_LOTTIE_MAP[emoji]
          const label = REACTION_LABEL_MAP[emoji] ?? emoji

          return (
            <div
              key={emoji}
              className="flex flex-col items-center w-full flex-shrink-0"
              style={{ background: 'var(--color-surface-elevated)', borderRadius: 'var(--x3)', padding: 'var(--x5)', gap: 'var(--x5)' }}
            >
              <div className="flex items-center w-full" style={{ gap: 'var(--x3)' }}>
                {lottieSrc ? (
                  <LottieReactionIcon src={lottieSrc} size={20} />
                ) : (
                  <span style={{ width: 20, height: 20, fontSize: 16, lineHeight: '20px', textAlign: 'center' }}>
                    {emoji}
                  </span>
                )}
                <span
                  className="font-body font-semibold flex-1"
                  style={{ fontSize: 'var(--sm)', color: 'var(--color-primary)', letterSpacing: '0.2px', fontVariationSettings: '"opsz" 14' }}
                >
                  {label}
                </span>
              </div>

              <div className="w-full border-t" style={{ borderColor: 'var(--color-border-hover)' }} />

              <div className="flex flex-col w-full" style={{ gap: 'var(--x5)' }}>
                {userIds.map((userId) => {
                  const profile = profiles[userId]
                  const online = onlineUserIds.has(userId)
                  return (
                    <div key={userId} className="flex items-center w-full" style={{ gap: 'var(--x3)' }}>
                      <div className="relative flex-shrink-0">
                        <UserAvatar avatarUrl={profile?.avatar_url ?? null} username={profile?.username ?? null} size={24} />
                        {online && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#66bb6a] border-[1.5px] border-black" />
                        )}
                      </div>
                      <span
                        className="font-body font-semibold flex-1"
                        style={{ fontSize: 'var(--sm)', color: 'var(--color-primary)', letterSpacing: '0.2px', fontVariationSettings: '"opsz" 14' }}
                      >
                        {profile?.username ?? 'Unknown'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </BottomSheet>
  )
}
