'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Calendar } from 'pixelarticons/react/Calendar'
import { format } from 'date-fns'
import type { Event } from '@/types'

function LocationPinIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 16"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6 0C3.515 0 1.5 2.015 1.5 4.5c0 3.375 4.5 9 4.5 9s4.5-5.625 4.5-9C10.5 2.015 8.485 0 6 0zm0 6.125a1.625 1.625 0 110-3.25 1.625 1.625 0 010 3.25z"
        fill="currentColor"
      />
    </svg>
  )
}

interface EventCardMessageProps {
  eventId: string
  crewId:  string
}

export function EventCardMessage({ eventId, crewId }: EventCardMessageProps) {
  const router = useRouter()
  const [event,           setEvent]           = useState<Event | null>(null)
  const [creatorUsername, setCreatorUsername] = useState<string | null>(null)
  const [loading,         setLoading]         = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const { data: eventData } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single()
      if (cancelled) return

      const ev = eventData as Event | null
      setEvent(ev)

      if (ev?.created_by) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', ev.created_by)
          .single()
        if (!cancelled) {
          setCreatorUsername((profileData as { username: string } | null)?.username ?? null)
        }
      }

      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [eventId])

  if (loading) {
    return (
      <div
        style={{
          background:   'var(--color-surface)',
          border:       '1px solid var(--color-border)',
          borderRadius: 8,
          padding:      16,
          display:      'flex',
          flexDirection: 'column',
          gap:          8,
        }}
      >
        <div className="h-[8px] w-20 bg-border animate-pulse" />
        <div className="h-[16px] w-3/4 bg-border animate-pulse" />
        <div className="h-[11px] w-1/2 bg-border animate-pulse" />
      </div>
    )
  }

  if (!event) return null

  return (
    <button
      className="w-full text-left active:opacity-75 transition-opacity"
      style={{
        background:   'var(--color-surface)',
        border:       '1px solid var(--color-border)',
        borderRadius: 8,
        overflow:     'hidden',
        display:      'block',
      }}
      onClick={(e) => {
        e.stopPropagation()
        // Prevent FloatingBackButton from re-injecting /home when chat remounts on back nav
        sessionStorage.setItem('nexus_chat_from', 'event')
        router.push(`/chat/${crewId}/events/${eventId}?from=chat`)
      }}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div
        style={{
          padding:       16,
          display:       'flex',
          flexDirection: 'column',
          gap:           8,
        }}
      >
        {/* Host + title */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
          <p
            className="font-silkscreen leading-none w-full"
            style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}
          >
            HOSTED BY : {creatorUsername ?? '—'}
          </p>
          <p
            className="font-body font-bold leading-normal overflow-hidden w-full"
            style={{
              fontSize:             16,
              color:                'var(--color-primary)',
              fontVariationSettings: '"opsz" 14',
              textOverflow:         'ellipsis',
              whiteSpace:           'nowrap',
            }}
          >
            {event.title}
          </p>
        </div>

        {/* Date + location */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
            <Calendar
              style={{ width: 12, height: 12, color: 'var(--color-secondary)', flexShrink: 0 }}
              aria-hidden="true"
            />
            <p
              className="font-body font-normal leading-none"
              style={{
                fontSize:             'var(--text-xxs)',
                color:                'var(--color-secondary)',
                fontVariationSettings: '"opsz" 14',
                flex:                 1,
                minWidth:             0,
              }}
            >
              {format(new Date(event.event_date), "EEEE, MMMM d '@' h:mm a")}
            </p>
          </div>

          {event.location && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
              <span style={{ color: 'var(--color-secondary)', display: 'flex', flexShrink: 0 }}>
                <LocationPinIcon />
              </span>
              <p
                className="font-body font-normal leading-none overflow-hidden"
                style={{
                  fontSize:             'var(--text-xxs)',
                  color:                'var(--color-secondary)',
                  fontVariationSettings: '"opsz" 14',
                  textOverflow:         'ellipsis',
                  whiteSpace:           'nowrap',
                  flex:                 1,
                  minWidth:             0,
                }}
              >
                {event.location}
              </p>
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
