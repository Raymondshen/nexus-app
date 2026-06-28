'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { suggestDefinitionAction } from '@/app/(app)/chat/[crewId]/definitions/actions'
import { Button } from '@/shared/components/ui/Button'
import type { SquadDefinitionWithCreator } from '@/types'

interface SuggestDefinitionSheetProps {
  crewId:     string
  definition: SquadDefinitionWithCreator
  onClose:    () => void
  onSaved?:   () => void
  /** z-index base — defaults to 90/100 to sit above chat portals */
  zBase?:     number
}

export function SuggestDefinitionSheet({
  crewId,
  definition,
  onClose,
  onSaved,
  zBase = 90,
}: SuggestDefinitionSheetProps) {
  const aliases     = definition.word.split(',').map((w) => w.trim()).filter(Boolean).join(', ')
  const displayWord = definition.actual_word || definition.word.split(',')[0].trim()

  const [suggestion, setSuggestion] = useState('')
  const [error,      setError]      = useState('')
  const [saving,     setSaving]     = useState(false)

  const suggestionRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { suggestionRef.current?.blur() }, [])

  async function handleSuggest() {
    if (!suggestion.trim()) { setError('Please write your suggestion.'); return }
    setSaving(true)
    setError('')
    const result = await suggestDefinitionAction(definition.id, crewId, suggestion)
    setSaving(false)
    if (result.error) { setError(result.error); return }
    onSaved?.()
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 bg-black/60"
        style={{ zIndex: zBase }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Sheet — Figma 143:660 */}
      <motion.div
        className="fixed bottom-0 left-0 right-0 bg-[var(--color-surface-sheet)] rounded-tl-[16px] rounded-tr-[16px] flex flex-col px-4 overflow-y-auto"
        style={{ zIndex: zBase + 10, gap: 'var(--space-7)', maxHeight: '90vh', paddingTop: 12, paddingBottom: 'max(env(safe-area-inset-bottom), 28px)' }}
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
        {/* Title — DM Sans Bold 18px text-primary */}
        <h2
          className="font-body font-bold text-[18px] text-primary leading-none flex-shrink-0"
          style={{ fontVariationSettings: '"opsz" 14' }}
        >
          Suggest New Definition
        </h2>

        {/* Existing definition preview */}
        <div className="flex flex-col items-start w-full flex-shrink-0" style={{ gap: 'var(--space-5)' }}>
          <div className="flex flex-col items-start justify-center w-full" style={{ gap: 'var(--space-3)' }}>
            <p
              className="font-silkscreen text-tertiary leading-none w-full"
              style={{ fontSize: 'var(--text-mini)' }}
            >
              {aliases}
            </p>
            <div className="flex flex-col w-full" style={{ gap: 'var(--space-2)' }}>
              <p
                className="font-body font-bold leading-none w-full"
                style={{ fontSize: 'var(--text-md)', color: 'var(--color-blue)', fontVariationSettings: '"opsz" 14' }}
              >
                {displayWord}
              </p>
              <p
                className="font-body text-secondary leading-normal overflow-hidden line-clamp-3 w-full"
                style={{ fontSize: '14px', fontVariationSettings: '"opsz" 14' }}
              >
                {definition.definition}
              </p>
            </div>
          </div>
          {definition.creator_username && (
            <p
              className="font-body text-tertiary leading-none"
              style={{ fontSize: 'var(--text-xxs)', fontVariationSettings: '"opsz" 14' }}
            >
              Created by : {definition.creator_username}
            </p>
          )}
        </div>

        {/* Suggestion textarea */}
        <div className="flex flex-col items-start w-full flex-shrink-0" style={{ gap: 'var(--space-2)' }}>
          <p
            className="font-body font-medium text-[14px] text-primary tracking-[0.2px] leading-normal w-full"
            style={{ fontVariationSettings: '"opsz" 14' }}
          >
            Suggest a new definition
          </p>
          <textarea
            ref={suggestionRef}
            value={suggestion}
            onChange={(e) => setSuggestion(e.target.value)}
            maxLength={500}
            placeholder="What does it mean in your squad?"
            className="w-full h-[78px] bg-black border border-border-hover px-3 py-3 font-body text-[14px] text-primary placeholder:text-muted focus:outline-none focus:border-purple transition-colors resize-none overflow-hidden"
            style={{ fontVariationSettings: '"opsz" 14' }}
          />
        </div>

        {/* Error */}
        {error && (
          <p className="font-silkscreen text-[8px] text-[#ef4444] leading-relaxed flex-shrink-0">{error}</p>
        )}

        {/* Buttons */}
        <div className="flex flex-col w-full flex-shrink-0" style={{ gap: 'var(--space-5)' }}>
          <Button onClick={handleSuggest} disabled={saving} loading={saving} className="w-full">
            Suggest
          </Button>
          <Button variant="outlined" color="red" onClick={onClose} disabled={saving} className="w-full">
            Cancel suggestion
          </Button>
        </div>
      </motion.div>
    </>
  )
}
