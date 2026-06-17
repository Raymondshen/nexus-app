'use client'

import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { compressImage, validateImageUpload } from '@/lib/utils/imageProcessing'
import { useOGPreview } from '@/lib/utils/useOGPreview'
import { createEventAction } from '@/app/(app)/chat/actions'

interface EventCreationSheetProps {
  crewId:        string
  currentUserId: string
  onClose:       () => void
  onCreated?:    (eventId: string) => void
  createMessage?: boolean
}

function isValidUrl(str: string): boolean {
  try {
    const u = new URL(str)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function EventCreationSheet({ crewId, currentUserId, onClose, onCreated, createMessage }: EventCreationSheetProps) {
  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [location,    setLocation]    = useState('')
  const [dateInput,   setDateInput]   = useState('')
  const [timeInput,   setTimeInput]   = useState('')
  const [urlInput,    setUrlInput]    = useState('')
  const [ogUrl,       setOgUrl]       = useState<string | undefined>(undefined)
  const [manualImage, setManualImage] = useState<string | null>(null)
  const [uploading,   setUploading]   = useState(false)
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: ogData, loading: ogLoading } = useOGPreview(ogUrl)

  const coverImageUrl = ogData?.image ?? manualImage ?? null

  function handleUrlBlur() {
    const val = urlInput.trim()
    if (val && isValidUrl(val)) setOgUrl(val)
    else setOgUrl(undefined)
  }

  async function handleManualUpload(file: File) {
    const validation = validateImageUpload(file)
    if (!validation.ok) { setError(validation.error); return }
    setUploading(true)
    setError(null)
    try {
      const compressed = await compressImage(file, { maxWidthOrHeight: 1200, quality: 0.80 })
      const supabase = createClient()
      const path = `event-covers/${currentUserId}/${Date.now()}.webp`
      const { error: uploadError } = await supabase.storage
        .from('chat-images')
        .upload(path, compressed, { contentType: 'image/webp', cacheControl: '31536000' })
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(path)
      setManualImage(publicUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit() {
    if (submitting || !title.trim() || !dateInput || !timeInput) return
    setError(null)
    setSubmitting(true)

    const eventDate = new Date(`${dateInput}T${timeInput}`).toISOString()

    const { eventId, error: actionError } = await createEventAction({
      crewId,
      title: title.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      eventDate,
      coverImageUrl: coverImageUrl ?? undefined,
      createMessage,
    })

    setSubmitting(false)
    if (actionError) { setError(actionError); return }
    onCreated?.(eventId!)
    onClose()
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
        className="relative w-full max-w-[480px] bg-surface border-t border-border flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 flex-shrink-0">
          <p className="font-pixel text-primary leading-none" style={{ fontSize: 'var(--text-xs)' }}>
            NEW EVENT
          </p>
          <button onClick={onClose} className="font-pixel text-tertiary leading-none" style={{ fontSize: 'var(--text-mini)' }}>
            CLOSE
          </button>
        </div>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto nexus-scroll flex flex-col" style={{ gap: 'var(--space-4)', padding: '0 var(--space-5) var(--space-5)' }}>

          {/* Title */}
          <div className="flex flex-col gap-1">
            <label className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
              TITLE *
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 100))}
              placeholder="What's the event?"
              className="w-full bg-transparent border border-border font-body text-primary placeholder:text-muted focus:outline-none focus:border-purple transition-colors"
              style={{ fontSize: 'var(--text-sm)', padding: 'var(--space-3) var(--space-4)', fontVariationSettings: '"opsz" 14', minHeight: 48 }}
            />
          </div>

          {/* Date + Time */}
          <div className="flex gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <label className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
                DATE *
              </label>
              <input
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                className="w-full bg-transparent border border-border font-body text-primary focus:outline-none focus:border-purple transition-colors"
                style={{ fontSize: 16, padding: 'var(--space-3) var(--space-4)', fontVariationSettings: '"opsz" 14', minHeight: 48, colorScheme: 'dark' }}
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
                TIME *
              </label>
              <input
                type="time"
                value={timeInput}
                onChange={(e) => setTimeInput(e.target.value)}
                className="w-full bg-transparent border border-border font-body text-primary focus:outline-none focus:border-purple transition-colors"
                style={{ fontSize: 16, padding: 'var(--space-3) var(--space-4)', fontVariationSettings: '"opsz" 14', minHeight: 48, colorScheme: 'dark' }}
              />
            </div>
          </div>

          {/* Location */}
          <div className="flex flex-col gap-1">
            <label className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
              LOCATION
            </label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value.slice(0, 200))}
              placeholder="Where?"
              className="w-full bg-transparent border border-border font-body text-primary placeholder:text-muted focus:outline-none focus:border-purple transition-colors"
              style={{ fontSize: 'var(--text-sm)', padding: 'var(--space-3) var(--space-4)', fontVariationSettings: '"opsz" 14', minHeight: 48 }}
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1">
            <label className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
              DESCRIPTION
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 500))}
              placeholder="Details..."
              rows={3}
              className="w-full bg-transparent border border-border font-body text-primary placeholder:text-muted focus:outline-none focus:border-purple transition-colors resize-none"
              style={{ fontSize: 'var(--text-sm)', padding: 'var(--space-3) var(--space-4)', fontVariationSettings: '"opsz" 14' }}
            />
          </div>

          {/* Cover image — URL or upload */}
          <div className="flex flex-col gap-2">
            <label className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
              COVER IMAGE
            </label>
            <input
              value={urlInput}
              onChange={(e) => { setUrlInput(e.target.value); if (!e.target.value) { setOgUrl(undefined) } }}
              onBlur={handleUrlBlur}
              placeholder="Paste a URL to pull image..."
              className="w-full bg-transparent border border-border font-body text-primary placeholder:text-muted focus:outline-none focus:border-purple transition-colors"
              style={{ fontSize: 'var(--text-sm)', padding: 'var(--space-3) var(--space-4)', fontVariationSettings: '"opsz" 14', minHeight: 48 }}
            />

            {/* OG image preview */}
            {ogLoading && (
              <div className="w-full h-24 bg-border animate-pulse" />
            )}
            {ogData?.image && !ogLoading && (
              <div className="relative w-full" style={{ aspectRatio: '4/3', maxHeight: 160 }}>
                <Image src={ogData.image} alt="Cover preview" fill sizes="400px" className="object-cover" unoptimized />
              </div>
            )}

            {/* Manual upload fallback */}
            {!ogData?.image && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center justify-center font-silkscreen text-tertiary border border-dashed border-border disabled:opacity-50"
                style={{ fontSize: 'var(--text-mini)', minHeight: 44, padding: 'var(--space-3)' }}
              >
                {uploading ? 'Uploading...' : manualImage ? 'Change image' : 'Or upload image'}
              </button>
            )}
            {manualImage && !ogData?.image && (
              <div className="relative w-full" style={{ aspectRatio: '4/3', maxHeight: 160 }}>
                <Image src={manualImage} alt="Cover preview" fill sizes="400px" className="object-cover" unoptimized />
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleManualUpload(f) }}
            />
          </div>

          {error && (
            <p className="font-pixel leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-danger)' }}>
              {error}
            </p>
          )}
        </div>

        {/* Submit */}
        <div className="flex-shrink-0 px-5 pt-3">
          <button
            onClick={handleSubmit}
            disabled={submitting || !title.trim() || !dateInput || !timeInput}
            className="w-full flex items-center justify-center font-pixel text-primary disabled:opacity-40"
            style={{
              fontSize: 'var(--text-xxs)',
              minHeight: 48,
              background: submitting ? '#4c1d95' : 'var(--color-purple)',
              boxShadow: '4px 4px 0px 0px rgba(168,85,247,0.4)',
              transition: 'background 0.15s',
            }}
          >
            {submitting ? '...' : 'Mark your calendar.'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )

  return createPortal(content, document.body)
}
