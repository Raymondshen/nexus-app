'use client'

import { useEffect } from 'react'
import { useSlideBack } from '@/components/ui/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import Image from 'next/image'
import { isSupabaseStorage, resolveAvatarUrl } from '@/components/ui/Avatar'
import { useChatStore } from '@/store/chatStore'
import { createClient } from '@/lib/supabase/client'

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

        <div className="flex-shrink-0 w-8 h-8 overflow-hidden relative bg-border">
          {friendAvatarUrl ? (
            <Image src={resolveAvatarUrl(friendAvatarUrl, 32)} alt={friendUsername} fill sizes="32px" className="object-cover" priority unoptimized={isSupabaseStorage(friendAvatarUrl)} />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-pixel text-[10px] text-primary">
              {friendUsername[0]?.toUpperCase() ?? '?'}
            </div>
          )}
        </div>

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
