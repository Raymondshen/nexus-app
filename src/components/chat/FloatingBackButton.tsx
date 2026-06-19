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
import { PIN_FEATURE_KEY } from '@/lib/config'
import type { Message } from '@/types'


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

  const [showPinList,    setShowPinList]    = useState(false)
  const [pinFeature,     setPinFeature]     = useState(false)
  const [eventsEnabled,  setEventsEnabled]  = useState(false)

  useEffect(() => {
    const from = sessionStorage.getItem('nexus_chat_from')
    sessionStorage.removeItem('nexus_chat_from')
    if (from) return

    const current = window.location.pathname + window.location.search
    window.history.replaceState({ __NA: true }, '', '/home')
    window.history.pushState(null, '', current)
  }, [])

  useEffect(() => {
    setPinFeature(localStorage.getItem(PIN_FEATURE_KEY) === '1')
    setEventsEnabled(localStorage.getItem('nexus_events_enabled') === '1')
  }, [])

  // Seed store with server-fetched gem balance
  useEffect(() => {
    if (initialGemBalance !== undefined) setGemBalance(initialGemBalance)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const activePins = pinFeature ? selectActivePins(messages) : ([] as Message[])

  // Sorted stable order: most recently pinned first
  const sortedPins = [...activePins].sort((a, b) =>
    new Date(b.pinned_at as string).getTime() - new Date(a.pinned_at as string).getTime()
  )

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
        className="absolute top-0 left-0 right-0 z-[60] flex flex-col pointer-events-none"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        {/* Nav row */}
        <div
          className="flex items-center justify-between w-full pointer-events-none"
          style={{ padding: '8px 16px', background: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0) 100%)', minHeight: 56 }}
        >
          {/* Back button */}
          <button
            onClick={goBack}
            aria-label="Go back"
            className="pointer-events-auto flex items-center justify-center border border-border flex-shrink-0 overflow-hidden"
            style={{
              padding: 'var(--x3)',
              background: 'rgba(0,0,0,0)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              boxShadow: '0px 0px 20px 12px rgba(0,0,0,0.1)',
            }}
          >
            <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
          </button>

          {/* Right actions */}
          <div className="flex items-center pointer-events-auto" style={{ gap: 'var(--x5)' }}>
            {/* Pin icon — shown when pin feature is enabled */}
            {pinFeature && (
              <button
                onClick={() => setShowPinList(true)}
                aria-label={activePins.length > 0 ? `${activePins.length} pinned message${activePins.length !== 1 ? 's' : ''}` : 'No pinned messages'}
                className="relative flex items-center justify-center border border-border overflow-hidden flex-shrink-0"
                style={{
                  padding: 'var(--x3)',
                  background: 'rgba(0,0,0,0)',
                  backdropFilter: 'blur(4px)',
                  WebkitBackdropFilter: 'blur(4px)',
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
                {activePins.length > 0 && (
                  <span
                    className="absolute top-0 right-0 flex items-center justify-center font-pixel leading-none"
                    style={{
                      width: 14, height: 14,
                      background: 'var(--color-purple)',
                      fontSize: 7,
                      color: 'white',
                      transform: 'translate(25%, -25%)',
                    }}
                  >
                    {activePins.length}
                  </span>
                )}
              </button>
            )}

{isDev && eventsEnabled && (
              <button
                onClick={() => router.push(`/chat/${crewId}/events`)}
                aria-label="Group events"
                className="flex items-center justify-center border border-border overflow-hidden flex-shrink-0"
                style={{
                  padding: 'var(--x3)',
                  background: 'rgba(0,0,0,0)',
                  backdropFilter: 'blur(4px)',
                  WebkitBackdropFilter: 'blur(4px)',
                  filter: 'drop-shadow(0px 0px 10px rgba(0,0,0,0.1))',
                }}
              >
                <Calendar2 style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
              </button>
            )}

            <button
              onClick={() => setSquadDetailsOpen(true)}
              aria-label="Squad details"
              className="flex items-center justify-center border border-border overflow-hidden flex-shrink-0"
              style={{
                padding: 'var(--x3)',
                background: 'rgba(0,0,0,0)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
                filter: 'drop-shadow(0px 0px 10px rgba(0,0,0,0.1))',
              }}
            >
              <Campfire style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Pinned message ticker — shown below the nav row when a pin is active */}
        {pinFeature && visiblePins.length > 0 && (
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
