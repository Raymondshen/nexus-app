'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSlideBack } from '@/components/ui/SlidePage'
import { AnimatePresence } from 'framer-motion'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { Bell } from 'pixelarticons/react/Bell'
import { BellOff } from 'pixelarticons/react/BellOff'
import { UserPlus } from 'pixelarticons/react/UserPlus'
import { createClient } from '@/lib/supabase/client'
import { NotifSheet, type NotifPrefs } from '@/components/chat/NotifSheet'
import { ShareModal } from '@/components/chat/ShareModal'
import type { Crew } from '@/types'

interface FloatingBackButtonProps {
  crewId:        string
  crew:          Pick<Crew, 'name' | 'invite_code'>
  currentUserId: string
}

export function FloatingBackButton({ crewId, crew, currentUserId }: FloatingBackButtonProps) {
  const goBack = useSlideBack()

  const [showShare,  setShowShare]  = useState(false)
  const [showNotif,  setShowNotif]  = useState(false)
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>({ messages: true, raids: true, victory: true, mentions: true })

  useEffect(() => {
    const from = sessionStorage.getItem('nexus_chat_from')
    sessionStorage.removeItem('nexus_chat_from')
    if (from) return

    const current = window.location.pathname + window.location.search
    window.history.replaceState({ __NA: true }, '', '/home')
    window.history.pushState(null, '', current)
  }, [])

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('crew_notification_preferences')
        .select('notif_messages, notif_raids, notif_victory, notif_mentions')
        .eq('user_id', currentUserId)
        .eq('crew_id', crewId)
        .maybeSingle()
      if (data) {
        setNotifPrefs({
          messages: data.notif_messages as boolean,
          raids:    data.notif_raids    as boolean,
          victory:  data.notif_victory  as boolean,
          mentions: data.notif_mentions as boolean,
        })
      }
    }
    load()
  }, [currentUserId, crewId])

  const handleToggleNotif = useCallback(async (type: keyof NotifPrefs) => {
    const next = { ...notifPrefs, [type]: !notifPrefs[type] }
    setNotifPrefs(next)
    const supabase = createClient()
    await supabase
      .from('crew_notification_preferences')
      .upsert(
        {
          user_id:        currentUserId,
          crew_id:        crewId,
          notif_messages: next.messages,
          notif_raids:    next.raids,
          notif_victory:  next.victory,
          notif_mentions: next.mentions,
          updated_at:     new Date().toISOString(),
        },
        { onConflict: 'user_id,crew_id' },
      )
  }, [notifPrefs, currentUserId, crewId])

  const allMuted = !notifPrefs.messages && !notifPrefs.raids && !notifPrefs.victory

  return (
    <>
      {/* Floating gradient top nav */}
      <div
        className="absolute top-0 left-0 right-0 z-[60] flex items-start pointer-events-none"
        style={{
          height: 88,
          paddingTop: 'env(safe-area-inset-top, 0px)',
          background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.25) 46.158%, rgba(0,0,0,0) 100%)',
        }}
      >
        <div
          className="flex items-center justify-between w-full pointer-events-none"
          style={{ padding: '8px 16px' }}
        >
          {/* Back button */}
          <button
            onClick={goBack}
            aria-label="Go back"
            className="pointer-events-auto flex items-center justify-center border border-border flex-shrink-0 overflow-hidden"
            style={{
              padding: 8,
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              boxShadow: '0px 0px 20px 12px rgba(0,0,0,0.1)',
            }}
          >
            <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-purple)' }} aria-hidden="true" />
          </button>

          {/* Right actions */}
          <div className="flex items-center pointer-events-auto" style={{ gap: 16 }}>
            <button
              onClick={() => setShowNotif(true)}
              aria-label={allMuted ? 'Notifications muted' : 'Notification settings'}
              className="flex items-center justify-center border border-border overflow-hidden flex-shrink-0"
              style={{
                padding: 8,
                background: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                boxShadow: '0px 0px 20px 12px rgba(0,0,0,0.1)',
              }}
            >
              {allMuted
                ? <BellOff style={{ width: 24, height: 24, color: 'var(--color-tertiary)' }} aria-hidden="true" />
                : <Bell   style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
              }
            </button>

            <button
              onClick={() => setShowShare(true)}
              aria-label="Invite members"
              className="flex items-center justify-center border border-border overflow-hidden flex-shrink-0"
              style={{
                padding: 8,
                background: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                boxShadow: '0px 0px 20px 12px rgba(0,0,0,0.1)',
              }}
            >
              <UserPlus style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showShare && <ShareModal crew={crew} onClose={() => setShowShare(false)} />}
        {showNotif && (
          <NotifSheet
            prefs={notifPrefs}
            onToggle={handleToggleNotif}
            onClose={() => setShowNotif(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
