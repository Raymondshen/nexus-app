'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { supabaseImageLoader } from '@/shared/supabase/imageLoader'
import { createClient } from '@/shared/supabase/client'
import { upsertEventRsvpAction } from '@/app/(app)/chat/actions'
import type { Event, EventRsvp, EventRsvpStatus } from '@/types'
import { format } from 'date-fns'

interface EventCardProps {
  eventId:       string
  currentUserId: string
}

type RsvpCounts = { going: number; maybe: number; not_going: number }

function formatEventDate(dateStr: string): string {
  const d = new Date(dateStr)
  return format(d, "EEE, MMM d 'at' h:mma").replace('AM', 'am').replace('PM', 'pm')
}

export function EventCard({ eventId, currentUserId }: EventCardProps) {
  const [event,     setEvent]     = useState<Event | null>(null)
  const [rsvps,     setRsvps]     = useState<EventRsvp[]>([])
  const [myStatus,  setMyStatus]  = useState<EventRsvpStatus | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const [{ data: eventData }, { data: rsvpData }] = await Promise.all([
        supabase.from('events').select('*').eq('id', eventId).single(),
        supabase.from('event_rsvps').select('*').eq('event_id', eventId),
      ])
      if (cancelled) return
      setEvent(eventData as Event | null)
      const allRsvps = (rsvpData ?? []) as EventRsvp[]
      setRsvps(allRsvps)
      setMyStatus(allRsvps.find((r) => r.user_id === currentUserId)?.status ?? null)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [eventId, currentUserId])

  const handleRsvp = useCallback(async (status: EventRsvpStatus) => {
    if (submitting) return
    // Optimistic update
    const prev = myStatus
    setMyStatus(status)
    setRsvps((prev) => {
      const without = prev.filter((r) => r.user_id !== currentUserId)
      return [...without, { event_id: eventId, user_id: currentUserId, status, updated_at: new Date().toISOString() }]
    })
    setSubmitting(true)
    const { error } = await upsertEventRsvpAction(eventId, status)
    setSubmitting(false)
    if (error) {
      // Roll back
      setMyStatus(prev)
      setRsvps((cur) => {
        const without = cur.filter((r) => r.user_id !== currentUserId)
        if (prev) return [...without, { event_id: eventId, user_id: currentUserId, status: prev, updated_at: '' }]
        return without
      })
    }
  }, [submitting, myStatus, eventId, currentUserId])

  const counts: RsvpCounts = rsvps.reduce(
    (acc, r) => { acc[r.status as EventRsvpStatus]++; return acc },
    { going: 0, maybe: 0, not_going: 0 },
  )

  const isPast = event ? new Date(event.event_date) < new Date() : false

  if (loading) {
    return (
      <div
        className="w-full bg-[#0d0d14] border border-border overflow-hidden"
        style={{ maxWidth: 300 }}
      >
        <div className="h-32 bg-border animate-pulse" />
        <div className="p-3 flex flex-col gap-2">
          <div className="h-3 w-2/3 bg-border animate-pulse" />
          <div className="h-2 w-1/2 bg-border animate-pulse" />
        </div>
      </div>
    )
  }

  if (!event) return null

  return (
    <div
      className="w-full bg-[#0d0d14] border border-border overflow-hidden"
      style={{ maxWidth: 300 }}
    >
      {/* Cover image */}
      {event.cover_image_url && (
        <div className="relative w-full" style={{ aspectRatio: '4/3' }}>
          <Image
            src={event.cover_image_url}
            alt={event.title}
            fill
            sizes="300px"
            className="object-cover"
            loader={supabaseImageLoader}
          />
          {isPast && (
            <div className="absolute inset-0 bg-black/50 flex items-end p-2">
              <span className="font-silkscreen text-[8px] text-tertiary leading-none">Already happened.</span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col" style={{ padding: 'var(--space-3)', gap: 'var(--space-2)' }}>
        {/* Title */}
        <p
          className="font-body font-semibold text-primary leading-snug"
          style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
        >
          {event.title}
        </p>

        {/* Date */}
        <p
          className="font-silkscreen leading-none"
          style={{ fontSize: 'var(--text-mini)', color: 'var(--color-purple)' }}
        >
          {formatEventDate(event.event_date)}
        </p>

        {/* Location */}
        {event.location && (
          <p
            className="font-body text-tertiary leading-normal"
            style={{ fontSize: 'var(--text-xxs)', fontVariationSettings: '"opsz" 14' }}
          >
            {event.location}
          </p>
        )}

        {/* Description */}
        {event.description && (
          <p
            className="font-body text-secondary leading-normal"
            style={{ fontSize: 'var(--text-xxs)', fontVariationSettings: '"opsz" 14' }}
          >
            {event.description}
          </p>
        )}

        {/* RSVP counts */}
        <div className="flex items-center gap-3" style={{ marginTop: 'var(--space-1)' }}>
          {(['going', 'maybe', 'not_going'] as const).map((s) => (
            <span key={s} className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
              {counts[s]}{' '}
              <span style={{ color: s === 'going' ? 'var(--color-success)' : s === 'maybe' ? 'var(--color-coins)' : 'var(--color-danger)' }}>
                {s === 'not_going' ? 'no' : s}
              </span>
            </span>
          ))}
        </div>

        {/* RSVP buttons */}
        <div className="flex gap-2" style={{ marginTop: 'var(--space-1)' }}>
          {([
            { status: 'going'     as const, label: 'Going',    active: '#22c55e' },
            { status: 'maybe'     as const, label: 'Maybe',    active: 'var(--color-coins)' },
            { status: 'not_going' as const, label: 'Not Going', active: 'var(--color-danger)' },
          ] as const).map(({ status, label, active }) => {
            const selected = myStatus === status
            return (
              <button
                key={status}
                onClick={() => handleRsvp(status)}
                disabled={submitting}
                className="flex-1 flex items-center justify-center font-silkscreen leading-none disabled:opacity-50"
                style={{
                  fontSize: 'var(--text-mini)',
                  paddingTop: 'var(--space-2)',
                  paddingBottom: 'var(--space-2)',
                  background: selected ? active : '#1a1a2e',
                  color: selected ? '#fff' : 'var(--color-tertiary)',
                  border: `1px solid ${selected ? active : 'var(--color-border)'}`,
                  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                  minHeight: 32,
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
