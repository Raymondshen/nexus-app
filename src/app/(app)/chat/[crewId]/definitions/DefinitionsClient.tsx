'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SlidePage, useSlideBack } from '@/components/ui/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { PlusBox } from 'pixelarticons/react/PlusBox'
import { createClient } from '@/lib/supabase/client'
import { createDefinitionAction, updateDefinitionAction, deleteDefinitionAction } from './actions'
import type { SquadDefinition, SquadDefinitionWithCreator } from '@/types'

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

// ─── CreateDefinitionSheet ────────────────────────────────────────────────────
// Handles both create and edit modes (Figma 130:1239)

interface CreateDefinitionSheetProps {
  crewId:             string
  mode:               'create' | 'edit'
  initialWord?:       string
  initialDefinition?: string
  definitionId?:      string
  onClose:            () => void
  onSaved:            (def: SquadDefinition) => void
}

function CreateDefinitionSheet({
  crewId,
  mode,
  initialWord       = '',
  initialDefinition = '',
  definitionId,
  onClose,
  onSaved,
}: CreateDefinitionSheetProps) {
  const [word,       setWord]       = useState(initialWord)
  const [definition, setDefinition] = useState(initialDefinition)
  const [error,      setError]      = useState('')
  const [saving,     setSaving]     = useState(false)

  async function handleSave() {
    if (!word.trim())       { setError('Word is required.'); return }
    if (!definition.trim()) { setError('Definition is required.'); return }
    setSaving(true)
    setError('')

    const result = mode === 'edit' && definitionId
      ? await updateDefinitionAction(definitionId, word, definition)
      : await createDefinitionAction(crewId, word, definition)

    setSaving(false)
    if (result.error) { setError(result.error); return }
    if (result.data) onSaved(result.data)
    onClose()
  }

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

      {/* Sheet — Figma: bg-black border-t border-[#27272a] flex-col gap-[24px] pt-[24px] pb-[16px] px-[16px] */}
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[70] bg-black border-t border-border flex flex-col gap-6 px-4 pt-6 overflow-y-auto"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        style={{ maxHeight: '90vh', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title — Figma: DM Sans Bold 18px text-primary leading-none */}
        <h2
          className="font-body font-bold text-[18px] text-primary leading-none"
          style={{ fontVariationSettings: '"opsz" 14' }}
        >
          Squad Definition
        </h2>

        {/* Words field — Figma: flex-col gap-[8px] items-start */}
        <div className="flex flex-col gap-2 items-start w-full">
          {/* Label — Figma: DM Sans Medium 14px text-primary tracking-[0.2px] */}
          <p
            className="font-body font-medium text-[14px] text-primary tracking-[0.2px] leading-normal"
            style={{ fontVariationSettings: '"opsz" 14' }}
          >
            Words
          </p>
          {/* Input — Figma: bg-black border border-[#3f3f46] p-[12px] overflow-clip */}
          <input
            value={word}
            onChange={(e) => setWord(e.target.value)}
            maxLength={100}
            placeholder="e.g. GG, gg, good game"
            className="w-full bg-black border border-border-hover px-3 py-3 font-body text-[14px] text-primary placeholder:text-muted focus:outline-none focus:border-purple transition-colors overflow-hidden"
            style={{ fontVariationSettings: '"opsz" 14' }}
            autoComplete="off"
            autoCapitalize="off"
          />
          {/* Hint — Figma: DM Sans Regular 11px text-tertiary tracking-[0.2px] */}
          <p
            className="font-body text-[11px] text-tertiary tracking-[0.2px] leading-normal w-full"
            style={{ fontVariationSettings: '"opsz" 14' }}
          >
            Putting commas separates the word but will tie back to this definition when used. (e.g. GG, gg, good game will be the same definition.)
          </p>
        </div>

        {/* Definition field — Figma: flex-col gap-[8px] items-start */}
        <div className="flex flex-col gap-2 items-start w-full">
          {/* Label — same style as Words label */}
          <p
            className="font-body font-medium text-[14px] text-primary tracking-[0.2px] leading-normal"
            style={{ fontVariationSettings: '"opsz" 14' }}
          >
            Definition
          </p>
          {/* Textarea — Figma: bg-black border border-[#3f3f46] h-[78px] p-[12px] overflow-clip */}
          <textarea
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            maxLength={500}
            placeholder="What does it mean in your squad?"
            className="w-full h-[78px] bg-black border border-border-hover px-3 py-3 font-body text-[14px] text-primary placeholder:text-muted focus:outline-none focus:border-purple transition-colors resize-none overflow-hidden"
            style={{ fontVariationSettings: '"opsz" 14' }}
          />
        </div>

        {/* Error */}
        {error && (
          <p className="font-silkscreen text-[8px] text-[#ef4444] leading-relaxed">{error}</p>
        )}

        {/* Buttons — Figma: flex-col gap-[16px] */}
        <div className="flex flex-col gap-4 w-full">
          {/* Save — Figma: bg-purple h-[48px] px-[16px] py-[8px] overflow-clip */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-12 bg-purple overflow-hidden flex items-center justify-center px-4 py-2 disabled:opacity-40 active:opacity-80 transition-opacity"
          >
            <span className="font-silkscreen text-[14px] text-primary leading-none whitespace-nowrap">
              {saving ? 'Saving...' : 'Save definition'}
            </span>
          </button>
          {/* Cancel — Figma: border border-[#ef4444] h-[48px] px-[16px] py-[8px] overflow-clip */}
          <button
            onClick={onClose}
            disabled={saving}
            className="w-full h-12 border border-[#ef4444] overflow-hidden flex items-center justify-center px-4 py-2 active:opacity-70 transition-opacity disabled:opacity-40"
          >
            <span className="font-silkscreen text-[14px] text-[#ef4444] leading-none whitespace-nowrap">Cancel</span>
          </button>
        </div>
      </motion.div>
    </>
  )
}

// ─── DefinitionActionSheet ────────────────────────────────────────────────────
// Creator-only tap sheet (Figma 130:902)

interface DefinitionActionSheetProps {
  definition: SquadDefinitionWithCreator
  onClose:    () => void
  onEdit:     () => void
  onDelete:   () => void
  deleting:   boolean
}

function DefinitionActionSheet({ definition, onClose, onEdit, onDelete, deleting }: DefinitionActionSheetProps) {
  const aliases = definition.word.split(',').map((w) => w.trim()).filter(Boolean).join(', ')

  return (
    <>
      <motion.div
        className="fixed inset-0 z-[60] bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[70] bg-black border-t border-border flex flex-col gap-6 px-4 pt-6"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title — DM Sans Bold 18px */}
        <h2
          className="font-body font-bold text-[18px] text-primary leading-none"
          style={{ fontVariationSettings: '"opsz" 14' }}
        >
          Squad Definition
        </h2>

        {/* Content preview — flex-col gap-[16px] */}
        <div className="flex flex-col gap-4 w-full">
          <div className="flex flex-col gap-2">
            {/* Word — DM Sans Bold 16px */}
            <p
              className="font-body font-bold text-[16px] text-primary leading-none"
              style={{ fontVariationSettings: '"opsz" 14' }}
            >
              {aliases}
            </p>
            {/* Definition — DM Sans Regular 14px text-secondary */}
            <p
              className="font-body text-[14px] text-secondary leading-normal line-clamp-4 overflow-hidden"
              style={{ fontVariationSettings: '"opsz" 14' }}
            >
              {definition.definition}
            </p>
          </div>
          {/* Created by — DM Sans Regular 11px text-tertiary */}
          {definition.creator_username && (
            <p
              className="font-body text-[11px] text-tertiary leading-none"
              style={{ fontVariationSettings: '"opsz" 14' }}
            >
              Created by : {definition.creator_username}
            </p>
          )}
        </div>

        {/* Action buttons — flex-col gap-[16px] */}
        <div className="flex flex-col gap-4 w-full">
          {/* Edit — border-purple */}
          <button
            onClick={onEdit}
            className="w-full h-12 border border-purple overflow-hidden flex items-center justify-center px-4 py-2 active:opacity-70 transition-opacity"
          >
            <span className="font-silkscreen text-[14px] text-purple leading-none whitespace-nowrap">
              Edit definition
            </span>
          </button>
          {/* Delete — border-red */}
          <button
            onClick={onDelete}
            disabled={deleting}
            className="w-full h-12 border border-[#ef4444] overflow-hidden flex items-center justify-center px-4 py-2 active:opacity-70 transition-opacity disabled:opacity-40"
          >
            <span className="font-silkscreen text-[14px] text-[#ef4444] leading-none whitespace-nowrap">
              {deleting ? 'Deleting...' : 'Delete definition'}
            </span>
          </button>
        </div>
      </motion.div>
    </>
  )
}

// ─── DefinitionsClient ────────────────────────────────────────────────────────

interface DefinitionsClientProps {
  crewId:             string
  currentUserId:      string
  currentUsername:    string
  initialDefinitions: SquadDefinitionWithCreator[]
}

export function DefinitionsClient({
  crewId,
  currentUserId,
  currentUsername,
  initialDefinitions,
}: DefinitionsClientProps) {
  const [definitions,  setDefinitions]  = useState<SquadDefinitionWithCreator[]>(initialDefinitions)
  const [showCreate,   setShowCreate]   = useState(false)
  const [actionTarget, setActionTarget] = useState<SquadDefinitionWithCreator | null>(null)
  const [editTarget,   setEditTarget]   = useState<SquadDefinitionWithCreator | null>(null)
  const [deleting,     setDeleting]     = useState<string | null>(null)

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient()
    const channel  = supabase
      .channel(`squad-defs:${crewId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'squad_definitions', filter: `crew_id=eq.${crewId}` },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            const incoming = payload.new as SquadDefinition
            // Resolve creator username before inserting
            const { data: profile } = await supabase
              .from('profiles')
              .select('username')
              .eq('id', incoming.creator_id)
              .single()
            setDefinitions((prev) => {
              if (prev.some((d) => d.id === incoming.id)) return prev
              return [{ ...incoming, creator_username: profile?.username as string | undefined }, ...prev]
            })
          } else if (payload.eventType === 'DELETE') {
            const gone = payload.old as { id: string }
            setDefinitions((prev) => prev.filter((d) => d.id !== gone.id))
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as SquadDefinition
            setDefinitions((prev) =>
              prev.map((d) => d.id === updated.id ? { ...d, word: updated.word, definition: updated.definition } : d)
            )
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [crewId])

  const handleCreated = useCallback((def: SquadDefinition) => {
    setDefinitions((prev) => {
      if (prev.some((d) => d.id === def.id)) return prev
      return [{ ...def, creator_username: currentUsername }, ...prev]
    })
  }, [currentUsername])

  const handleUpdated = useCallback((def: SquadDefinition) => {
    setDefinitions((prev) =>
      prev.map((d) => d.id === def.id ? { ...d, word: def.word, definition: def.definition } : d)
    )
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    setDeleting(id)
    await deleteDefinitionAction(id)
    setDefinitions((prev) => prev.filter((d) => d.id !== id))
    setActionTarget(null)
    setDeleting(null)
  }, [])

  function handleCardTap(def: SquadDefinitionWithCreator) {
    if (def.creator_id === currentUserId) setActionTarget(def)
  }

  function handleEditPress() {
    if (!actionTarget) return
    setEditTarget(actionTarget)
    setActionTarget(null)
  }

  return (
    <SlidePage
      className="min-h-screen bg-black flex flex-col"
      style={{ position: 'fixed', top: 0, bottom: 0, left: 0, right: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden' }}
    >
      {/* Header */}
      <div
        className="px-4 pb-2 flex-shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}
      >
        <div className="flex items-center h-10 gap-2">
          <BackButton />
          <h1 className="font-silkscreen text-[24px] text-primary leading-none uppercase whitespace-nowrap">
            Glossary
          </h1>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto nexus-scroll px-4 py-4 flex flex-col gap-6 min-h-0">
        {/* Subtitle — DM Sans Regular 14px text-primary */}
        <p
          className="font-body text-[14px] text-primary leading-normal flex-shrink-0"
          style={{ fontVariationSettings: '"opsz" 14' }}
        >
          Words and phrases defined by your squad.
        </p>

        {definitions.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 py-16">
            <p className="font-silkscreen text-[8px] text-tertiary text-center leading-relaxed">
              NO DEFINITIONS YET
            </p>
            <p
              className="font-body text-[14px] text-muted text-center"
              style={{ fontVariationSettings: '"opsz" 14' }}
            >
              Create the first squad definition.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 flex-shrink-0">
            {definitions.map((def) => {
              const aliases   = def.word.split(',').map((w) => w.trim()).filter(Boolean).join(', ')
              const isCreator = def.creator_id === currentUserId
              return (
                <button
                  key={def.id}
                  onClick={() => handleCardTap(def)}
                  disabled={!isCreator}
                  className="w-full text-left bg-[rgba(17,17,17,0.5)] border border-[#111111] rounded-[8px] p-4 flex flex-col gap-4 active:opacity-80 transition-opacity disabled:active:opacity-100"
                >
                  <div className="flex flex-col gap-2">
                    {/* Word — DM Sans Bold 16px */}
                    <p
                      className="font-body font-bold text-[16px] text-primary leading-none"
                      style={{ fontVariationSettings: '"opsz" 14' }}
                    >
                      {aliases}
                    </p>
                    {/* Definition — DM Sans Regular 14px text-secondary */}
                    <p
                      className="font-body text-[14px] text-secondary leading-normal line-clamp-3 overflow-hidden"
                      style={{ fontVariationSettings: '"opsz" 14' }}
                    >
                      {def.definition}
                    </p>
                  </div>
                  {/* Created by — DM Sans Regular 11px text-tertiary */}
                  {def.creator_username && (
                    <p
                      className="font-body text-[11px] text-tertiary leading-none"
                      style={{ fontVariationSettings: '"opsz" 14' }}
                    >
                      Created by : {def.creator_username}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer — Add button */}
      <div
        className="flex-shrink-0 px-4"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', paddingTop: 8 }}
      >
        <button
          onClick={() => setShowCreate(true)}
          className="w-full h-12 bg-purple overflow-hidden flex items-center justify-center gap-1 active:opacity-80 transition-opacity"
        >
          <PlusBox style={{ width: 16, height: 16, color: 'var(--color-primary)' }} aria-hidden="true" />
          <span className="font-silkscreen text-[14px] text-primary leading-none whitespace-nowrap">
            Add a squad definition
          </span>
        </button>
      </div>

      <AnimatePresence>
        {showCreate && (
          <CreateDefinitionSheet
            key="create"
            crewId={crewId}
            mode="create"
            onClose={() => setShowCreate(false)}
            onSaved={handleCreated}
          />
        )}
        {editTarget && (
          <CreateDefinitionSheet
            key="edit"
            crewId={crewId}
            mode="edit"
            initialWord={editTarget.word}
            initialDefinition={editTarget.definition}
            definitionId={editTarget.id}
            onClose={() => setEditTarget(null)}
            onSaved={(def) => { handleUpdated(def); setEditTarget(null) }}
          />
        )}
        {actionTarget && (
          <DefinitionActionSheet
            key="action"
            definition={actionTarget}
            onClose={() => setActionTarget(null)}
            onEdit={handleEditPress}
            onDelete={() => handleDelete(actionTarget.id)}
            deleting={deleting === actionTarget.id}
          />
        )}
      </AnimatePresence>
    </SlidePage>
  )
}
