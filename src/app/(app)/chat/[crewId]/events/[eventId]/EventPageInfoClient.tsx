'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { SlidePage, useSlideBack } from '@/components/ui/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { Calendar } from 'pixelarticons/react/Calendar'
import { Check } from 'pixelarticons/react/Check'
import { Close } from 'pixelarticons/react/Close'
import { MagicEdit } from 'pixelarticons/react/MagicEdit'
import { resolveAvatarUrl, isSupabaseStorage } from '@/components/ui/Avatar'
import { upsertEventRsvpAction } from '@/app/(app)/chat/actions'
import { EventCreationSheet } from '@/components/chat/EventCreationSheet'
import { EventRegistrationSheet } from '@/components/chat/EventRegistrationSheet'
import { format } from 'date-fns'
import type { Event } from '@/types'

const DEFAULT_EVENT_IMAGE = '/img/eventDefaultImage.png'

type GoingProfile = { id: string; username: string; avatar_url: string | null }

export type EnrichedEventInfo = Event & {
  creatorUsername: string | null
  goingProfiles:   GoingProfile[]
}

interface EventPageInfoProps {
  crewId:              string
  currentUserId:       string
  currentUserProfile:  GoingProfile
  event:               EnrichedEventInfo
  initialRsvpStatus:   'going' | 'not_going' | null
  isCreator:           boolean
  from?:               string
}

function LocationPinIcon() {
  return (
    <svg
      width="12"
      height="16"
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

export function EventPageInfoClient({
  crewId,
  currentUserId,
  currentUserProfile,
  event,
  initialRsvpStatus,
  isCreator,
  from,
}: EventPageInfoProps) {
  const goBack = useSlideBack()
  const router = useRouter()

  const [rsvpStatus,        setRsvpStatus]        = useState<'going' | 'not_going' | null>(initialRsvpStatus)
  const [pending,           setPending]           = useState(false)
  const [showEdit,          setShowEdit]          = useState(false)
  const [showRegistration,  setShowRegistration]  = useState(false)

  const isGoing = rsvpStatus === 'going'

  // Optimistically add/remove current user from the going list
  const displayGoingProfiles = (() => {
    const alreadyIn = event.goingProfiles.some(p => p.id === currentUserId)
    if (isGoing && !alreadyIn) return [currentUserProfile, ...event.goingProfiles]
    if (!isGoing && alreadyIn) return event.goingProfiles.filter(p => p.id !== currentUserId)
    return event.goingProfiles
  })()

  const coverSrc = event.cover_image_url || DEFAULT_EVENT_IMAGE
  const isLocal  = !event.cover_image_url

  // Pre-fill values for the edit sheet from the current event
  const editInitialValues = {
    title:        event.title,
    description:  event.description  ?? '',
    locationName: event.location     ?? '',
    locationLink: '',
    dateInput:    format(new Date(event.event_date), 'yyyy-MM-dd'),
    timeInput:    format(new Date(event.event_date), 'HH:mm'),
  }

  // First tap when no RSVP exists yet
  async function handleGoingTap() {
    if (pending || rsvpStatus !== null) return
    setPending(true)
    setRsvpStatus('going')
    const { error } = await upsertEventRsvpAction(event.id, 'going')
    if (error) setRsvpStatus(null)
    setPending(false)
  }

  // "Going Confirmed" pressed in registration sheet
  async function handleConfirmGoing() {
    setShowRegistration(false)
    if (rsvpStatus === 'going') return
    const prev = rsvpStatus
    setPending(true)
    setRsvpStatus('going')
    const { error } = await upsertEventRsvpAction(event.id, 'going')
    if (error) setRsvpStatus(prev)
    setPending(false)
  }

  // "Not Going" pressed in registration sheet
  async function handleNotGoing() {
    setShowRegistration(false)
    if (rsvpStatus === 'not_going') return
    const prev = rsvpStatus
    setPending(true)
    setRsvpStatus('not_going')
    const { error } = await upsertEventRsvpAction(event.id, 'not_going')
    if (error) setRsvpStatus(prev)
    setPending(false)
  }

  return (
    <SlidePage
      className="bg-black flex flex-col"
      style={{
        position:    'fixed',
        inset:       0,
        maxWidth:    480,
        marginLeft:  'auto',
        marginRight: 'auto',
        overflow:    'hidden',
      }}
      backHref={from === 'chat' ? undefined : `/chat/${crewId}/events`}
    >
      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="relative flex-shrink-0 w-full" style={{ height: 280 }}>
        {/* Cover image */}
        <Image
          src={coverSrc}
          alt={event.title}
          fill
          priority
          sizes="480px"
          className="object-cover pointer-events-none select-none"
          unoptimized={!isLocal && isSupabaseStorage(coverSrc)}
        />

        {/* Gradient overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 48.668%, rgba(0,0,0,0.8) 82.216%, rgb(0,0,0) 100%)',
          }}
        />

        {/* Top action buttons */}
        <div
          className="absolute top-0 left-0 w-full flex items-center justify-between overflow-hidden"
          style={{
            paddingLeft:   16,
            paddingRight:  16,
            paddingTop:    'calc(env(safe-area-inset-top, 0px) + 18px)',
            paddingBottom: 18,
          }}
        >
          <button
            onClick={goBack}
            aria-label="Back"
            className="flex items-center justify-center flex-shrink-0"
            style={{
              border:     '1px solid var(--color-border)',
              padding:    8,
              background: 'rgba(0,0,0,0)',
              boxShadow:  '0px 0px 20px 12px rgba(0,0,0,0.1)',
            }}
          >
            <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
          </button>

          {isCreator && (
            <button
              onClick={() => setShowEdit(true)}
              aria-label="Edit event"
              className="flex items-center justify-center flex-shrink-0"
              style={{
                border:     '1px solid var(--color-border)',
                padding:    8,
                background: 'rgba(0,0,0,0)',
                boxShadow:  '0px 0px 20px 12px rgba(0,0,0,0.1)',
              }}
            >
              <MagicEdit style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Bottom hero info */}
        <div
          className="absolute bottom-0 left-0 w-full flex flex-col items-start"
          style={{ padding: 16, gap: 8 }}
        >
          {/* Host + title */}
          <div className="flex flex-col w-full" style={{ gap: 4 }}>
            <p
              className="font-silkscreen leading-none w-full"
              style={{ fontSize: 'var(--text-mini)', color: 'var(--color-primary)' }}
            >
              HOSTED BY : {event.creatorUsername ?? '—'}
            </p>
            <p
              className="font-body font-bold w-full"
              style={{
                fontSize:            20,
                lineHeight:          'normal',
                color:               'var(--color-primary)',
                fontVariationSettings: '"opsz" 14',
              }}
            >
              {event.title}
            </p>
          </div>

          {/* Date + location */}
          <div className="flex flex-col w-full" style={{ gap: 8 }}>
            <div className="flex items-center w-full" style={{ gap: 4 }}>
              <Calendar
                style={{ width: 12, height: 16, color: 'var(--color-secondary)', flexShrink: 0 }}
                aria-hidden="true"
              />
              <p
                className="font-body font-normal leading-none flex-1 min-w-0"
                style={{
                  fontSize:            'var(--text-xs)',
                  color:               'var(--color-secondary)',
                  fontVariationSettings: '"opsz" 14',
                }}
              >
                {format(new Date(event.event_date), "EEEE, MMMM d '@' h:mm a")}
              </p>
            </div>

            {event.location && (
              <div className="flex items-center w-full" style={{ gap: 4 }}>
                <span style={{ color: 'var(--color-blue)', display: 'flex', flexShrink: 0 }}>
                  <LocationPinIcon />
                </span>
                <p
                  className="font-body font-normal leading-none flex-1 min-w-0"
                  style={{
                    fontSize:            'var(--text-xs)',
                    color:               'var(--color-blue)',
                    fontVariationSettings: '"opsz" 14',
                    textDecoration:      'underline',
                    textDecorationStyle: 'solid',
                  }}
                >
                  {event.location}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto nexus-scroll flex flex-col"
        style={{
          gap:           24,
          padding:       16,
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), var(--space-8))',
        }}
      >
        {/* Description */}
        {event.description && (
          <div className="flex flex-col w-full" style={{ gap: 4 }}>
            <p
              className="font-body font-medium w-full"
              style={{
                fontSize:            'var(--text-sm)',
                color:               'var(--color-primary)',
                letterSpacing:       '0.2px',
                lineHeight:          'normal',
                fontVariationSettings: '"opsz" 14',
              }}
            >
              Description
            </p>
            <p
              className="font-body font-normal w-full"
              style={{
                fontSize:            14,
                color:               'var(--color-secondary)',
                lineHeight:          'normal',
                fontVariationSettings: '"opsz" 14',
              }}
            >
              {event.description}
            </p>
          </div>
        )}

        {/* Going */}
        <div className="flex flex-col w-full" style={{ gap: 8 }}>
          <p
            className="font-body font-medium flex-1 min-w-0"
            style={{
              fontSize:            'var(--text-sm)',
              color:               'var(--color-primary)',
              letterSpacing:       '0.2px',
              lineHeight:          'normal',
              fontVariationSettings: '"opsz" 14',
            }}
          >
            Going · {displayGoingProfiles.length} :
          </p>

          <div className="flex items-center" style={{ gap: 12 }}>
            {displayGoingProfiles.length === 0 ? (
              <p
                className="font-body font-normal"
                style={{
                  fontSize:            'var(--text-xs)',
                  color:               'var(--color-tertiary)',
                  fontVariationSettings: '"opsz" 14',
                }}
              >
                Be the first!
              </p>
            ) : (
              displayGoingProfiles.map((profile) => (
                <div
                  key={profile.id}
                  className="relative flex-shrink-0 rounded-full overflow-hidden"
                  style={{ width: 32, height: 32, background: 'var(--color-primary)' }}
                >
                  {profile.avatar_url ? (
                    <Image
                      src={resolveAvatarUrl(profile.avatar_url, 32)}
                      alt={profile.username}
                      fill
                      sizes="32px"
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

      {/* ── Bottom bar ───────────────────────────────────────── */}
      <div
        className="flex-shrink-0 w-full"
        style={{
          background:   'black',
          borderTop:    '1px solid var(--color-border)',
          paddingLeft:  16,
          paddingRight: 16,
          paddingTop:   16,
          paddingBottom: 28,
        }}
      >
        {rsvpStatus === 'going' ? (
          /* ── Going Confirmed (flat solid green) ──────────── */
          <div className="flex flex-col w-full" style={{ gap: 8 }}>
            <p
              className="font-body font-normal w-full"
              style={{
                fontSize:            'var(--text-xxs)',
                color:               'var(--color-tertiary)',
                letterSpacing:       '0.2px',
                lineHeight:          'normal',
                fontVariationSettings: '"opsz" 14',
                textAlign:           'right',
              }}
            >
              Tap to change your registration
            </p>
            <button
              onClick={() => setShowRegistration(true)}
              disabled={pending}
              className="w-full flex items-center justify-center overflow-hidden"
              style={{
                height:     48,
                gap:        8,
                background: 'var(--color-green)',
                paddingLeft:  16,
                paddingRight: 16,
                opacity:    pending ? 0.6 : 1,
              }}
            >
              <Check style={{ width: 16, height: 16, color: 'var(--color-primary)' }} aria-hidden="true" />
              <span
                className="font-silkscreen leading-none"
                style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary)' }}
              >
                Going Confirmed
              </span>
            </button>
          </div>
        ) : rsvpStatus === 'not_going' ? (
          /* ── Not Going (bordered red) ────────────────────── */
          <div className="flex flex-col w-full" style={{ gap: 8 }}>
            <p
              className="font-body font-normal w-full"
              style={{
                fontSize:            'var(--text-xxs)',
                color:               'var(--color-tertiary)',
                letterSpacing:       '0.2px',
                lineHeight:          'normal',
                fontVariationSettings: '"opsz" 14',
                textAlign:           'right',
              }}
            >
              Tap to change your registration
            </p>
            <button
              onClick={() => setShowRegistration(true)}
              disabled={pending}
              className="w-full flex items-center justify-center overflow-hidden"
              style={{
                height:     48,
                gap:        8,
                border:     '1px solid var(--color-red)',
                background: 'black',
                paddingLeft:  16,
                paddingRight: 16,
                opacity:    pending ? 0.6 : 1,
              }}
            >
              <Close style={{ width: 16, height: 16, color: 'var(--color-red)' }} aria-hidden="true" />
              <span
                className="font-silkscreen leading-none"
                style={{ fontSize: 'var(--text-xs)', color: 'var(--color-red)' }}
              >
                Not Going
              </span>
            </button>
          </div>
        ) : (
          /* ── No RSVP yet (bordered green) ───────────────── */
          <button
            onClick={handleGoingTap}
            disabled={pending}
            className="w-full flex items-center justify-center overflow-hidden"
            style={{
              height:     48,
              gap:        8,
              border:     '1px solid var(--color-green)',
              boxShadow:  '4px 4px 0px 0px rgba(34,197,94,0.5)',
              background: 'black',
              paddingLeft:  16,
              paddingRight: 16,
              opacity:    pending ? 0.6 : 1,
            }}
          >
            <Check style={{ width: 16, height: 16, color: 'var(--color-green)' }} aria-hidden="true" />
            <span
              className="font-silkscreen leading-none"
              style={{ fontSize: 'var(--text-xs)', color: 'var(--color-green)' }}
            >
              going
            </span>
          </button>
        )}
      </div>

      {/* ── Edit sheet (creator only) ─────────────────────────── */}
      {showEdit && (
        <EventCreationSheet
          crewId={crewId}
          currentUserId={currentUserId}
          eventId={event.id}
          initialValues={editInitialValues}
          onClose={() => setShowEdit(false)}
          onCreated={() => { setShowEdit(false); router.refresh() }}
        />
      )}

      {/* ── Registration sheet (change RSVP) ─────────────────── */}
      {showRegistration && (
        <EventRegistrationSheet
          onStayGoing={handleConfirmGoing}
          onNotGoing={handleNotGoing}
          onClose={() => setShowRegistration(false)}
        />
      )}
    </SlidePage>
  )
}
