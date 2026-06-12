'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SlidePage, useSlideBack } from '@/components/ui/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { createClient } from '@/lib/supabase/client'
import { createDefinitionAction, deleteDefinitionAction } from './actions'
import type { SquadDefinition } from '@/types'

function BackButton() {
  const goBack = useSlideBack()
  return (
    <button
      onClick={goBack}
      aria-label="Back"
      className="flex-shrink-0 flex items-center justify-center"
      style={{ width: 24, height: 40 }}
    >
      <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-purple)' }} aria-hidden="true" />
    </button>
  )
}

// ─── Create Definition Sheet ──────────────────────────────────────────────────

function CreateDefinitionSheet({
  crewId,
  onClose,
  onCreated,
}: {
  crewId:    string
  onClose:   () => void
  onCreated: (def: SquadDefinition) => void
}) {
  const [word,       setWord]       = useState('')
  const [definition, setDefinition] = useState('')
  const [error,      setError]      = useState('')
  const [saving,     setSaving]     = useState(false)

  async function handleSave() {
    if (!word.trim())       { setError('Word is required.'); return }
    if (!definition.trim()) { setError('Definition is required.'); return }
    setSaving(true)
    setError('')
    const result = await createDefinitionAction(crewId, word, definition)
    setSaving(false)
    if (result.error) { setError(result.error); return }
    if (result.data) onCreated(result.data)
    onClose()
  }

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-end justify-center"
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
        className="relative w-full max-w-[480px] bg-black border-t border-border flex flex-col gap-6 px-4 pt-6"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-col gap-1">
          <p className="font-pixel text-[8px] text-tertiary leading-none">NEW DEFINITION</p>
          <h2 className="font-body font-bold text-[18px] text-primary leading-none" style={{ fontVariationSettings: '"opsz" 14' }}>
            Create Squad Definition
          </h2>
        </div>

        {/* Fields */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="font-body font-medium text-[12px] text-secondary leading-none" style={{ fontVariationSettings: '"opsz" 14' }}>
              WORD
            </label>
            <input
              value={word}
              onChange={(e) => setWord(e.target.value)}
              maxLength={50}
              placeholder="e.g. no scope"
              className="h-[48px] px-3 bg-black border border-border font-body text-[14px] text-primary placeholder:text-muted outline-none focus:border-purple transition-colors"
              style={{ fontVariationSettings: '"opsz" 14' }}
              autoComplete="off"
              autoCapitalize="off"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="font-body font-medium text-[12px] text-secondary leading-none" style={{ fontVariationSettings: '"opsz" 14' }}>
              DEFINITION
            </label>
            <textarea
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
              maxLength={500}
              placeholder="What does it mean in your squad?"
              rows={3}
              className="px-3 py-2 bg-black border border-border font-body text-[14px] text-primary placeholder:text-muted outline-none focus:border-purple transition-colors resize-none"
              style={{ fontVariationSettings: '"opsz" 14' }}
            />
            <p className="font-silkscreen text-[8px] text-muted leading-none self-end">
              {definition.length}/500
            </p>
          </div>

          {error && (
            <p className="font-pixel text-[8px] text-[#ef4444] leading-relaxed">{error}</p>
          )}
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-12 w-full bg-purple font-pixel text-[8px] text-primary flex items-center justify-center disabled:opacity-50 transition-opacity"
          >
            {saving ? '...' : 'SAVE DEFINITION'}
          </button>
          <button
            onClick={onClose}
            className="h-12 w-full font-pixel text-[8px] text-[#ef4444] flex items-center justify-center"
          >
            CANCEL
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── DefinitionsClient ────────────────────────────────────────────────────────

interface DefinitionsClientProps {
  crewId:             string
  currentUserId:      string
  initialDefinitions: SquadDefinition[]
}

export function DefinitionsClient({
  crewId,
  currentUserId,
  initialDefinitions,
}: DefinitionsClientProps) {
  const [definitions, setDefinitions] = useState(initialDefinitions)
  const [showCreate,  setShowCreate]  = useState(false)
  const [deleting,    setDeleting]    = useState<string | null>(null)

  // Realtime subscription for live definition changes
  useEffect(() => {
    const supabase = createClient()
    const channel  = supabase
      .channel(`squad-defs:${crewId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'squad_definitions', filter: `crew_id=eq.${crewId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const incoming = payload.new as SquadDefinition
            setDefinitions((prev) => {
              if (prev.some((d) => d.id === incoming.id)) return prev
              return [incoming, ...prev]
            })
          } else if (payload.eventType === 'DELETE') {
            const gone = payload.old as { id: string }
            setDefinitions((prev) => prev.filter((d) => d.id !== gone.id))
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [crewId])

  const handleCreated = useCallback((def: SquadDefinition) => {
    setDefinitions((prev) => {
      if (prev.some((d) => d.id === def.id)) return prev
      return [def, ...prev]
    })
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    setDeleting(id)
    await deleteDefinitionAction(id)
    // Realtime will handle removal; optimistically remove too
    setDefinitions((prev) => prev.filter((d) => d.id !== id))
    setDeleting(null)
  }, [])

  return (
    <SlidePage
      className="min-h-screen bg-black flex flex-col"
      style={{ position: 'fixed', top: 0, bottom: 0, left: 0, right: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden' }}
    >
      {/* Header */}
      <div
        className="bg-black border-b border-border px-4 pb-2 flex-shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}
      >
        <div className="flex items-center h-10 gap-2">
          <BackButton />
          <h1 className="font-pixel text-[18px] text-primary leading-none whitespace-nowrap">
            SQUAD GLOSSARY
          </h1>
        </div>
        <p className="font-body text-[12px] text-muted mt-[2px]" style={{ fontVariationSettings: '"opsz" 14' }}>
          Words and phrases defined by your squad
        </p>
      </div>

      {/* Definition list */}
      <div className="flex-1 overflow-y-auto nexus-scroll px-4 py-4 min-h-0">
        {definitions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-20">
            <p className="font-pixel text-[8px] text-tertiary text-center leading-relaxed">
              NO DEFINITIONS YET
            </p>
            <p
              className="font-body text-[13px] text-muted text-center"
              style={{ fontVariationSettings: '"opsz" 14' }}
            >
              Create the first squad definition.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {definitions.map((def) => (
              <div
                key={def.id}
                className="bg-surface border border-border p-4 flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-silkscreen text-[14px] text-purple leading-none">
                    {def.word}
                  </p>
                  {def.creator_id === currentUserId && (
                    <button
                      onClick={() => handleDelete(def.id)}
                      disabled={deleting === def.id}
                      className="flex-shrink-0 font-pixel text-[7px] text-[#ef4444] leading-none disabled:opacity-40 transition-opacity"
                    >
                      {deleting === def.id ? '...' : 'DELETE'}
                    </button>
                  )}
                </div>
                <p
                  className="font-body text-[14px] text-secondary leading-normal"
                  style={{ fontVariationSettings: '"opsz" 14' }}
                >
                  {def.definition}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create button */}
      <div
        className="flex-shrink-0 px-4 pt-3 border-t border-border"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
      >
        <button
          onClick={() => setShowCreate(true)}
          className="h-12 w-full bg-purple font-pixel text-[8px] text-primary flex items-center justify-center gap-2"
        >
          + CREATE SQUAD DEFINITION
        </button>
      </div>

      <AnimatePresence>
        {showCreate && (
          <CreateDefinitionSheet
            crewId={crewId}
            onClose={() => setShowCreate(false)}
            onCreated={handleCreated}
          />
        )}
      </AnimatePresence>
    </SlidePage>
  )
}
