'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSlideBack } from '@/components/ui/SlidePage'
import { AnimatePresence } from 'framer-motion'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { Note } from 'pixelarticons/react/Note'
import { Calendar2 } from 'pixelarticons/react/Calendar2'
import { Campfire } from '@/components/icons/Campfire'
import { PinListSheet } from '@/components/chat/PinListSheet'
import { MarqueeBanner } from '@/components/ui/MarqueeBanner'
import { useChatStore, selectActivePins } from '@/store/chatStore'


function truncatePinContent(content: string, maxLen = 60): string {
  if (content.startsWith('POLL:') || content.startsWith('BIRTHDAY:') || content.startsWith('JOIN:')) {
    return 'Pinned message'
  }
  return content.length > maxLen ? content.slice(0, maxLen) + '…' : content
}

interface FloatingBackButtonProps {
  crewId:            string
  currentUserId:     string
  initialGemBalance?: number
  creatorId?:        string | null
  isDev?:            boolean
}

export function FloatingBackButton({ crewId, currentUserId, initialGemBalance, creatorId, isDev = false }: FloatingBackButtonProps) {
  const goBack = useSlideBack()
  const router = useRouter()
  const setGemBalance           = useChatStore((s) => s.setGemBalance)
  const setSquadDetailsOpen     = useChatStore((s) => s.setSquadDetailsOpen)
  const messages                = useChatStore((s) => s.messages)
  const setPinnedScrollTargetId = useChatStore((s) => s.setPinnedScrollTargetId)
  const hiddenPinIds            = useChatStore((s) => s.hiddenPinIds)
  const setHiddenPinIds         = useChatStore((s) => s.setHiddenPinIds)

  const [showPinList,   setShowPinList]   = useState(false)
  const [eventsEnabled, setEventsEnabled] = useState(false)

  useEffect(() => {
    const from = sessionStorage.getItem('nexus_chat_from')
    sessionStorage.removeItem('nexus_chat_from')
    if (from) return

    const current = window.location.pathname + window.location.search
    window.history.replaceState({ __NA: true }, '', '/home')
    window.history.pushState(null, '', current)
  }, [])

  useEffect(() => {
    setEventsEnabled(localStorage.getItem('nexus_events_enabled') === '1')
  }, [])

  // Seed store with server-fetched gem balance
  useEffect(() => {
    if (initialGemBalance !== undefined) setGemBalance(initialGemBalance)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const activePins = selectActivePins(messages)

  // Sorted stable order: most recently pinned first
  const sortedPins = [...activePins].sort((a, b) =>
    new Date(b.pinned_at as string).getTime() - new Date(a.pinned_at as string).getTime()
  )

  // Enforce single-pin display: if multiple pins are visible, keep only the most recent one
  useEffect(() => {
    const visibleCount = sortedPins.filter((p) => !hiddenPinIds.has(p.id)).length
    if (visibleCount > 1) {
      const next = new Set(sortedPins.map((p) => p.id))
      if (sortedPins[0]) next.delete(sortedPins[0].id)
      setHiddenPinIds(next)
    }
  }, [sortedPins.map((p) => p.id).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // Only visible (non-hidden) pins scroll in the ticker
  const visiblePins = sortedPins.filter((p) => !hiddenPinIds.has(p.id))

  const tickerItems = visiblePins.map((p) => {
    const username = (p['profile'] as { username?: string } | undefined)?.username
    return {
      text:   truncatePinContent(p.content),
      suffix: username ? `@${username}` : undefined,
    }
  })

  return (
    <>
      {/* Floating gradient top nav */}
      <div
        className="absolute top-0 left-0 right-0 z-[60] flex flex-col pointer-events-none overflow-hidden"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          background: 'linear-gradient(180deg, #000000 0%, rgba(0,0,0,0.25) 46.158%, rgba(0,0,0,0) 100%)',
        }}
      >
        {/* Nav row */}
        <div
          className="flex items-center justify-between w-full pointer-events-none"
          style={{ padding: 16 }}
        >
          {/* Back button */}
          <button
            onClick={goBack}
            aria-label="Go back"
            className="pointer-events-auto flex items-center justify-center border border-border flex-shrink-0"
            style={{
              padding: 'var(--x3)',
              background: 'black',
              backdropFilter: 'blur(7px)',
              WebkitBackdropFilter: 'blur(7px)',
              boxShadow: '0px 0px 20px 12px rgba(0,0,0,0.1)',
            }}
          >
            <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
          </button>

          {/* Right actions */}
          <div className="flex items-center pointer-events-auto" style={{ gap: 'var(--x5)' }}>
            {/* Pin icon */}
            <button
              onClick={() => setShowPinList(true)}
              aria-label={activePins.length > 0 ? `${activePins.length} pinned message${activePins.length !== 1 ? 's' : ''}` : 'No pinned messages'}
              className="relative flex items-center justify-center border border-border flex-shrink-0"
              style={{
                padding: 'var(--x3)',
                background: 'rgba(0,0,0,0)',
                backdropFilter: 'blur(7px)',
                WebkitBackdropFilter: 'blur(7px)',
                filter: 'drop-shadow(0px 0px 10px rgba(0,0,0,0.1))',
              }}
            >
              <Note
                style={{
                  width: 24, height: 24,
                  color: activePins.length > 0 ? 'var(--color-primary)' : 'var(--color-tertiary)',
                }}
                aria-hidden="true"
              />
            </button>

            {isDev && eventsEnabled && (
              <button
                onClick={() => router.push(`/chat/${crewId}/events`)}
                aria-label="Group events"
                className="flex items-center justify-center border border-border flex-shrink-0"
                style={{
                  padding: 'var(--x3)',
                  background: 'rgba(0,0,0,0)',
                  backdropFilter: 'blur(7px)',
                  WebkitBackdropFilter: 'blur(7px)',
                  filter: 'drop-shadow(0px 0px 10px rgba(0,0,0,0.1))',
                }}
              >
                <Calendar2 style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
              </button>
            )}

            <button
              onClick={() => setSquadDetailsOpen(true)}
              aria-label="Squad details"
              className="flex items-center justify-center border border-border flex-shrink-0"
              style={{
                padding: 'var(--x3)',
                background: 'rgba(0,0,0,0)',
                backdropFilter: 'blur(7px)',
                WebkitBackdropFilter: 'blur(7px)',
                filter: 'drop-shadow(0px 0px 10px rgba(0,0,0,0.1))',
              }}
            >
              <Campfire style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Pinned message ticker — shown below the nav row when a pin is active */}
        {visiblePins.length > 0 && (
          <div className="pointer-events-auto" style={{ marginLeft: 'var(--space-5)', marginRight: 'var(--space-5)' }}>
            <MarqueeBanner
              items={tickerItems}
              icon={<Note style={{ width: 8, height: 8, color: 'var(--color-blue)' }} aria-hidden="true" />}
              onClick={() => setPinnedScrollTargetId(visiblePins[0].id)}
              pinned
            />
          </div>
        )}
      </div>

      <AnimatePresence>
        {showPinList && (
          <PinListSheet
            activePins={activePins}
            currentUserId={currentUserId}
            creatorId={creatorId ?? null}
            onClose={() => setShowPinList(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
