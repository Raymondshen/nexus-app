'use client'

import { useEffect } from 'react'
import { useSlideBack } from '@/components/ui/SlidePage'
import Image from 'next/image'
import { useChatStore } from '@/store/chatStore'
import { createClient } from '@/lib/supabase/client'
import type { ActiveRaid } from '@/types'
import { formatDistanceToNow } from 'date-fns'

interface DMHeaderProps {
  crewId:          string
  currentUserId:   string
  initialXP:       number
  initialRaid:     ActiveRaid | null
  friendUsername:  string
  friendAvatarUrl: string | null
}

export function DMHeader({
  crewId,
  currentUserId,
  initialXP,
  initialRaid,
  friendUsername,
  friendAvatarUrl,
}: DMHeaderProps) {
  const goBack = useSlideBack()
  const { setCrewXP, setActiveRaid, activeRaid } = useChatStore()

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
          <i className="hn hn-angle-left-solid" style={{ fontSize: 24, color: 'var(--color-tertiary)' }} aria-hidden="true" />
        </button>

        <div className="flex-shrink-0 w-8 h-8 overflow-hidden relative bg-border">
          {friendAvatarUrl ? (
            <Image src={friendAvatarUrl} alt={friendUsername} fill sizes="32px" className="object-cover" />
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

      {activeRaid && !activeRaid.defeated_at && (
        <div className="flex items-center gap-2 mt-2 bg-[#2d0a0a] border border-[#ff4444]/40 px-2 py-1">
          <span className="font-pixel text-[8px] text-[#ff4444]">💀 BOSS ACTIVE</span>
          <span className="font-pixel text-[7px] text-[#ff4444]/70">
            {formatDistanceToNow(new Date(activeRaid.expires_at), { addSuffix: true }).toUpperCase()}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <div className="h-1 w-16 bg-[#1a0000] border border-[#ff4444]/20">
              <div
                className="h-full bg-[#ff4444] transition-all duration-500"
                style={{ width: `${Math.round((activeRaid.current_hp / activeRaid.max_hp) * 100)}%` }}
              />
            </div>
            <span className="font-pixel text-[7px] text-[#ff4444]/70">HP</span>
          </div>
        </div>
      )}
    </div>
  )
}
