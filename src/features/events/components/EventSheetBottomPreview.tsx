'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { createClient } from '@/shared/supabase/client'
import { format } from 'date-fns'
import { Calendar } from 'pixelarticons/react/Calendar'
import { supabaseImageLoader, avatarImageLoader } from '@/shared/supabase/imageLoader'
import type { Event } from '@/types'

const DEFAULT_EVENT_IMAGE = '/img/eventDefaultImage.png'

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

type GoingProfile = { id: string; username: string; avatar_url: string | null }

type EventWithDetails = Event & {
  creatorUsername: string | null
  goingProfiles:   GoingProfile[]
}

function formatEventDate(dateStr: string): string {
  return format(new Date(dateStr), "EEEE, MMMM d '@' h:mm a")
}

function EventCardPreview({
  event,
  onTap,
}: {
  event:  EventWithDetails
  onTap:  () => void
}) {
  const coverSrc = event.cover_image_url || DEFAULT_EVENT_IMAGE
  const isLocal  = !event.cover_image_url

  return (
    <button
      className="w-full overflow-hidden flex flex-col flex-shrink-0 text-left"
      style={{
        background:   'var(--color-surface)',
        border:       '1px solid var(--color-border)',
        borderRadius: 8,
      }}
      onClick={onTap}
    >
      {/* Cover image — always shown, falls back to default */}
      <div className="relative w-full flex-shrink-0" style={{ height: 140 }}>
        <Image
          src={coverSrc}
          alt={event.title}
          fill
          sizes="480px"
          className="object-cover"
          loader={supabaseImageLoader}
        />
      </div>

      <div className="flex flex-col w-full" style={{ padding: 16, gap: 16 }}>
        {/* Details */}
        <div className="flex flex-col w-full overflow-hidden" style={{ gap: 8 }}>
          {/* Host + title */}
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
                fontSize:            18,
                lineHeight:          'normal',
                fontVariationSettings: '"opsz" 14',
                whiteSpace:          'nowrap',
                overflow:            'hidden',
                textOverflow:        'ellipsis',
              }}
            >
              {event.title}
            </p>
          </div>

          {/* Date */}
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

          {/* Location */}
          {event.location && (
            <div className="flex items-center w-full" style={{ gap: 4 }}>
              <span style={{ color: 'var(--color-secondary)', display: 'flex' }}>
                <LocationPinIcon />
              </span>
              <p
                className="font-body font-normal leading-none flex-1 min-w-0 text-[var(--color-secondary)]"
                style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}
              >
                {event.location}
              </p>
            </div>
          )}
        </div>

        {/* Going — avatar circles */}
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
                      src={profile.avatar_url}
                      alt={profile.username}
                      fill
                      sizes="24px"
                      className="object-cover"
                      loader={avatarImageLoader}
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

interface EventSheetBottomPreviewProps {
  crewId:        string
  currentUserId: string
  onClose:       () => void
}

export function EventSheetBottomPreview({ crewId, onClose }: EventSheetBottomPreviewProps) {
  const router    = useRouter()
  const scrollRef = useRef<HTMLDivElement>(null)
  const pullRef   = useRef({ startY: 0, atTop: false })
  const [events,  setEvents]  = useState<EventWithDetails[]>([])
  const [loading, setLoading] = useState(true)

  // Pull-to-close: when the scroll container is at the top and the user
  // swipes down, close the sheet instead of scrolling.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    function onTouchStart(e: TouchEvent) {
      pullRef.current = { startY: e.touches[0].clientY, atTop: el!.scrollTop === 0 }
    }
    function onTouchMove(e: TouchEvent) {
      if (!pullRef.current.atTop) return
      if (e.touches[0].clientY - pullRef.current.startY > 0) e.preventDefault()
    }
    function onTouchEnd(e: TouchEvent) {
      if (!pullRef.current.atTop) return
      if (e.changedTouches[0].clientY - pullRef.current.startY > 60) onClose()
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove',  onTouchMove,  { passive: false })
    el.addEventListener('touchend',   onTouchEnd,   { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
      el.removeEventListener('touchend',   onTouchEnd)
    }
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const supabase = createClient()
        const now = new Date().toISOString()

        const { data: eventsData } = await supabase
          .from('events')
          .select('*')
          .eq('crew_id', crewId)
          .gte('event_date', now)
          .order('event_date', { ascending: true })

        if (cancelled) return
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

        if (cancelled) return

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
          if (!cancelled) {
            goingProfilesMap = new Map(
              ((profilesData ?? []) as GoingProfile[]).map((p) => [p.id, p])
            )
          }
        }

        if (cancelled) return

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
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [crewId])

  function handleCardTap(eventId: string) {
    onClose()
    sessionStorage.setItem('nexus_chat_from', 'event')
    router.push(`/chat/${crewId}/events/${eventId}`)
  }

  function handleViewAll() {
    onClose()
    sessionStorage.setItem('nexus_chat_from', 'events')
    router.push(`/chat/${crewId}/events`)
  }

  const content = (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 z-[79] bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Sheet — fills from below floating navbar to bottom of screen */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="fixed left-0 right-0 bottom-0 z-[80] bg-[var(--color-surface-sheet)] rounded-tl-[16px] rounded-tr-[16px] flex flex-col overflow-hidden"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 72px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Scrollable: header + cards */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto nexus-scroll flex flex-col"
          style={{ gap: 'var(--x7)', padding: 'var(--x7) var(--x5) 0' }}
        >
          <p
            className="font-body font-bold text-[var(--color-primary)] leading-none flex-shrink-0"
            style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14' }}
          >
            Upcoming events
          </p>

          {loading ? (
            <div className="flex flex-col flex-shrink-0" style={{ gap: 'var(--x7)' }}>
              <div
                className="w-full animate-pulse"
                style={{ height: 303, background: 'var(--color-border)', borderRadius: 8 }}
              />
            </div>
          ) : events.length === 0 ? (
            <p
              className="font-body text-[var(--color-tertiary)] leading-normal"
              style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
            >
              No upcoming events yet.
            </p>
          ) : (
            <div className="flex flex-col flex-shrink-0" style={{ gap: 'var(--x7)' }}>
              {events.map((event) => (
                <EventCardPreview
                  key={event.id}
                  event={event}
                  onTap={() => handleCardTap(event.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Fixed bottom: View all button */}
        <div
          className="flex-shrink-0"
          style={{ padding: 'var(--x7) var(--x5) max(env(safe-area-inset-bottom), var(--x8))' }}
        >
          <button
            onClick={handleViewAll}
            className="w-full flex items-center justify-center font-silkscreen text-[var(--color-primary)] bg-[var(--color-purple)] overflow-hidden"
            style={{ fontSize: 'var(--text-xs)', height: 48 }}
          >
            View all events
          </button>
        </div>
      </motion.div>
    </>
  )

  return createPortal(content, document.body)
}
