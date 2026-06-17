'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { PIN_MAX_DURATION_MINUTES } from '@/lib/config'
import type { Message } from '@/types'

interface PinDurationSheetProps {
  message: Message
  onClose: () => void
  onPinned: (patch: Partial<Message>) => void
}

const PRESETS: { label: string; minutes: number | null }[] = [
  { label: '15 min',   minutes: 15 },
  { label: '1 hour',   minutes: 60 },
  { label: '6 hours',  minutes: 360 },
  { label: '1 day',    minutes: 1440 },
  { label: '1 week',   minutes: 10080 },
  { label: '1 month',  minutes: 43200 },
  { label: 'Permanent', minutes: null },
]

type Step = 'confirm' | 'duration'
type CustomUnit = 'minutes' | 'hours' | 'days' | 'months'

const UNIT_MULTIPLIERS: Record<CustomUnit, number> = {
  minutes: 1,
  hours:   60,
  days:    1440,
  months:  43200,
}

function truncateContent(content: string, maxLen = 80): string {
  if (content.startsWith('POLL:') || content.startsWith('BIRTHDAY:') || content.startsWith('JOIN:')) {
    return '[system message]'
  }
  return content.length > maxLen ? content.slice(0, maxLen) + '…' : content
}

export function PinDurationSheet({ message, onClose, onPinned }: PinDurationSheetProps) {
  const [step,           setStep]          = useState<Step>('confirm')
  const [pinning,        setPinning]       = useState(false)
  const [error,          setError]         = useState<string | null>(null)
  const [customValue,    setCustomValue]   = useState('')
  const [customUnit,     setCustomUnit]    = useState<CustomUnit>('hours')
  const [showCustom,     setShowCustom]    = useState(false)

  async function handlePin(durationMinutes: number | null) {
    if (pinning) return
    setPinning(true)
    setError(null)
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

  function handleCustomPin() {
    const val = parseInt(customValue, 10)
    if (!val || val <= 0) { setError('Enter a valid number.'); return }
    const mins = val * UNIT_MULTIPLIERS[customUnit]
    if (mins > PIN_MAX_DURATION_MINUTES) { setError('Max duration is ~1 year.'); return }
    void handlePin(mins)
  }

  const preview = truncateContent(message.content)

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
        className="fixed bottom-0 left-0 right-0 z-[90] bg-[#0a0612] border-t border-border flex flex-col"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
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
        {step === 'confirm' ? (
          <>
            {/* Header */}
            <div className="px-5 pt-5 pb-4 flex flex-col gap-2">
              <p className="font-pixel text-[8px] text-tertiary leading-none">PIN MESSAGE</p>
              <p
                className="font-body font-normal leading-snug"
                style={{ fontSize: 'var(--text-xs)', color: 'var(--color-secondary)', fontVariationSettings: '"opsz" 14' }}
              >
                Pin this message to the board?
              </p>
              {/* Message preview */}
              <div className="border border-border px-3 py-2 mt-1">
                <p
                  className="font-body font-normal leading-normal text-primary"
                  style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}
                >
                  {preview}
                </p>
              </div>
            </div>

            <div className="border-t border-border" />

            {/* Actions */}
            <div className="px-5 py-4 flex flex-col gap-3">
              <button
                onClick={() => setStep('duration')}
                className="w-full h-12 bg-purple flex items-center justify-center overflow-hidden"
                style={{ boxShadow: '4px 4px 0px 0px rgba(168,85,247,0.5)' }}
              >
                <span className="font-pixel text-[8px] text-primary leading-none">PIN IT</span>
              </button>
              <button
                onClick={onClose}
                className="w-full h-12 flex items-center justify-center"
              >
                <span className="font-pixel text-[8px] text-tertiary leading-none">CANCEL</span>
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Header */}
            <div className="px-5 pt-5 pb-4 flex flex-col gap-2">
              <p className="font-pixel text-[8px] text-tertiary leading-none">HOW LONG?</p>
              <p
                className="font-body font-normal leading-snug"
                style={{ fontSize: 'var(--text-xs)', color: 'var(--color-secondary)', fontVariationSettings: '"opsz" 14' }}
              >
                Choose how long to keep it pinned.
              </p>
            </div>

            <div className="border-t border-border" />

            {/* Duration presets */}
            <div className="px-5 py-4 flex flex-col gap-0">
              {PRESETS.map(({ label, minutes }) => (
                <button
                  key={label}
                  onClick={() => void handlePin(minutes)}
                  disabled={pinning}
                  className="w-full flex items-center justify-between py-3 border-b border-border/50 active:bg-[#111111] transition-colors disabled:opacity-40"
                >
                  <span
                    className="font-body font-normal text-primary"
                    style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
                  >
                    {label}
                  </span>
                  {minutes === null && (
                    <span className="font-silkscreen text-purple leading-none" style={{ fontSize: 'var(--text-mini)' }}>
                      ∞
                    </span>
                  )}
                </button>
              ))}

              {/* Custom duration */}
              <button
                onClick={() => setShowCustom((v) => !v)}
                className="w-full flex items-center justify-between py-3 active:bg-[#111111] transition-colors"
              >
                <span
                  className="font-body font-normal text-primary"
                  style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
                >
                  Custom…
                </span>
              </button>

              {showCustom && (
                <div className="flex items-center gap-2 py-2">
                  <input
                    type="number"
                    min={1}
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                    placeholder="e.g. 3"
                    className="flex-1 bg-black border border-border text-primary font-body focus:outline-none focus:border-purple"
                    style={{ fontSize: 16, padding: '10px 12px', fontVariationSettings: '"opsz" 14' }}
                  />
                  <select
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value as CustomUnit)}
                    className="bg-black border border-border text-primary font-body focus:outline-none focus:border-purple"
                    style={{ fontSize: 16, padding: '10px 12px', fontVariationSettings: '"opsz" 14' }}
                  >
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                    <option value="months">Months</option>
                  </select>
                  <button
                    onClick={handleCustomPin}
                    disabled={pinning || !customValue}
                    className="flex-shrink-0 h-11 px-4 bg-purple flex items-center justify-center disabled:opacity-40 overflow-hidden"
                  >
                    <span className="font-pixel text-[8px] text-primary leading-none whitespace-nowrap">PIN</span>
                  </button>
                </div>
              )}
            </div>

            {error && (
              <p className="px-5 pb-2 font-pixel text-[8px] text-[var(--color-danger)] leading-none">{error}</p>
            )}

            <div className="px-5 pt-2 border-t border-border">
              <button
                onClick={onClose}
                className="w-full h-12 flex items-center justify-center"
              >
                <span className="font-pixel text-[8px] text-tertiary leading-none">CANCEL</span>
              </button>
            </div>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
