'use client'

import { useEffect } from 'react'
import { useSlideBack } from '@/components/ui/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import Image from 'next/image'
import { isSupabaseStorage, resolveAvatarUrl } from '@/components/ui/Avatar'
import { useChatStore } from '@/store/chatStore'
import { createClient } from '@/lib/supabase/client'
import type { ActiveRaid } from '@/types'

interface DMOverlayBackProps {
  crewId:               string
  currentUserId:        string
  initialXP:            number
  initialRaid:          ActiveRaid | null
  friendUsername:       string
  friendAvatarUrl:      string | null
  friendId?:            string
}

export function DMOverlayBack({
  crewId,
  currentUserId,
  initialXP,
  initialRaid,
  friendUsername,
  friendAvatarUrl,
  friendId,
}: DMOverlayBackProps) {
  const goBack = useSlideBack()
  const { setCrewXP, setActiveRaid } = useChatStore()

  useEffect(() => {
    setCrewXP(initialXP)
    setActiveRaid(initialRaid)
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
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
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
        <div className="flex-shrink-0 w-6 h-6 overflow-hidden relative bg-border">
          {friendAvatarUrl ? (
            <Image
              src={resolveAvatarUrl(friendAvatarUrl, 24)}
              alt={friendUsername}
              fill
              sizes="24px"
              className="object-cover"
              priority
              unoptimized={isSupabaseStorage(friendAvatarUrl)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-pixel text-[8px] text-primary">
              {friendUsername[0]?.toUpperCase() ?? '?'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
