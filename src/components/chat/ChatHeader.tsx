'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSlideBack } from '@/components/ui/SlidePage'
import { motion, AnimatePresence } from 'framer-motion'
import { useChatStore } from '@/store/chatStore'
import { createClient } from '@/lib/supabase/client'
import type { Crew } from '@/types'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { Bell } from 'pixelarticons/react/Bell'
import { BellOff } from 'pixelarticons/react/BellOff'
import { UserPlus } from 'pixelarticons/react/UserPlus'
import { Copy } from 'pixelarticons/react/Copy'
import { Check } from 'pixelarticons/react/Check'
import { Calendar } from 'pixelarticons/react/Calendar'
import { NotifSheet, type NotifPrefs } from '@/components/chat/NotifSheet'

type MemberBirthday = { username: string; birthday: string }

function getNextBirthday(members: MemberBirthday[]): { username: string; label: string } | null {
  if (!members.length) return null
  const today = new Date()
  const thisYear = today.getFullYear()
  // Map each member to their next occurrence of their birthday
  const ranked = members.map(({ username, birthday }) => {
    const [, mm, dd] = birthday.split('-').map(Number)
    let next = new Date(thisYear, mm - 1, dd)
    if (next < today) next = new Date(thisYear + 1, mm - 1, dd)
    const diff = Math.ceil((next.getTime() - today.getTime()) / 86_400_000)
    return { username, next, diff, mm, dd }
  }).sort((a, b) => a.diff - b.diff)

  const top = ranked[0]
  const monthName = top.next.toLocaleString('default', { month: 'short' })
  const label = top.diff === 0
    ? `🎂 Today!`
    : top.diff === 1
    ? `🎂 Tomorrow`
    : `🎂 ${monthName} ${top.dd}`
  return { username: top.username, label }
}

interface ChatHeaderProps {
  crew:             Crew
  initialXP:        number
  currentUserId:    string
  crewId:           string
  memberBirthdays?: MemberBirthday[]
  isDev?:           boolean
}

// ─── Share modal ─────────────────────────────────────────────────────────────

function ShareModal({ crew, onClose }: { crew: Crew; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`Come join my squad on Nexus app ${crew.invite_code}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API not available
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="relative w-full max-w-[480px] bg-surface border-t border-border-hover flex flex-col gap-6 items-center p-4"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-col gap-2 items-start w-full">
          <p className="font-pixel text-[8px] text-tertiary leading-none whitespace-nowrap">
            SQUAD SH**!
          </p>
          <p
            className="font-body font-bold text-[18px] text-primary leading-none whitespace-nowrap"
            style={{ fontVariationSettings: '"opsz" 14' }}
          >
            Invite Your Squad
          </p>
        </div>

        {/* Invite code card */}
        <div className="flex items-center justify-between bg-[rgba(168,85,247,0.1)] border border-purple p-4 w-full overflow-hidden">
          <p
            className="font-silkscreen text-[24px] text-purple leading-none tracking-[0.2px]"
            style={{ textShadow: '0px 0px 3px var(--color-purple)' }}
          >
            {crew.invite_code}
          </p>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-4 py-3 flex-shrink-0 transition-colors duration-150"
            style={copied
              ? { backgroundColor: '#22c55e', boxShadow: '2px 2px 0px 0px rgba(34,197,94,0.5)' }
              : { backgroundColor: 'var(--color-purple)' }
            }
          >
            {copied ? (
              <>
                <Check style={{ width: 12, height: 12, color: 'white' }} aria-hidden="true" />
                <span className="font-silkscreen text-[11px] text-white leading-none whitespace-nowrap">copied</span>
              </>
            ) : (
              <>
                <Copy style={{ width: 12, height: 12, color: 'white' }} aria-hidden="true" />
                <span className="font-silkscreen text-[11px] text-white leading-none whitespace-nowrap">Copy Code</span>
              </>
            )}
          </button>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="h-12 w-full flex items-center justify-center font-pixel text-[8px] text-tertiary transition-colors active:text-primary"
        >
          CLOSE
        </button>
      </motion.div>
    </motion.div>
  )
}

// ─── ChatHeader ───────────────────────────────────────────────────────────────

export function ChatHeader({
  crew,
  initialXP,
  currentUserId,
  crewId,
  memberBirthdays = [],
  isDev = false,
}: ChatHeaderProps) {
  const router = useRouter()
  const goBack = useSlideBack()
  const { setCrewXP, crewName: storeCrewName, setCrewName } = useChatStore()
  const [showShare,      setShowShare]      = useState(false)
  const [showNotif,      setShowNotif]      = useState(false)
  const [notifPrefs,     setNotifPrefs]     = useState<NotifPrefs>({ messages: true, mentions: true })
  const [devMode,        setDevMode]        = useState(false)
  const [eventsEnabled,  setEventsEnabled]  = useState(false)

  const liveCrewName = storeCrewName || crew.name

  useEffect(() => {
    setDevMode(localStorage.getItem('nexus_dev_mode') === '1')
    setEventsEnabled(localStorage.getItem('nexus_events_enabled') === '1')
  }, [])

  // Seed the store with the server-fetched name on mount
  useEffect(() => {
    setCrewName(crew.name)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCrewXP(initialXP)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update last_seen every 60s for accurate server-side initial state.
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
        // Silently fail — presence is best-effort
      }
    }
    update()
    const interval = setInterval(update, 60_000)
    return () => clearInterval(interval)
  }, [crewId, currentUserId])

  // Load per-crew notification preferences on mount
  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('crew_notification_preferences')
        .select('notif_messages, notif_mentions')
        .eq('user_id', currentUserId)
        .eq('crew_id', crewId)
        .maybeSingle()
      if (data) {
        setNotifPrefs({
          messages: data.notif_messages as boolean,
          mentions: data.notif_mentions as boolean,
        })
      }
    }
    load()
  }, [currentUserId, crewId])

  const handleToggleNotif = useCallback(async (type: keyof NotifPrefs) => {
    const next = { ...notifPrefs, [type]: !notifPrefs[type] }
    setNotifPrefs(next)  // optimistic
    const supabase = createClient()
    await supabase
      .from('crew_notification_preferences')
      .upsert(
        {
          user_id:        currentUserId,
          crew_id:        crewId,
          notif_messages: next.messages,
          notif_mentions: next.mentions,
          updated_at:     new Date().toISOString(),
        },
        { onConflict: 'user_id,crew_id' },
      )
  }, [notifPrefs, currentUserId, crewId])

  const handleCloseShare   = useCallback(() => setShowShare(false), [])
  const handleCloseNotif   = useCallback(() => setShowNotif(false), [])

  const allMuted = !notifPrefs.messages && !notifPrefs.mentions
  const nextBirthday = getNextBirthday(memberBirthdays)

  return (
    <>
      <div
        className="bg-black border-b border-border px-4 pb-2 relative flex-shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}
      >
        <div className="flex items-center justify-between h-10">

          {/* Left: back button + crew name */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button
              onClick={goBack}
              aria-label="Back"
              className="flex-shrink-0 flex items-center justify-center"
              style={{ width: 24, height: 40 }}
            >
              <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-purple)' }} aria-hidden="true" />
            </button>
            <h1 className="font-pixel text-[18px] text-primary truncate leading-none">
              {liveCrewName.toUpperCase()}
            </h1>
          </div>

          {/* Right: calendar + bell + user-plus */}
          <div className="flex items-center gap-4 flex-shrink-0">
            {isDev && eventsEnabled && (
              <button
                onClick={() => router.push(`/chat/${crewId}/events`)}
                aria-label="Group events"
                className="flex items-center justify-center text-primary transition-colors"
                style={{ width: 24, height: 40 }}
              >
                <Calendar style={{ width: 24, height: 24 }} aria-hidden="true" />
              </button>
            )}
            <button
              onClick={() => setShowNotif(true)}
              aria-label={allMuted ? 'Notifications muted' : 'Notification settings'}
              className="flex items-center justify-center transition-colors"
              style={{ width: 24, height: 40, color: allMuted ? 'var(--color-muted)' : 'var(--color-primary)' }}
            >
              {allMuted
                ? <BellOff style={{ width: 24, height: 24 }} aria-hidden="true" />
                : <Bell style={{ width: 24, height: 24 }} aria-hidden="true" />
              }
            </button>
            <button
              onClick={() => setShowShare(true)}
              aria-label="Invite members"
              className="flex items-center justify-center text-primary hover:text-purple transition-colors"
              style={{ width: 24, height: 40 }}
            >
              <UserPlus style={{ width: 24, height: 24 }} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Next upcoming birthday */}
        {nextBirthday && (
          <div className="flex items-center gap-1 mt-[2px]">
            <span className="font-silkscreen text-[8px] text-muted leading-none">{nextBirthday.label}</span>
            <span className="font-silkscreen text-[8px] text-tertiary leading-none">·</span>
            <span className="font-silkscreen text-[8px] text-tertiary leading-none">@{nextBirthday.username}</span>
          </div>
        )}

      </div>

      <AnimatePresence>
        {showShare && <ShareModal crew={crew} onClose={handleCloseShare} />}
        {showNotif && (
          <NotifSheet
            prefs={notifPrefs}
            onToggle={handleToggleNotif}
            onClose={handleCloseNotif}
          />
        )}
      </AnimatePresence>
    </>
  )
}
