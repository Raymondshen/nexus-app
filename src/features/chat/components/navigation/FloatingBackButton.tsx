'use client'

import { useEffect, useState } from 'react'
import { useSlideBack } from '@/app/layouts/SlidePage'
import { AnimatePresence } from 'framer-motion'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { Note } from 'pixelarticons/react/Note'
import { Calendar2 } from 'pixelarticons/react/Calendar2'
import { Campfire } from '@/shared/icons/Campfire'
import { PinListSheet } from '@/features/chat/components/sheets/PinListSheet'
import { EventSheetBottomPreview } from '@/features/events/components/EventSheetBottomPreview'
import { useChatStore, selectActivePins } from '@/store/chatStore'

interface FloatingBackButtonProps {
  crewId:             string
  currentUserId:      string
  initialGemBalance?: number
  creatorId?:         string | null
}

export function FloatingBackButton({ crewId, currentUserId, initialGemBalance, creatorId }: FloatingBackButtonProps) {
  const goBack = useSlideBack()
  const setGemBalance       = useChatStore((s) => s.setGemBalance)
  const setSquadDetailsOpen = useChatStore((s) => s.setSquadDetailsOpen)
  const messages            = useChatStore((s) => s.messages)

  const [showPinList,      setShowPinList]      = useState(false)
  const [showEventPreview, setShowEventPreview] = useState(false)
  const [devMode,          setDevMode]          = useState(false)
  const [eventsEnabled,    setEventsEnabled]    = useState(false)

  useEffect(() => {
    const from = sessionStorage.getItem('nexus_chat_from')
    sessionStorage.removeItem('nexus_chat_from')
    if (from) return

    const current = window.location.pathname + window.location.search
    window.history.replaceState({ __NA: true }, '', '/home')
    window.history.pushState(null, '', current)
  }, [])

  useEffect(() => {
    setDevMode(localStorage.getItem('nexus_dev_mode') === '1')
    setEventsEnabled(localStorage.getItem('nexus_events_enabled') === '1')
    function onEventsChange(e: Event) { setEventsEnabled((e as CustomEvent<{ on: boolean }>).detail.on) }
    window.addEventListener('nexus-events-feature-change', onEventsChange)
    return () => window.removeEventListener('nexus-events-feature-change', onEventsChange)
  }, [])

  // Seed store with server-fetched gem balance
  useEffect(() => {
    if (initialGemBalance !== undefined) setGemBalance(initialGemBalance)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const activePins = selectActivePins(messages)

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
              background: 'rgba(0,0,0,0)',
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
                boxShadow: '0px 0px 20px 12px rgba(0,0,0,0.1)',
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

            {devMode && eventsEnabled && (
              <button
                onClick={() => setShowEventPreview(true)}
                aria-label="Group events"
                className="flex items-center justify-center border border-border flex-shrink-0"
                style={{
                  padding: 'var(--x3)',
                  background: 'rgba(0,0,0,0)',
                  backdropFilter: 'blur(7px)',
                  WebkitBackdropFilter: 'blur(7px)',
                  boxShadow: '0px 0px 20px 12px rgba(0,0,0,0.1)',
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
                boxShadow: '0px 0px 20px 12px rgba(0,0,0,0.1)',
              }}
            >
              <Campfire style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
            </button>
          </div>
        </div>
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

      <AnimatePresence>
        {showEventPreview && devMode && eventsEnabled && (
          <EventSheetBottomPreview
            crewId={crewId}
            currentUserId={currentUserId}
            onClose={() => setShowEventPreview(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
