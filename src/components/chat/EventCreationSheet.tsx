'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
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

  const inputClass =
    'w-full bg-black border border-[var(--color-border-hover)] text-[var(--color-primary)] ' +
    'placeholder:text-[var(--color-secondary)] font-body font-normal focus:outline-none ' +
    'focus:border-[var(--color-purple)] transition-colors'

  const inputStyle: React.CSSProperties = {
    fontSize: 'var(--text-sm)',
    padding: '12px',
    fontVariationSettings: '"opsz" 14',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 'var(--text-sm)',
    letterSpacing: '0.2px',
    fontVariationSettings: '"opsz" 14',
  }

  const hintStyle: React.CSSProperties = {
    fontSize: 'var(--text-xxs)',
    letterSpacing: '0.2px',
    fontVariationSettings: '"opsz" 14',
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
        className="relative w-full max-w-[480px] bg-black border-t border-[var(--color-border)] flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh', paddingBottom: 'max(env(safe-area-inset-bottom), 28px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex-1 overflow-y-auto nexus-scroll flex flex-col"
          style={{ gap: 'var(--x7)', padding: 'var(--x7) var(--x5) var(--x8)' }}
        >
          {/* Header */}
          <p
            className="font-body font-bold text-[var(--color-primary)] leading-none shrink-0"
            style={labelStyle}
          >
            New Event
          </p>

          {/* Form fields */}
          <div className="flex flex-col shrink-0" style={{ gap: 'var(--x5)' }}>

            {/* Title */}
            <div className="flex flex-col" style={{ gap: 'var(--x3)' }}>
              <p className="font-body font-medium text-[var(--color-primary)] leading-none" style={labelStyle}>
                Title <span className="text-[var(--red)]">*</span>
              </p>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 100))}
                placeholder="Option 1..."
                className={inputClass}
                style={inputStyle}
              />
            </div>

            {/* Date + Time */}
            <div className="flex" style={{ gap: 'var(--x5)' }}>
              <div className="flex flex-col flex-1 min-w-0" style={{ gap: 'var(--x3)' }}>
                <p className="font-body font-medium text-[var(--color-primary)] leading-none" style={labelStyle}>
                  Date
                </p>
                <input
                  type="date"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  className={inputClass}
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                />
              </div>
              <div className="flex flex-col flex-1 min-w-0" style={{ gap: 'var(--x3)' }}>
                <p className="font-body font-medium text-[var(--color-primary)] leading-none" style={labelStyle}>
                  Time
                </p>
                <input
                  type="time"
                  value={timeInput}
                  onChange={(e) => setTimeInput(e.target.value)}
                  className={inputClass}
                  style={{ ...inputStyle, colorScheme: 'dark' }}
                />
              </div>
            </div>

            {/* Location Name */}
            <div className="flex flex-col" style={{ gap: 'var(--x3)' }}>
              <p className="font-body font-medium text-[var(--color-primary)] leading-none" style={labelStyle}>
                Location Name <span className="text-[var(--red)]">*</span>
              </p>
              <input
                value={locationName}
                onChange={(e) => setLocationName(e.target.value.slice(0, 200))}
                placeholder="Add a location name..."
                className={inputClass}
                style={inputStyle}
              />
              <p className="font-body font-normal text-[var(--color-tertiary)]" style={hintStyle}>
                Adding location name will replace the text link.
              </p>
            </div>

            {/* Location Link */}
            <div className="flex flex-col" style={{ gap: 'var(--x3)' }}>
              <p className="font-body font-medium text-[var(--color-primary)] leading-none" style={labelStyle}>
                Location Link
              </p>
              <input
                value={locationLink}
                onChange={(e) => setLocationLink(e.target.value)}
                placeholder="Add a location link..."
                className={inputClass}
                style={inputStyle}
              />
              <p className="font-body font-normal text-[var(--color-tertiary)]" style={hintStyle}>
                Add a Google Maps or Apple Maps link for this event
              </p>
            </div>

            {/* Description */}
            <div className="flex flex-col" style={{ gap: 'var(--x3)' }}>
              <p className="font-body font-medium text-[var(--color-primary)] leading-none" style={labelStyle}>
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
              <p className="font-pixel leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-danger)' }}>
                {error}
              </p>
            )}
          </div>

          {/* Buttons */}
          <div className="flex flex-col shrink-0" style={{ gap: 'var(--x5)' }}>
            <button
              onClick={handleSubmit}
              disabled={submitting || !title.trim() || !locationName.trim() || !dateInput || !timeInput}
              className="w-full flex items-center justify-center font-silkscreen text-[var(--color-primary)] bg-[var(--color-purple)] overflow-hidden disabled:opacity-40"
              style={{ fontSize: 'var(--text-xs)', height: 48 }}
            >
              {submitting ? '...' : 'Create event'}
            </button>
            <button
              onClick={onClose}
              disabled={submitting}
              className="w-full flex items-center justify-center font-silkscreen text-[var(--red)] border border-[var(--red)] overflow-hidden disabled:opacity-40"
              style={{ fontSize: 'var(--text-xs)', height: 48 }}
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
