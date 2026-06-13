'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { suggestDefinitionAction } from '@/app/(app)/chat/[crewId]/definitions/actions'
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
        className="fixed bottom-0 left-0 right-0 bg-black border-t border-border flex flex-col px-4 pt-6 overflow-y-auto"
        style={{ zIndex: zBase + 10, gap: 'var(--space-7)', maxHeight: '90vh', paddingBottom: 'max(env(safe-area-inset-bottom), 28px)' }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
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
          <button
            onClick={handleSuggest}
            disabled={saving}
            className="w-full h-12 bg-purple overflow-hidden flex items-center justify-center px-4 py-2 disabled:opacity-40 active:opacity-80 transition-opacity"
          >
            <span className="font-silkscreen text-[12px] text-primary leading-none whitespace-nowrap">
              {saving ? 'Suggesting...' : 'Suggest'}
            </span>
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="w-full h-12 border border-[#ef4444] overflow-hidden flex items-center justify-center px-4 py-2 active:opacity-70 transition-opacity disabled:opacity-40"
          >
            <span className="font-silkscreen text-[12px] text-[#ef4444] leading-none whitespace-nowrap">
              Cancel suggestion
            </span>
          </button>
        </div>
      </motion.div>
    </>
  )
}
