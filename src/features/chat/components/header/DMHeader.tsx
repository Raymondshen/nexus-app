'use client'

import { useEffect } from 'react'
import { useSlideBack } from '@/app/layouts/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { useChatStore } from '@/store/chatStore'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { createClient } from '@/shared/supabase/client'

interface DMHeaderProps {
  crewId:          string
  currentUserId:   string
  initialXP:       number
  friendUsername:  string
  friendAvatarUrl: string | null
}

export function DMHeader({
  crewId,
  currentUserId,
  initialXP,
  friendUsername,
  friendAvatarUrl,
}: DMHeaderProps) {
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
      className="bg-black border-b border-border px-4 pb-4 flex-shrink-0"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
    >
      <div className="flex items-center h-10 gap-3">
        <button
          onClick={goBack}
          aria-label="Back"
          className="flex-shrink-0 flex items-center justify-center"
          style={{ width: 24, height: 40 }}
        >
          <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-purple)' }} aria-hidden="true" />
        </button>

        <UserAvatar avatarUrl={friendAvatarUrl} username={friendUsername} size={32} shape="square" bg="border" initialColor="primary" priority />

        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <h1 className="font-pixel text-[14px] text-primary truncate leading-none underline">
            {friendUsername.toUpperCase()}
          </h1>
          <span className="font-silkscreen text-[8px] text-muted leading-none mt-1">1:1 CHAT</span>
        </div>
      </div>
    </div>
  )
}
