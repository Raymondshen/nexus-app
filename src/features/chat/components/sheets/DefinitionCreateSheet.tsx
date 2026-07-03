'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { createDefinitionAction } from '@/app/(app)/chat/[crewId]/definitions/actions'
import { Button } from '@/shared/components/ui/Button'
import type { SquadDefinition } from '@/types'

interface DefinitionCreateSheetProps {
  crewId:       string
  initialWord?: string
  onClose:      () => void
  onSaved?:     (def: SquadDefinition) => void
}

export function DefinitionCreateSheet({
  crewId,
  initialWord = '',
  onClose,
  onSaved,
}: DefinitionCreateSheetProps) {
  const [word,       setWord]       = useState(initialWord)
  const [actualWord, setActualWord] = useState('')
  const [definition, setDefinition] = useState('')
  const [error,      setError]      = useState('')
  const [saving,     setSaving]     = useState(false)

  const wordInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { wordInputRef.current?.blur() }, [])

  async function handleSave() {
    if (!word.trim())       { setError('Word is required.'); return }
    if (!definition.trim()) { setError('Definition is required.'); return }
    setSaving(true)
    setError('')
    const result = await createDefinitionAction(crewId, word, definition, actualWord)
    setSaving(false)
    if (result.error) { setError(result.error); return }
    if (result.data) onSaved?.(result.data)
    onClose()
  }

  return (
    <>
      <motion.div
        className="fixed inset-0 z-[90] bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[100] bg-[var(--color-surface-sheet)] rounded-tl-[16px] rounded-tr-[16px] flex flex-col gap-[var(--space-7)] px-4 pt-[var(--space-7)] overflow-y-auto"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        style={{ maxHeight: '90vh', paddingBottom: 'max(env(safe-area-inset-bottom), 28px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          className="font-body font-bold text-[18px] text-primary leading-none"
          style={{ fontVariationSettings: '"opsz" 14' }}
        >
          Squad Definition
        </h2>

        <div className="flex flex-col gap-[var(--space-5)] items-start w-full">

          <div className="flex flex-col gap-[var(--space-3)] items-start w-full">
            <p
              className="font-body font-medium text-[14px] text-primary tracking-[0.2px] leading-normal"
              style={{ fontVariationSettings: '"opsz" 14' }}
            >
              Words attached to definition
            </p>
            <input
              ref={wordInputRef}
              value={word}
              onChange={(e) => setWord(e.target.value)}
              maxLength={100}
              placeholder="e.g. GG, gg, good game"
              className="w-full bg-black border border-border-hover px-3 py-3 font-body text-[14px] text-primary placeholder:text-muted focus:outline-none focus:border-purple transition-colors overflow-hidden"
              style={{ fontVariationSettings: '"opsz" 14' }}
              autoComplete="off"
              autoCapitalize="off"
            />
            <p
              className="font-body text-[11px] text-tertiary tracking-[0.2px] leading-normal w-full"
              style={{ fontVariationSettings: '"opsz" 14' }}
            >
              Putting commas separates the word but will tie back to this definition when used. (e.g. GG, gg, good game will be the same definition.)
            </p>
          </div>

          <div className="flex flex-col gap-[var(--space-3)] items-start w-full">
            <p
              className="font-body font-medium text-[14px] text-primary tracking-[0.2px] leading-normal"
              style={{ fontVariationSettings: '"opsz" 14' }}
            >
              Actual Word
            </p>
            <input
              value={actualWord}
              onChange={(e) => setActualWord(e.target.value)}
              maxLength={100}
              placeholder="e.g. Good Game"
              className="w-full bg-black border border-border-hover px-3 py-3 font-body text-[14px] text-primary placeholder:text-muted focus:outline-none focus:border-purple transition-colors overflow-hidden"
              style={{ fontVariationSettings: '"opsz" 14' }}
              autoComplete="off"
            />
            <p
              className="font-body text-[11px] text-tertiary tracking-[0.2px] leading-normal w-full"
              style={{ fontVariationSettings: '"opsz" 14' }}
            >
              What the actual full word means. (e.g. GG is &quot;Good Game&quot;)
            </p>
          </div>

          <div className="flex flex-col gap-[var(--space-3)] items-start w-full">
            <p
              className="font-body font-medium text-[14px] text-primary tracking-[0.2px] leading-normal"
              style={{ fontVariationSettings: '"opsz" 14' }}
            >
              Definition
            </p>
            <textarea
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
              maxLength={500}
              placeholder="What does it mean in your squad?"
              className="w-full h-[78px] bg-black border border-border-hover px-3 py-3 font-body text-[14px] text-primary placeholder:text-muted focus:outline-none focus:border-purple transition-colors resize-none overflow-hidden"
              style={{ fontVariationSettings: '"opsz" 14' }}
            />
          </div>

        </div>

        {error && (
          <p className="font-silkscreen text-[8px] text-[#ef4444] leading-relaxed">{error}</p>
        )}

        <div className="flex flex-col gap-4 w-full">
          <Button onClick={handleSave} disabled={saving} loading={saving} className="w-full">
            Save definition
          </Button>
          <Button variant="outlined" color="red" onClick={onClose} disabled={saving} className="w-full">
            Cancel
          </Button>
        </div>
      </motion.div>
    </>
  )
}
