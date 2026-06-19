'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { SlidePage, useSlideBack } from '@/components/ui/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { Calendar } from 'pixelarticons/react/Calendar'
import { createClient } from '@/lib/supabase/client'
import { EventCreationSheet } from '@/components/chat/EventCreationSheet'
import { resolveAvatarUrl, isSupabaseStorage } from '@/components/ui/Avatar'
import { format } from 'date-fns'
import type { Event } from '@/types'

const DEFAULT_EVENT_IMAGE = '/img/eventDefaultImage.png'

interface EventPageFullProps {
  crewId:        string
  currentUserId: string
}

type GoingProfile = { id: string; username: string; avatar_url: string | null }

type EnrichedEvent = Event & {
  creatorUsername: string | null
  goingProfiles:   GoingProfile[]
}

function LocationPinIcon() {
  return (
    <svg
      width="12"
      height="14"
      viewBox="0 0 24 28"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 0C7.03 0 3 4.03 3 9c0 6.75 9 18 9 18s9-11.25 9-18c0-4.97-4.03-9-9-9zm0 12.25c-1.79 0-3.25-1.46-3.25-3.25S10.21 5.75 12 5.75 15.25 7.21 15.25 9 13.79 12.25 12 12.25z"
        fill="currentColor"
      />
    </svg>
  )
}

function formatEventDate(dateStr: string): string {
  return format(new Date(dateStr), "EEEE, MMMM d '@' h:mm a")
}

function EventCardPreview({ event, crewId }: { event: EnrichedEvent; crewId: string }) {
  const router = useRouter()
  const coverSrc = event.cover_image_url || DEFAULT_EVENT_IMAGE
  const isLocal  = !event.cover_image_url

  return (
    <button
      className="w-full overflow-hidden flex flex-col flex-shrink-0 text-left"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
      }}
      onClick={() => router.push(`/chat/${crewId}/events/${event.id}`)}
    >
      <div className="relative w-full flex-shrink-0" style={{ height: 140 }}>
        <Image
          src={coverSrc}
          alt={event.title}
          fill
          sizes="480px"
          className="object-cover"
          unoptimized={!isLocal && isSupabaseStorage(coverSrc)}
        />
      </div>

      <div className="flex flex-col w-full" style={{ padding: 16, gap: 16 }}>
        {/* Details */}
        <div className="flex flex-col w-full overflow-hidden" style={{ gap: 8 }}>
          <div className="flex flex-col w-full" style={{ gap: 4 }}>
            <p
              className="font-silkscreen leading-none w-full"
              style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}
            >
              Hosted by : {event.creatorUsername ?? '—'}
            </p>
            <p
              className="font-body font-bold text-[var(--color-primary)] w-full"
              style={{
                fontSize: 18,
                lineHeight: 'normal',
                fontVariationSettings: '"opsz" 14',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {event.title}
            </p>
          </div>

          <div className="flex items-center w-full" style={{ gap: 4 }}>
            <Calendar
              style={{ width: 12, height: 16, color: 'var(--color-secondary)', flexShrink: 0 }}
              aria-hidden="true"
            />
            <p
              className="font-body font-normal leading-none flex-1 min-w-0 text-[var(--color-secondary)]"
              style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}
            >
              {formatEventDate(event.event_date)}
            </p>
          </div>

          {event.location && (
            <div className="flex items-center w-full" style={{ gap: 4 }}>
              <LocationPinIcon />
              <p
                className="font-body font-normal leading-none flex-1 min-w-0 text-[var(--color-secondary)]"
                style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}
              >
                {event.location}
              </p>
            </div>
          )}
        </div>

        {/* Going */}
        <div className="flex flex-col" style={{ gap: 8 }}>
          <p
            className="font-silkscreen leading-none w-full"
            style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}
          >
            Going
          </p>
          <div className="flex items-center" style={{ gap: 8 }}>
            {event.goingProfiles.length === 0 ? (
              <p
                className="font-body font-normal text-[var(--color-tertiary)]"
                style={{ fontSize: 'var(--text-xxs)', fontVariationSettings: '"opsz" 14' }}
              >
                Be the first!
              </p>
            ) : (
              event.goingProfiles.slice(0, 5).map((profile) => (
                <div
                  key={profile.id}
                  className="relative flex-shrink-0 rounded-full overflow-hidden"
                  style={{ width: 24, height: 24, background: 'var(--color-border)' }}
                >
                  {profile.avatar_url ? (
                    <Image
                      src={resolveAvatarUrl(profile.avatar_url, 24)}
                      alt={profile.username}
                      fill
                      sizes="24px"
                      className="object-cover"
                      unoptimized={isSupabaseStorage(profile.avatar_url)}
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ background: 'var(--color-purple)' }}
                    >
                      <span className="font-pixel text-white" style={{ fontSize: 6 }}>
                        {profile.username[0]?.toUpperCase() ?? '?'}
                      </span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

export function EventPageFull({ crewId, currentUserId }: EventPageFullProps) {
  const goBack     = useSlideBack()
  const router     = useRouter()
  const [events,      setEvents]      = useState<EnrichedEvent[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showCreate,  setShowCreate]  = useState(false)
  const [gateChecked, setGateChecked] = useState(false)

  useEffect(() => {
    const enabled = localStorage.getItem('nexus_events_enabled') === '1'
    if (!enabled) { router.replace(`/chat/${crewId}`); return }
    setGateChecked(true)
  }, [crewId, router])

  const loadEvents = useCallback(async () => {
    const supabase = createClient()

    const { data: eventsData } = await supabase
      .from('events')
      .select('*')
      .eq('crew_id', crewId)
      .order('event_date', { ascending: true })

    const eventsList = (eventsData ?? []) as Event[]

    if (eventsList.length === 0) {
      setEvents([])
      setLoading(false)
      return
    }

    const eventIds   = eventsList.map((e) => e.id)
    const creatorIds = [...new Set(eventsList.map((e) => e.created_by))]

    const [{ data: creatorsData }, { data: rsvpsData }] = await Promise.all([
      supabase.from('profiles').select('id, username').in('id', creatorIds),
      supabase.from('event_rsvps').select('event_id, user_id').in('event_id', eventIds).eq('status', 'going'),
    ])

    const creatorsMap = new Map<string, string>(
      ((creatorsData ?? []) as { id: string; username: string }[]).map((p) => [p.id, p.username])
    )
    const goingRsvps   = (rsvpsData ?? []) as { event_id: string; user_id: string }[]
    const goingUserIds = [...new Set(goingRsvps.map((r) => r.user_id))]

    let goingProfilesMap = new Map<string, GoingProfile>()
    if (goingUserIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', goingUserIds)
      goingProfilesMap = new Map(
        ((profilesData ?? []) as GoingProfile[]).map((p) => [p.id, p])
      )
    }

    setEvents(
      eventsList.map((event) => ({
        ...event,
        creatorUsername: creatorsMap.get(event.created_by) ?? null,
        goingProfiles: goingRsvps
          .filter((r) => r.event_id === event.id)
          .map((r) => goingProfilesMap.get(r.user_id))
          .filter((p): p is GoingProfile => !!p)
          .slice(0, 5),
      }))
    )
    setLoading(false)
  }, [crewId])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

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

  const now      = new Date()
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
        className="flex-shrink-0 w-full"
        style={{
          paddingLeft:   'var(--x5)',
          paddingRight:  'var(--x5)',
          paddingTop:    'calc(env(safe-area-inset-top, 0px) + var(--x3))',
          paddingBottom: 'var(--x3)',
        }}
      >
        <div className="flex h-[40px] items-center justify-between">
          {/* Left: back + title */}
          <div className="flex items-center" style={{ gap: 'var(--x3)' }}>
            <button
              onClick={goBack}
              aria-label="Back"
              className="flex items-center justify-center flex-shrink-0"
              style={{ width: 24, height: 24 }}
            >
              <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
            </button>
            <p
              className="font-silkscreen text-[var(--color-primary)] leading-none uppercase"
              style={{ fontSize: 'var(--text-xxl)' }}
            >
              Events
            </p>
          </div>

          {/* Right: create button */}
          <button
            onClick={() => setShowCreate(true)}
            aria-label="Create event"
            className="flex items-center justify-center flex-shrink-0"
            style={{ width: 24, height: 24 }}
          >
            <Calendar style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div
        className="flex-1 overflow-y-auto nexus-scroll flex flex-col"
        style={{
          gap:           'var(--x5)',
          padding:       'var(--x5)',
          paddingBottom: 'max(env(safe-area-inset-bottom), var(--x8))',
        }}
      >
        {loading && (
          <div className="flex flex-col" style={{ gap: 'var(--x5)' }}>
            {[1, 2].map((i) => (
              <div key={i} className="w-full animate-pulse" style={{ height: 303, background: 'var(--color-border)', borderRadius: 8 }} />
            ))}
          </div>
        )}

        {!loading && (
          <>
            {/* Upcoming */}
            <div className="flex flex-col" style={{ gap: 'var(--x3)' }}>
              <p
                className="font-body font-medium text-[var(--color-primary)] leading-normal"
                style={{ fontSize: 'var(--text-sm)', letterSpacing: '0.2px', fontVariationSettings: '"opsz" 14' }}
              >
                Upcoming
              </p>
              {upcoming.length === 0 ? (
                <p
                  className="font-body text-[var(--color-tertiary)] leading-normal"
                  style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
                >
                  No upcoming events yet.
                </p>
              ) : (
                <div className="flex flex-col" style={{ gap: 'var(--x5)' }}>
                  {upcoming.map((event) => (
                    <motion.div key={event.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                      <EventCardPreview event={event} crewId={crewId} />
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Past */}
            {past.length > 0 && (
              <div className="flex flex-col" style={{ gap: 'var(--x3)' }}>
                <p
                  className="font-body font-medium text-[var(--color-primary)] leading-normal"
                  style={{ fontSize: 'var(--text-sm)', letterSpacing: '0.2px', fontVariationSettings: '"opsz" 14' }}
                >
                  Past
                </p>
                <div className="flex flex-col" style={{ gap: 'var(--x5)' }}>
                  {[...past].reverse().map((event) => (
                    <motion.div key={event.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <EventCardPreview event={event} crewId={crewId} />
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showCreate && (
        <EventCreationSheet
          crewId={crewId}
          currentUserId={currentUserId}
          createMessage
          onClose={() => setShowCreate(false)}
          onCreated={() => loadEvents()}
        />
      )}
    </SlidePage>
  )
}

// Named export alias kept for the page.tsx import
export { EventPageFull as GroupEventsClient }
