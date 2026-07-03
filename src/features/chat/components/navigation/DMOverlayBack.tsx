'use client'

import { useEffect } from 'react'
import { useSlideBack } from '@/app/layouts/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { useChatStore } from '@/store/chatStore'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { createClient } from '@/shared/supabase/client'

interface DMOverlayBackProps {
  crewId:               string
  currentUserId:        string
  initialXP:            number
  friendUsername:       string
  friendAvatarUrl:      string | null
  friendId?:            string
}

export function DMOverlayBack({
  crewId,
  currentUserId,
  initialXP,
  friendUsername,
  friendAvatarUrl,
  friendId,
}: DMOverlayBackProps) {
  const goBack = useSlideBack()
  const { setCrewXP } = useChatStore()

  useEffect(() => {
    setCrewXP(initialXP)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const supabase = createClient()
    const update = async () => {
      try {
        await supabase
          .from('crew_members')
          .update({ last_seen: new Date().toISOString() })
          .eq('crew_id', crewId)
          .eq('user_id', currentUserId)
      } catch {
        // Presence is best-effort
      }
    }
    update()
    const interval = setInterval(update, 60_000)
    return () => clearInterval(interval)
  }, [crewId, currentUserId])

  return (
    <div
      className="absolute z-20 pointer-events-none"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)', left: '16px' }}
    >
      <div
        className="pointer-events-auto flex items-center gap-2 border border-purple p-2 overflow-hidden"
        style={{
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(7px)',
          WebkitBackdropFilter: 'blur(7px)',
          boxShadow: '0px 0px 20px 12px rgba(0,0,0,0.1)',
        }}
      >
        <button
          onClick={goBack}
          aria-label="Back"
          className="flex items-center justify-center flex-shrink-0"
          style={{ width: 24, height: 24 }}
        >
          <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-purple)' }} aria-hidden="true" />
        </button>
        <UserAvatar avatarUrl={friendAvatarUrl} username={friendUsername} size={24} shape="square" bg="border" initialColor="primary" priority />
      </div>
    </div>
  )
}
