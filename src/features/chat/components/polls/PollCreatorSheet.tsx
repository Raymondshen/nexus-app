'use client'

import { useState, useRef, useEffect } from 'react'
import { BottomSheet } from '@/shared/components/ui/BottomSheet'
import { Close } from 'pixelarticons/react/Close'
import { PlusBox } from 'pixelarticons/react/PlusBox'
import { createClient } from '@/shared/supabase/client'
import { Button } from '@/shared/components/ui/Button'
import type { Message, MessageWithProfile, Profile } from '@/types'

const DURATION_OPTIONS = [
  { value: 30,   label: '30 min',  hint: 'Poll closes in 30 minutes' },
  { value: 360,  label: '6 hours', hint: 'Poll closes in 6 hours' },
  { value: 1440, label: '1 day',   hint: 'Poll closes in 1 day' },
] as const

type DurationValue = 30 | 360 | 1440

interface PollCreatorSheetProps {
  crewId:      string
  userProfile: Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url' | 'status'>
  onClose:     () => void
  onCreated:   (message: MessageWithProfile) => void
}

export function PollCreatorSheet({ crewId, userProfile, onClose, onCreated }: PollCreatorSheetProps) {
  const [question,   setQuestion]   = useState('')
  const [options,    setOptions]    = useState(['', ''])
  const [duration,   setDuration]   = useState<DurationValue>(30)
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  const questionRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { questionRef.current?.blur() }, [])

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

    const expiresAt = new Date(Date.now() + duration * 60_000)

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
        profile: { id: userProfile.id, username: userProfile.username, avatar_class: userProfile.avatar_class, avatar_url: userProfile.avatar_url, status: userProfile.status },
      }
      onCreated(messageWithProfile)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create poll')
    } finally {
      setSubmitting(false)
    }
  }

  const validOpts = options.filter((o) => o.trim()).length
  const canSubmit = question.trim().length > 0 && validOpts >= 2 && !submitting
  const activeHint = DURATION_OPTIONS.find((d) => d.value === duration)?.hint ?? ''

  return (
    <BottomSheet onClose={onClose} zIndex={70} maxHeight="92vh">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto nexus-scroll px-4 flex flex-col gap-[var(--space-7)] min-h-0">

          {/* Title */}
          <h2
            className="font-body font-bold text-[18px] text-primary leading-none flex-shrink-0"
            style={{ fontVariationSettings: '"opsz" 14' }}
          >
            Create a poll
          </h2>

          {/* Field groups */}
          <div className="flex flex-col gap-[var(--space-5)] flex-shrink-0">

            {/* Question */}
            <div className="flex flex-col gap-[var(--space-3)]">
              <p
                className="font-body font-medium text-[14px] text-primary tracking-[0.2px] leading-none"
                style={{ fontVariationSettings: '"opsz" 14' }}
              >
                Question
              </p>
              <textarea
                ref={questionRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value.slice(0, 200))}
                placeholder="What do you want to ask?"
                className="w-full h-[60px] bg-black border border-border-hover px-3 py-3 font-body text-[14px] text-primary placeholder:text-muted resize-none focus:outline-none focus:border-purple transition-colors leading-normal"
                style={{ fontVariationSettings: '"opsz" 14' }}
              />
            </div>

            {/* Options */}
            <div className="flex flex-col gap-[var(--space-3)]">
              <p
                className="font-body font-medium text-[14px] text-primary tracking-[0.2px] leading-none"
                style={{ fontVariationSettings: '"opsz" 14' }}
              >
                Options {options.length} of 5
              </p>

              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    value={opt}
                    onChange={(e) => updateOption(idx, e.target.value)}
                    placeholder={`Option ${idx + 1}...`}
                    className="flex-1 bg-black border border-border-hover px-3 py-3 font-body text-[14px] text-primary placeholder:text-muted focus:outline-none focus:border-purple transition-colors"
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

              {options.length < 5 && (
                <button
                  onClick={addOption}
                  className="self-start flex items-center gap-1 border border-purple px-1 py-1 active:opacity-70 transition-opacity"
                >
                  <PlusBox style={{ width: 12, height: 12, color: 'var(--color-purple)' }} aria-hidden="true" />
                  <span className="font-silkscreen text-[11px] text-purple leading-none">Add option</span>
                </button>
              )}
            </div>

            {/* Duration */}
            <div className="flex flex-col gap-[var(--space-3)]">
              <p
                className="font-body font-medium text-[14px] text-primary tracking-[0.2px] leading-none"
                style={{ fontVariationSettings: '"opsz" 14' }}
              >
                Duration until it closes.
              </p>
              <div className="flex gap-2">
                {DURATION_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setDuration(value)}
                    className={`flex-1 py-3 flex items-center justify-center transition-colors font-body text-[14px] ${
                      duration === value
                        ? 'bg-purple text-primary'
                        : 'bg-black border border-border-hover text-muted'
                    }`}
                    style={{ fontVariationSettings: '"opsz" 14' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p
                className="font-body text-[11px] text-tertiary tracking-[0.2px] leading-normal"
                style={{ fontVariationSettings: '"opsz" 14' }}
              >
                {activeHint}
              </p>
            </div>

          </div>

          {/* Error */}
          {error && (
            <p className="font-silkscreen text-[8px] text-[#ef4444] leading-relaxed flex-shrink-0">{error}</p>
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex-shrink-0 px-4 pt-6 flex flex-col gap-4" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            loading={submitting}
            className="w-full"
          >
            Launch poll
          </Button>
          <Button variant="outlined" color="red" onClick={onClose} disabled={submitting} className="w-full">
            Cancel
          </Button>
        </div>
    </BottomSheet>
  )
}
