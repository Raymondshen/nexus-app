'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { SlidePage, useSlideBack } from '@/components/ui/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { createClient } from '@/lib/supabase/client'
import { EventCard } from '@/components/chat/EventCard'
import { EventCreationSheet } from '@/components/chat/EventCreationSheet'
import type { Event } from '@/types'

interface GroupEventsClientProps {
  crewId:        string
  currentUserId: string
}

export function GroupEventsClient({ crewId, currentUserId }: GroupEventsClientProps) {
  const goBack = useSlideBack()
  const router = useRouter()
  const [events,          setEvents]          = useState<Event[]>([])
  const [loading,         setLoading]         = useState(true)
  const [showCreate,      setShowCreate]      = useState(false)
  const [gateChecked,     setGateChecked]     = useState(false)

  useEffect(() => {
    const enabled = localStorage.getItem('nexus_events_enabled') === '1'
    if (!enabled) { router.replace(`/chat/${crewId}`); return }
    setGateChecked(true)
  }, [crewId, router])

  const loadEvents = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('crew_id', crewId)
      .order('event_date', { ascending: true })
    setEvents((data ?? []) as Event[])
    setLoading(false)
  }, [crewId])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  // Realtime subscription for events + rsvp changes while this page is mounted
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`group-events:${crewId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events', filter: `crew_id=eq.${crewId}` },
        () => { loadEvents() },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [crewId, loadEvents])

  if (!gateChecked) return null

  const now = new Date()
  const upcoming = events.filter((e) => new Date(e.event_date) >= now)
  const past     = events.filter((e) => new Date(e.event_date) <  now)

  return (
    <SlidePage
      className="bg-black flex flex-col"
      style={{ position: 'fixed', inset: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden' }}
      backHref={`/chat/${crewId}`}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 w-full border-b border-border"
        style={{
          paddingLeft:  'var(--space-5)',
          paddingRight: 'var(--space-5)',
          paddingTop:   'calc(env(safe-area-inset-top, 0px) + var(--space-3))',
          paddingBottom: 'var(--space-3)',
        }}
      >
        <div className="flex h-[40px] items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={goBack}
              aria-label="Back"
              className="flex items-center justify-center flex-shrink-0"
              style={{ width: 24, height: 24 }}
            >
              <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-purple)' }} aria-hidden="true" />
            </button>
            <p className="font-pixel text-primary leading-none uppercase" style={{ fontSize: 'var(--text-xs)' }}>
              Group Event
            </p>
          </div>

          <button
            onClick={() => setShowCreate(true)}
            className="font-pixel text-purple leading-none"
            style={{ fontSize: 'var(--text-mini)' }}
          >
            + CREATE
          </button>
        </div>
      </div>

      {/* Body */}
      <div
        className="flex-1 overflow-y-auto nexus-scroll flex flex-col"
        style={{ gap: 'var(--space-7)', padding: 'var(--space-5)', paddingBottom: 'max(env(safe-area-inset-bottom), var(--space-5))' }}
      >
        {loading && (
          <div className="flex flex-col gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-48 bg-border animate-pulse" />
            ))}
          </div>
        )}

        {!loading && (
          <>
            {/* Upcoming */}
            <div className="flex flex-col gap-4">
              <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
                UPCOMING
              </p>
              {upcoming.length === 0 ? (
                <p className="font-body text-muted leading-normal" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
                  No raids on the books yet.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {upcoming.map((event) => (
                    <motion.div key={event.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                      <EventCard eventId={event.id} currentUserId={currentUserId} />
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Past */}
            {past.length > 0 && (
              <div className="flex flex-col gap-4">
                <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
                  PAST
                </p>
                <div className="flex flex-col gap-4">
                  {[...past].reverse().map((event) => (
                    <motion.div key={event.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <EventCard eventId={event.id} currentUserId={currentUserId} />
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Floating CTA */}
            <button
              onClick={() => setShowCreate(true)}
              className="w-full flex items-center justify-center font-pixel text-primary"
              style={{
                fontSize: 'var(--text-xxs)',
                minHeight: 48,
                background: 'var(--color-purple)',
                boxShadow: '4px 4px 0px 0px rgba(168,85,247,0.4)',
              }}
            >
              Mark your calendar.
            </button>
          </>
        )}
      </div>

      {showCreate && (
        <EventCreationSheet
          crewId={crewId}
          currentUserId={currentUserId}
          onClose={() => setShowCreate(false)}
          onCreated={() => loadEvents()}
        />
      )}
    </SlidePage>
  )
}
