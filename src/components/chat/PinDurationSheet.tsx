'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { ChevronRight } from 'pixelarticons/react/ChevronRight'
import type { Message, MessageWithProfile } from '@/types'

interface PinDurationSheetProps {
  message: Message
  onClose: () => void
  onPinned: (patch: Partial<Message>) => void
}

const PRESETS: { label: string; value: string }[] = [
  { label: '15 minutes', value: '15' },
  { label: '1 hour',     value: '60' },
  { label: '6 hours',    value: '360' },
  { label: '1 day',      value: '1440' },
  { label: '1 week',     value: '10080' },
  { label: '1 month',    value: '43200' },
  { label: 'Permanent',  value: 'permanent' },
]

function truncateContent(content: string, maxLen = 80): string {
  if (content.startsWith('POLL:') || content.startsWith('BIRTHDAY:') || content.startsWith('JOIN:')) {
    return '[system message]'
  }
  return content.length > maxLen ? content.slice(0, maxLen) + '…' : content
}

export function PinDurationSheet({ message, onClose, onPinned }: PinDurationSheetProps) {
  const [selected, setSelected] = useState('15')
  const [pinning,  setPinning]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const profile  = (message as MessageWithProfile).profile
  const username = profile?.username ?? 'Unknown'
  const preview  = truncateContent(message.content)

  async function handlePin() {
    if (pinning) return
    setPinning(true)
    setError(null)

    const durationMinutes = selected === 'permanent' ? null : parseInt(selected, 10)

    try {
      const supabase = createClient()
      const { error: rpcError } = await supabase.rpc('pin_message', {
        p_message_id:       message.id,
        p_duration_minutes: durationMinutes,
      })

      if (rpcError) {
        const msg = rpcError.message ?? ''
        if (msg.includes('pin_cap_exceeded')) {
          setError('The board is full. Unpin something first.')
        } else if (msg.includes('only_admin')) {
          setError('Only the squad creator can pin messages.')
        } else {
          setError('Failed to pin. Try again.')
        }
        setPinning(false)
        return
      }

      const expiresAt = durationMinutes != null
        ? new Date(Date.now() + durationMinutes * 60000).toISOString()
        : null

      onPinned({
        pinned:         true,
        pinned_by:      message.user_id,
        pinned_at:      new Date().toISOString(),
        pin_expires_at: expiresAt,
      })
      onClose()
    } catch {
      setError('Failed to pin. Try again.')
      setPinning(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        key="pin-backdrop"
        className="fixed inset-0 z-[85] bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      />
      <motion.div
        key="pin-sheet"
        className="fixed bottom-0 left-0 right-0 z-[90] bg-black border-t border-border flex flex-col"
        style={{
          paddingTop: 24,
          paddingLeft: 16,
          paddingRight: 16,
          paddingBottom: 'max(env(safe-area-inset-bottom), 28px)',
          gap: 24,
        }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 400) onClose() }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <p
          className="font-body font-bold leading-none flex-shrink-0"
          style={{ fontSize: 16, color: 'var(--color-primary)', fontVariationSettings: '"opsz" 14' }}
        >
          Pin Message?
        </p>

        {/* Message preview card */}
        <div
          className="flex-shrink-0 w-full"
          style={{ background: 'var(--color-surface)', borderRadius: 8, padding: 16 }}
        >
          <div className="flex flex-col" style={{ gap: 4 }}>
            <p
              className="font-body font-medium w-full"
              style={{ fontSize: 14, color: 'var(--color-secondary)', fontVariationSettings: '"opsz" 14', lineHeight: 'normal', letterSpacing: '0.2px' }}
            >
              {preview}
            </p>
            <p
              className="font-body font-normal w-full"
              style={{ fontSize: 12, color: 'var(--color-tertiary)', fontVariationSettings: '"opsz" 14', lineHeight: 'normal', letterSpacing: '0.2px' }}
            >
              {`Sent by : @${username}`}
            </p>
          </div>
        </div>

        {/* Duration section */}
        <div className="flex-shrink-0 flex flex-col" style={{ gap: 8 }}>
          {/* Label */}
          <p
            className="font-body font-medium"
            style={{ fontSize: 14, color: 'var(--color-primary)', fontVariationSettings: '"opsz" 14', letterSpacing: '0.2px', lineHeight: 'normal' }}
          >
            Duration <span style={{ color: 'var(--color-danger)' }}>*</span>
          </p>

          {/* Select input */}
          <div
            className="relative flex items-center bg-black"
            style={{ border: '1px solid var(--color-border-hover)', padding: 12, gap: 8 }}
          >
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="flex-1 bg-transparent font-body font-normal appearance-none focus:outline-none min-w-0"
              style={{ fontSize: 14, color: 'var(--color-primary)', fontVariationSettings: '"opsz" 14', lineHeight: 'normal' }}
            >
              {PRESETS.map(({ label, value }) => (
                <option key={value} value={value} style={{ background: '#09090b', color: '#fafafa' }}>
                  {label}
                </option>
              ))}
            </select>
            <ChevronRight
              style={{ width: 16, height: 16, color: 'var(--color-primary)', transform: 'rotate(90deg)', flexShrink: 0, pointerEvents: 'none' }}
            />
          </div>

          {/* Helper text */}
          <p
            className="font-body font-normal"
            style={{ fontSize: 11, color: 'var(--color-tertiary)', fontVariationSettings: '"opsz" 14', letterSpacing: '0.2px', lineHeight: 'normal' }}
          >
            Set how long you want this message to be pinned for.
          </p>
        </div>

        {/* Error */}
        {error && (
          <p
            className="font-body font-normal flex-shrink-0 -mt-4"
            style={{ fontSize: 12, color: 'var(--color-danger)', lineHeight: 'normal' }}
          >
            {error}
          </p>
        )}

        {/* PIN IT button */}
        <button
          onClick={() => void handlePin()}
          disabled={pinning}
          className="flex-shrink-0 w-full flex items-center justify-center overflow-hidden disabled:opacity-40 transition-opacity"
          style={{ height: 48, background: 'var(--color-purple)' }}
        >
          <span className="font-silkscreen leading-none text-primary" style={{ fontSize: 12 }}>
            {pinning ? '...' : 'PIN IT'}
          </span>
        </button>
      </motion.div>
    </AnimatePresence>
  )
}
