'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Upload } from 'pixelarticons/react/Upload'
import { createEventAction } from '@/app/(app)/chat/actions'

interface EventCreationSheetProps {
  crewId:         string
  currentUserId:  string
  onClose:        () => void
  onCreated?:     (eventId: string) => void
  createMessage?: boolean
}

export function EventCreationSheet({ crewId, onClose, onCreated, createMessage }: EventCreationSheetProps) {
  const [title,        setTitle]        = useState('')
  const [description,  setDescription]  = useState('')
  const [locationName, setLocationName] = useState('')
  const [locationLink, setLocationLink] = useState('')
  const [dateInput,    setDateInput]    = useState('')
  const [timeInput,    setTimeInput]    = useState('')
  const [submitting,   setSubmitting]   = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  async function handleSubmit() {
    if (submitting || !title.trim() || !locationName.trim() || !dateInput || !timeInput) return
    setError(null)
    setSubmitting(true)

    const eventDate = new Date(`${dateInput}T${timeInput}`).toISOString()

    const { eventId, error: actionError } = await createEventAction({
      crewId,
      title:       title.trim(),
      description: description.trim() || undefined,
      location:    locationName.trim() || undefined,
      eventDate,
      createMessage,
    })

    setSubmitting(false)
    if (actionError) { setError(actionError); return }
    onCreated?.(eventId!)
    onClose()
  }

  // Matches Figma: bg-black, border-[#3f3f46], muted placeholder (#71717a), DM Sans Regular 14px
  const inputClass =
    'w-full bg-black border border-[var(--color-border-hover)] ' +
    'text-[var(--color-primary)] placeholder:text-[var(--color-muted)] ' +
    'font-body font-normal focus:outline-none focus:border-[var(--color-purple)] transition-colors'

  const inputStyle: React.CSSProperties = {
    fontSize:             'var(--text-sm)',  // 14px
    padding:              '12px',
    fontVariationSettings: '"opsz" 14',
  }

  // DM Sans Medium 14px white tracking 0.2px — field labels
  const labelStyle: React.CSSProperties = {
    fontSize:             'var(--text-sm)',  // 14px
    letterSpacing:        '0.2px',
    fontVariationSettings: '"opsz" 14',
    lineHeight:           'normal',
  }

  // DM Sans Regular 11px tertiary tracking 0.2px — hint text below fields
  const hintStyle: React.CSSProperties = {
    fontSize:             'var(--text-xxs)', // 11px
    letterSpacing:        '0.2px',
    fontVariationSettings: '"opsz" 14',
    lineHeight:           'normal',
  }

  const content = (
    <motion.div
      className="fixed inset-0 z-[90] flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="relative w-full max-w-[480px] bg-black border-t border-[var(--color-border)] overflow-hidden"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Single scrollable column — everything scrolls together */}
        <div
          className="overflow-y-auto nexus-scroll flex flex-col"
          style={{
            gap:           'var(--x7)',          // 24px between header / fields / buttons
            paddingTop:    'var(--x7)',          // 24px
            paddingLeft:   'var(--x5)',          // 16px
            paddingRight:  'var(--x5)',          // 16px
            paddingBottom: 'max(env(safe-area-inset-bottom), var(--x8))', // ≥28px
          }}
        >

          {/* ── Header ─────────────────────────────────────── */}
          {/* DM Sans Bold 16px white — matches Figma var(--md, 16px) */}
          <p
            className="font-body font-bold text-[var(--color-primary)] shrink-0 w-full"
            style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14', lineHeight: 'normal' }}
          >
            New Event
          </p>

          {/* ── Fields — gap 16px between each group ──────── */}
          <div className="flex flex-col" style={{ gap: 'var(--x5)' }}>

            {/* Event Image */}
            <div className="flex flex-col" style={{ gap: 'var(--x3)' }}>
              <p className="font-body font-medium text-[var(--color-primary)]" style={labelStyle}>
                Event Image
              </p>
              {/* Upload button: purple border, Upload icon 16×16 purple, "upload photo" Silkscreen 12px purple */}
              <button
                type="button"
                className="w-full flex items-center justify-center overflow-hidden"
                style={{
                  height:      48,
                  gap:         8,
                  paddingLeft:  16,
                  paddingRight: 16,
                  border:      '1px solid var(--color-purple)',
                }}
              >
                <Upload
                  style={{ width: 16, height: 16, color: 'var(--color-purple)' }}
                  aria-hidden="true"
                />
                <span
                  className="font-silkscreen leading-none"
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--color-purple)' }}
                >
                  upload photo
                </span>
              </button>
            </div>

            {/* Title * */}
            <div className="flex flex-col" style={{ gap: 'var(--x3)' }}>
              <p className="font-body font-medium text-[var(--color-primary)]" style={labelStyle}>
                Title{' '}
                <span style={{ color: 'var(--red)', lineHeight: 'normal' }}>*</span>
              </p>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 100))}
                placeholder="Option 1..."
                className={inputClass}
                style={inputStyle}
              />
            </div>

            {/* Date + Time — side by side, 16px gap */}
            <div className="flex" style={{ gap: 'var(--x5)' }}>
              <div className="flex flex-col flex-1 min-w-0" style={{ gap: 'var(--x3)' }}>
                <p className="font-body font-medium text-[var(--color-primary)]" style={labelStyle}>
                  Date
                </p>
                <input
                  type="date"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  placeholder="MM/DD/YYYY"
                  className={inputClass}
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                />
              </div>
              <div className="flex flex-col flex-1 min-w-0" style={{ gap: 'var(--x3)' }}>
                <p className="font-body font-medium text-[var(--color-primary)]" style={labelStyle}>
                  Time
                </p>
                <input
                  type="time"
                  value={timeInput}
                  onChange={(e) => setTimeInput(e.target.value)}
                  placeholder="Set Time"
                  className={inputClass}
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                />
              </div>
            </div>

            {/* Location Name * */}
            <div className="flex flex-col" style={{ gap: 'var(--x3)' }}>
              <p className="font-body font-medium text-[var(--color-primary)]" style={labelStyle}>
                Location Name{' '}
                <span style={{ color: 'var(--red)', lineHeight: 'normal' }}>*</span>
              </p>
              <input
                value={locationName}
                onChange={(e) => setLocationName(e.target.value.slice(0, 200))}
                placeholder="Add a location name..."
                className={inputClass}
                style={inputStyle}
              />
              <p className="font-body font-normal text-[var(--color-tertiary)] w-full" style={hintStyle}>
                Adding location name will replace the text link.
              </p>
            </div>

            {/* Location Link */}
            <div className="flex flex-col" style={{ gap: 'var(--x3)' }}>
              <p className="font-body font-medium text-[var(--color-primary)]" style={labelStyle}>
                Location Link
              </p>
              <input
                value={locationLink}
                onChange={(e) => setLocationLink(e.target.value)}
                placeholder="Add a location link..."
                className={inputClass}
                style={inputStyle}
              />
              <p className="font-body font-normal text-[var(--color-tertiary)] w-full" style={hintStyle}>
                Add a Google Maps or Apple Maps link for this event
              </p>
            </div>

            {/* Description */}
            <div className="flex flex-col" style={{ gap: 'var(--x3)' }}>
              <p className="font-body font-medium text-[var(--color-primary)]" style={labelStyle}>
                Description
              </p>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                placeholder="Details about this event..."
                rows={3}
                className={`${inputClass} resize-none`}
                style={inputStyle}
              />
            </div>

            {error && (
              <p
                className="font-pixel leading-none"
                style={{ fontSize: 'var(--text-mini)', color: 'var(--color-danger)' }}
              >
                {error}
              </p>
            )}
          </div>

          {/* ── Buttons — gap 16px ─────────────────────────── */}
          <div className="flex flex-col" style={{ gap: 'var(--x5)' }}>
            {/* Create event — bg-purple, Silkscreen 12px white */}
            <button
              onClick={handleSubmit}
              disabled={submitting || !title.trim() || !locationName.trim() || !dateInput || !timeInput}
              className="w-full flex items-center justify-center font-silkscreen text-[var(--color-primary)] bg-[var(--color-purple)] overflow-hidden disabled:opacity-40"
              style={{ fontSize: 'var(--text-xs)', height: 48 }}
            >
              {submitting ? '...' : 'Create event'}
            </button>

            {/* Cancel — red border, Silkscreen 12px red */}
            <button
              onClick={onClose}
              disabled={submitting}
              className="w-full flex items-center justify-center font-silkscreen overflow-hidden disabled:opacity-40"
              style={{
                fontSize: 'var(--text-xs)',
                height:   48,
                color:    'var(--red)',
                border:   '1px solid var(--red)',
              }}
            >
              Cancel
            </button>
          </div>

        </div>
      </motion.div>
    </motion.div>
  )

  return createPortal(content, document.body)
}
