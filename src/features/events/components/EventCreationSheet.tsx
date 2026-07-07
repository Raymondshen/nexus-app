'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import type { Area } from 'react-easy-crop'
import { Upload } from 'pixelarticons/react/Upload'
import { createEventAction, updateEventAction } from '@/app/(app)/chat/actions'
import { createClient } from '@/shared/supabase/client'
import { compressCanvas } from '@/shared/utils/imageCompress'
import { drawCroppedCanvas } from '@/shared/utils/cropImage'
import { PhotoCropModal } from '@/shared/components/ui/PhotoCropModal'

function formatDateDisplay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${m}/${d}/${y}`
}

function formatTimeDisplay(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

interface NativeDateInputProps {
  value:     string
  onChange:  (v: string) => void
  placeholder: string
  inputType: 'date' | 'time'
}

function NativeDateInput({ value, onChange, placeholder, inputType }: NativeDateInputProps) {
  const display = value
    ? (inputType === 'date' ? formatDateDisplay(value) : formatTimeDisplay(value))
    : null

  return (
    <div className="relative w-full" onPointerDown={(e) => e.stopPropagation()}>
      {/* Figma-styled visual layer */}
      <div
        className="bg-black border border-[var(--color-border-hover)] font-body font-normal pointer-events-none"
        style={{ padding: '12px', fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14', lineHeight: 'normal' }}
      >
        <span style={{ color: display ? 'var(--color-primary)' : 'var(--color-muted)' }}>
          {display ?? placeholder}
        </span>
      </div>
      {/* Invisible native input — captures tap and opens OS picker */}
      <input
        type={inputType}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        style={{ zIndex: 1, colorScheme: 'dark' }}
      />
    </div>
  )
}

interface InitialValues {
  title:        string
  description:  string
  locationName: string
  locationLink: string
  dateInput:    string // YYYY-MM-DD
  timeInput:    string // HH:mm
}

interface EventCreationSheetProps {
  crewId:         string
  currentUserId:  string
  onClose:        () => void
  onCreated?:     (eventId: string) => void
  createMessage?: boolean
  // Edit mode — when provided the sheet updates rather than creates
  eventId?:       string
  initialValues?: InitialValues
}

export function EventCreationSheet({
  crewId,
  currentUserId,
  onClose,
  onCreated,
  createMessage,
  eventId,
  initialValues,
}: EventCreationSheetProps) {
  const isEdit = !!eventId

  const [title,        setTitle]        = useState(initialValues?.title        ?? '')
  const [description,  setDescription]  = useState(initialValues?.description  ?? '')
  const [locationName, setLocationName] = useState(initialValues?.locationName ?? '')
  const [locationLink, setLocationLink] = useState(initialValues?.locationLink ?? '')
  const [dateInput,    setDateInput]    = useState(initialValues?.dateInput    ?? '')
  const [timeInput,    setTimeInput]    = useState(initialValues?.timeInput    ?? '')
  const [submitting,   setSubmitting]   = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  const [pendingCoverImage, setPendingCoverImage] = useState<File | null>(null)
  const [coverImageBlob,    setCoverImageBlob]    = useState<Blob | null>(null)
  const [coverImagePreview, setCoverImagePreview] = useState<string | null>(null)
  const fileInputRef  = useRef<HTMLInputElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { titleInputRef.current?.blur() }, [])

  useEffect(() => {
    return () => { if (coverImagePreview) URL.revokeObjectURL(coverImagePreview) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setPendingCoverImage(file)
    e.target.value = ''
  }

  async function handleCoverCropConfirm(area: Area, img: HTMLImageElement) {
    setPendingCoverImage(null)
    const blob = await compressCanvas(drawCroppedCanvas(img, area, 1200, 900))
    if (coverImagePreview) URL.revokeObjectURL(coverImagePreview)
    setCoverImageBlob(blob)
    setCoverImagePreview(URL.createObjectURL(blob))
  }

  async function handleSubmit() {
    if (submitting || !title.trim() || !locationName.trim() || !dateInput || !timeInput) return
    setError(null)
    setSubmitting(true)

    const eventDate = new Date(`${dateInput}T${timeInput}`).toISOString()

    // Upload cover image if selected (create mode only)
    let coverImageUrl: string | undefined
    if (coverImageBlob && !isEdit) {
      try {
        const supabase = createClient()
        const ts = Date.now()
        const path = `${crewId}/${currentUserId}/event-cover-${ts}.webp`
        const { error: uploadError } = await supabase.storage
          .from('chat-images')
          .upload(path, coverImageBlob, { contentType: 'image/webp', cacheControl: '31536000' })
        if (uploadError) { setError('Image upload failed. Try again.'); setSubmitting(false); return }
        const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(path)
        coverImageUrl = publicUrl
      } catch {
        setError('Image upload failed. Try again.')
        setSubmitting(false)
        return
      }
    }

    if (isEdit) {
      const { error: actionError } = await updateEventAction({
        eventId:     eventId!,
        title:       title.trim(),
        description: description.trim() || undefined,
        location:    locationName.trim() || undefined,
        eventDate,
      })
      setSubmitting(false)
      if (actionError) { setError(actionError); return }
      onCreated?.(eventId!)
      onClose()
    } else {
      const { eventId: newId, error: actionError } = await createEventAction({
        crewId,
        title:       title.trim(),
        description: description.trim() || undefined,
        location:    locationName.trim() || undefined,
        eventDate,
        coverImageUrl,
        createMessage,
      })
      setSubmitting(false)
      if (actionError) { setError(actionError); return }
      onCreated?.(newId!)
      onClose()
    }
  }

  const inputClass =
    'w-full bg-black border border-[var(--color-border-hover)] ' +
    'text-[var(--color-primary)] placeholder:text-[var(--color-muted)] ' +
    'font-body font-normal focus:outline-none focus:border-[var(--color-purple)] transition-colors'

  const inputStyle: React.CSSProperties = {
    fontSize:             'var(--text-sm)',
    padding:              '12px',
    fontVariationSettings: '"opsz" 14',
  }

  const labelStyle: React.CSSProperties = {
    fontSize:             'var(--text-sm)',
    letterSpacing:        '0.2px',
    fontVariationSettings: '"opsz" 14',
    lineHeight:           'normal',
  }

  const hintStyle: React.CSSProperties = {
    fontSize:             'var(--text-xxs)',
    letterSpacing:        '0.2px',
    fontVariationSettings: '"opsz" 14',
    lineHeight:           'normal',
  }

  const content = (
    <motion.div
      className="fixed inset-0 z-[90] flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 400) onClose() }}
        className="relative w-full max-w-[480px] bg-[var(--color-surface-sheet)] rounded-tl-[16px] rounded-tr-[16px] overflow-hidden"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="overflow-y-auto nexus-scroll flex flex-col"
          style={{
            gap:           'var(--x7)',
            paddingTop:    'var(--x7)',
            paddingLeft:   'var(--x5)',
            paddingRight:  'var(--x5)',
            paddingBottom: 'max(env(safe-area-inset-bottom), var(--x8))',
          }}
        >
          {/* ── Header ─────────────────────────────────────── */}
          <p
            className="font-body font-bold text-[var(--color-primary)] shrink-0 w-full"
            style={{ fontSize: 'var(--text-md)', fontVariationSettings: '"opsz" 14', lineHeight: 'normal' }}
          >
            {isEdit ? 'Edit Event' : 'New Event'}
          </p>

          {/* ── Fields ────────────────────────────────────── */}
          <div className="flex flex-col" style={{ gap: 'var(--x5)' }}>

            {/* Event Image (create only) */}
            {!isEdit && (
              <div className="flex flex-col" style={{ gap: 'var(--x3)' }}>
                <p className="font-body font-medium text-[var(--color-primary)]" style={labelStyle}>
                  Event Image
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {coverImagePreview && <img
                  src={coverImagePreview}
                  alt="Event cover preview"
                  style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }}
                />}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center overflow-hidden"
                  style={{ height: 48, gap: 8, paddingLeft: 16, paddingRight: 16, border: '1px solid var(--color-purple)' }}
                >
                  <Upload style={{ width: 16, height: 16, color: 'var(--color-purple)' }} aria-hidden="true" />
                  <span className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-purple)' }}>
                    {coverImageBlob ? 'change photo' : 'upload photo'}
                  </span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  aria-hidden="true"
                />
                <PhotoCropModal
                  file={pendingCoverImage}
                  aspect={4 / 3}
                  cropShape="rect"
                  title="EVENT IMAGE"
                  onCancel={() => setPendingCoverImage(null)}
                  onConfirm={handleCoverCropConfirm}
                />
              </div>
            )}

            {/* Title * */}
            <div className="flex flex-col" style={{ gap: 'var(--x3)' }}>
              <p className="font-body font-medium text-[var(--color-primary)]" style={labelStyle}>
                Title{' '}
                <span style={{ color: 'var(--red)', lineHeight: 'normal' }}>*</span>
              </p>
              <input
                ref={titleInputRef}
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
                <p className="font-body font-medium text-[var(--color-primary)]" style={labelStyle}>
                  Date
                </p>
                <NativeDateInput
                  value={dateInput}
                  onChange={setDateInput}
                  placeholder="MM/DD/YYYY"
                  inputType="date"
                />
              </div>
              <div className="flex flex-col flex-1 min-w-0" style={{ gap: 'var(--x3)' }}>
                <p className="font-body font-medium text-[var(--color-primary)]" style={labelStyle}>
                  Time
                </p>
                <NativeDateInput
                  value={timeInput}
                  onChange={setTimeInput}
                  placeholder="Set Time"
                  inputType="time"
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
              <p className="font-pixel leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-danger)' }}>
                {error}
              </p>
            )}
          </div>

          {/* ── Buttons ───────────────────────────────────── */}
          <div className="flex flex-col" style={{ gap: 'var(--x5)' }}>
            <button
              onClick={handleSubmit}
              disabled={submitting || !title.trim() || !locationName.trim() || !dateInput || !timeInput}
              className="w-full flex items-center justify-center font-silkscreen text-[var(--color-primary)] bg-[var(--color-purple)] overflow-hidden disabled:opacity-40"
              style={{ fontSize: 'var(--text-xs)', height: 48 }}
            >
              {submitting ? '...' : isEdit ? 'Save changes' : 'Create event'}
            </button>

            <button
              onClick={onClose}
              disabled={submitting}
              className="w-full flex items-center justify-center font-silkscreen overflow-hidden disabled:opacity-40"
              style={{ fontSize: 'var(--text-xs)', height: 48, color: 'var(--red)', border: '1px solid var(--red)' }}
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
