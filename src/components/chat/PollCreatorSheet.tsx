'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Close } from 'pixelarticons/react/Close'
import { PlusBox } from 'pixelarticons/react/PlusBox'
import { createClient } from '@/lib/supabase/client'
import type { Message, MessageWithProfile, Profile } from '@/types'

const DURATION_OPTIONS = [5, 10, 15, 20] as const
type Duration = typeof DURATION_OPTIONS[number]

interface PollCreatorSheetProps {
  crewId:      string
  userProfile: Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url'>
  onClose:     () => void
  onCreated:   (message: MessageWithProfile) => void
}

export function PollCreatorSheet({ crewId, userProfile, onClose, onCreated }: PollCreatorSheetProps) {
  const [question,   setQuestion]   = useState('')
  const [options,    setOptions]    = useState(['', ''])
  const [duration,   setDuration]   = useState<Duration>(10)
  const [date,       setDate]       = useState(() => new Date().toISOString().slice(0, 10))
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  function addOption() {
    if (options.length < 5) setOptions((prev) => [...prev, ''])
  }

  function removeOption(idx: number) {
    if (options.length <= 2) return
    setOptions((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateOption(idx: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === idx ? value.slice(0, 100) : o)))
  }

  async function handleSubmit() {
    const trimmedQ    = question.trim()
    const trimmedOpts = options.map((o) => o.trim()).filter(Boolean)

    if (!trimmedQ)              { setError('Enter a question.'); return }
    if (trimmedOpts.length < 2) { setError('Add at least 2 options.'); return }

    // Build expires_at: selected date at current time-of-day + duration
    const now         = new Date()
    const localExpiry = new Date(date)
    localExpiry.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds())
    const expiresAt = new Date(localExpiry.getTime() + duration * 60_000)

    if (expiresAt <= now) { setError('Expiry must be in the future. Pick a later date or increase the duration.'); return }

    setSubmitting(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: raw, error: rpcError } = await supabase.rpc('create_poll', {
        p_crew_id:    crewId,
        p_question:   trimmedQ,
        p_options:    trimmedOpts,
        p_expires_at: expiresAt.toISOString(),
      })
      if (rpcError) throw rpcError
      if (!raw) throw new Error('No data returned')

      const msg = raw as Message
      const messageWithProfile: MessageWithProfile = {
        ...msg,
        reactions: {},
        profile: { id: userProfile.id, username: userProfile.username, avatar_class: userProfile.avatar_class, avatar_url: userProfile.avatar_url },
      }
      onCreated(messageWithProfile)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create poll')
    } finally {
      setSubmitting(false)
    }
  }

  const validOpts  = options.filter((o) => o.trim()).length
  const canSubmit  = question.trim().length > 0 && validOpts >= 2 && !submitting

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 z-[60] bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[70] bg-[#0a0612] border-t border-border flex flex-col"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        style={{ maxHeight: '92vh', paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 border-b border-border flex-shrink-0"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)', paddingBottom: 12 }}
        >
          <div className="flex flex-col gap-1">
            <p className="font-pixel text-[8px] text-tertiary leading-none">CREATE POLL</p>
            <h2
              className="font-body font-bold text-[18px] text-primary leading-none"
              style={{ fontVariationSettings: '"opsz" 14' }}
            >
              New Poll
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center text-tertiary active:opacity-60 transition-opacity"
            aria-label="Close"
          >
            <Close style={{ width: 20, height: 20 }} aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto nexus-scroll px-4 py-5 flex flex-col gap-6 min-h-0">

          {/* Question */}
          <div className="flex flex-col gap-2">
            <p className="font-silkscreen text-[8px] text-secondary leading-none tracking-[0.2px]">QUESTION</p>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value.slice(0, 200))}
              placeholder="What do you want to ask?"
              rows={2}
              className="w-full bg-black border border-border px-3 py-2 font-body text-[14px] text-primary placeholder:text-muted resize-none focus:outline-none focus:border-purple transition-colors leading-normal"
              style={{ maxHeight: 96, fontVariationSettings: '"opsz" 14' }}
            />
            <p className="font-silkscreen text-[8px] text-tertiary leading-none text-right">{question.length}/200</p>
          </div>

          {/* Options */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="font-silkscreen text-[8px] text-secondary leading-none tracking-[0.2px]">
                OPTIONS <span className="text-tertiary">({options.length}/5)</span>
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="flex-shrink-0 w-4 h-4 border-2 border-tertiary rounded-full" />
                  <input
                    value={opt}
                    onChange={(e) => updateOption(idx, e.target.value)}
                    placeholder={`Option ${idx + 1}`}
                    className="flex-1 bg-black border border-border h-10 px-3 font-body text-[14px] text-primary placeholder:text-muted focus:outline-none focus:border-purple transition-colors"
                    style={{ fontVariationSettings: '"opsz" 14' }}
                  />
                  {options.length > 2 && (
                    <button
                      onClick={() => removeOption(idx)}
                      className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-tertiary active:text-[#ef4444] transition-colors"
                      aria-label="Remove option"
                    >
                      <Close style={{ width: 14, height: 14 }} aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {options.length < 5 && (
              <button
                onClick={addOption}
                className="flex items-center gap-2 py-1 text-purple active:opacity-70 transition-opacity"
              >
                <PlusBox style={{ width: 16, height: 16 }} aria-hidden="true" />
                <span className="font-silkscreen text-[8px] leading-none">ADD OPTION</span>
              </button>
            )}
          </div>

          {/* Duration */}
          <div className="flex flex-col gap-2">
            <p className="font-silkscreen text-[8px] text-secondary leading-none tracking-[0.2px]">DURATION</p>
            <div className="flex gap-2">
              {DURATION_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={`flex-1 h-10 flex items-center justify-center border transition-colors ${
                    duration === d
                      ? 'bg-purple border-purple text-primary'
                      : 'bg-black border-border text-tertiary'
                  }`}
                >
                  <span className="font-silkscreen text-[8px] leading-none">{d}m</span>
                </button>
              ))}
            </div>
            <p className="font-silkscreen text-[8px] text-tertiary leading-none">
              Poll closes {duration} minutes after the selected date
            </p>
          </div>

          {/* Date */}
          <div className="flex flex-col gap-2">
            <p className="font-silkscreen text-[8px] text-secondary leading-none tracking-[0.2px]">DATE</p>
            <input
              type="date"
              value={date}
              min={today}
              onChange={(e) => setDate(e.target.value || today)}
              className="w-full bg-black border border-border h-10 px-3 font-body text-[14px] text-primary focus:outline-none focus:border-purple transition-colors"
              style={{ colorScheme: 'dark', fontVariationSettings: '"opsz" 14' }}
            />
          </div>

          {/* Error */}
          {error && (
            <p className="font-silkscreen text-[8px] text-[#ef4444] leading-relaxed">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-4 pt-3 border-t border-border flex flex-col gap-2">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full h-12 bg-purple flex items-center justify-center disabled:opacity-40 active:opacity-80 transition-opacity"
          >
            <span className="font-pixel text-[8px] text-primary leading-none">
              {submitting ? 'LAUNCHING...' : 'LAUNCH POLL'}
            </span>
          </button>
          <button
            onClick={onClose}
            disabled={submitting}
            className="w-full h-10 flex items-center justify-center active:opacity-70 transition-opacity"
          >
            <span className="font-silkscreen text-[8px] text-tertiary leading-none">CANCEL</span>
          </button>
        </div>
      </motion.div>
    </>
  )
}
