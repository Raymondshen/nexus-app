'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SlidePage, useSlideBack } from '@/components/ui/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { PlusBox } from 'pixelarticons/react/PlusBox'
import { createClient } from '@/lib/supabase/client'
import { createDefinitionAction, updateDefinitionAction, deleteDefinitionAction } from './actions'
import { SuggestDefinitionSheet } from '@/components/chat/SuggestDefinitionSheet'
import { ReviewSuggestionSheet } from '@/components/chat/ReviewSuggestionSheet'
import type { SquadDefinition, SquadDefinitionWithCreator, DefinitionSuggestion } from '@/types'

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
  crewId:              string
  mode:                'create' | 'edit'
  initialWord?:        string
  initialActualWord?:  string
  initialDefinition?:  string
  definitionId?:       string
  onClose:             () => void
  onSaved:             (def: SquadDefinition) => void
}

function CreateDefinitionSheet({
  crewId,
  mode,
  initialWord       = '',
  initialActualWord = '',
  initialDefinition = '',
  definitionId,
  onClose,
  onSaved,
}: CreateDefinitionSheetProps) {
  const [word,       setWord]       = useState(initialWord)
  const [actualWord, setActualWord] = useState(initialActualWord)
  const [definition, setDefinition] = useState(initialDefinition)
  const [error,      setError]      = useState('')
  const [saving,     setSaving]     = useState(false)

  async function handleSave() {
    if (!word.trim())       { setError('Word is required.'); return }
    if (!definition.trim()) { setError('Definition is required.'); return }
    setSaving(true)
    setError('')

    const result = mode === 'edit' && definitionId
      ? await updateDefinitionAction(definitionId, word, definition, actualWord)
      : await createDefinitionAction(crewId, word, definition, actualWord)

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

      {/* Sheet — Figma 130:1239 */}
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[70] bg-black border-t border-border flex flex-col gap-6 px-4 overflow-y-auto"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 400) onClose() }}
        style={{ maxHeight: '90vh', paddingTop: 12, paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pb-2"><div className="w-10 h-[4px] rounded-full bg-border" /></div>
        {/* Title — DM Sans Bold 18px text-primary */}
        <h2
          className="font-body font-bold text-[18px] text-primary leading-none"
          style={{ fontVariationSettings: '"opsz" 14' }}
        >
          Squad Definition
        </h2>

        {/* Words attached to definition — Figma: flex-col gap-[8px] */}
        <div className="flex flex-col gap-2 items-start w-full">
          <p
            className="font-body font-medium text-[14px] text-primary tracking-[0.2px] leading-normal"
            style={{ fontVariationSettings: '"opsz" 14' }}
          >
            Words attached to definition
          </p>
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
          <p
            className="font-body text-[11px] text-tertiary tracking-[0.2px] leading-normal w-full"
            style={{ fontVariationSettings: '"opsz" 14' }}
          >
            Putting commas separates the word but will tie back to this definition when used. (e.g. GG, gg, good game will be the same definition.)
          </p>
        </div>

        {/* Actual Word — Figma 130:1307 */}
        <div className="flex flex-col gap-2 items-start w-full">
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
            What the actual full word mean. (e.g. GG is &quot;Good Game&quot;)
          </p>
        </div>

        {/* Definition field */}
        <div className="flex flex-col gap-2 items-start w-full">
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

        {/* Error */}
        {error && (
          <p className="font-silkscreen text-[8px] text-[#ef4444] leading-relaxed">{error}</p>
        )}

        {/* Buttons */}
        <div className="flex flex-col gap-4 w-full">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-12 bg-purple overflow-hidden flex items-center justify-center px-4 py-2 disabled:opacity-40 active:opacity-80 transition-opacity"
          >
            <span className="font-silkscreen text-[14px] text-primary leading-none whitespace-nowrap">
              {saving ? 'Saving...' : 'Save definition'}
            </span>
          </button>
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
        className="fixed bottom-0 left-0 right-0 z-[70] bg-black border-t border-border flex flex-col gap-6 px-4"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 400) onClose() }}
        style={{ paddingTop: 12, paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pb-2"><div className="w-10 h-[4px] rounded-full bg-border" /></div>
        {/* Title — DM Sans Bold 18px */}
        <h2
          className="font-body font-bold text-[18px] text-primary leading-none"
          style={{ fontVariationSettings: '"opsz" 14' }}
        >
          Squad Definition
        </h2>

        {/* Content preview — Figma 130:1289: flex-col gap-[--space-5] items-start */}
        <div className="flex flex-col items-start w-full" style={{ gap: 'var(--space-5)' }}>
          {/* Details — Figma 130:1290: flex-col gap-[--space-3] items-start justify-center */}
          <div className="flex flex-col items-start justify-center w-full" style={{ gap: 'var(--space-3)' }}>
            {/* Aliases — Figma 130:1291: Silkscreen --mini tertiary leading-none */}
            <p
              className="font-silkscreen text-tertiary leading-none w-full"
              style={{ fontSize: 'var(--text-mini)' }}
            >
              {aliases}
            </p>
            {/* Inner — Figma 130:1315: flex-col gap-[--space-2] */}
            <div className="flex flex-col w-full" style={{ gap: 'var(--space-2)' }}>
              {/* Actual word — Figma 130:1316: DM Sans Bold --md blue leading-none */}
              <p
                className="font-body font-bold leading-none w-full"
                style={{ fontSize: 'var(--text-md)', color: 'var(--color-blue)', fontVariationSettings: '"opsz" 14' }}
              >
                {definition.actual_word || definition.word.split(',')[0].trim()}
              </p>
              {/* Definition — Figma 130:1292: DM Sans Regular 14px secondary leading-normal overflow-hidden */}
              <p
                className="font-body text-secondary leading-normal overflow-hidden line-clamp-4 w-full"
                style={{ fontSize: '14px', fontVariationSettings: '"opsz" 14' }}
              >
                {definition.definition}
              </p>
            </div>
          </div>
          {/* Created by — Figma 130:1293: DM Sans Regular --xxs tertiary leading-none */}
          {definition.creator_username && (
            <p
              className="font-body text-tertiary leading-none"
              style={{ fontSize: 'var(--text-xxs)', fontVariationSettings: '"opsz" 14' }}
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

// ─── DefinitionViewSheet ─────────────────────────────────────────────────────
// Shown when a non-creator taps a glossary card (Figma 130:1213)

interface DefinitionViewSheetProps {
  definition: SquadDefinitionWithCreator
  onClose:    () => void
  onSuggest:  () => void
}

function DefinitionViewSheet({ definition, onClose, onSuggest }: DefinitionViewSheetProps) {
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
        className="fixed bottom-0 left-0 right-0 z-[70] bg-black border-t border-border flex flex-col px-4"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 400) onClose() }}
        style={{ gap: 'var(--space-7)', paddingTop: 12, paddingBottom: 'max(env(safe-area-inset-bottom), 28px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center"><div className="w-10 h-[4px] rounded-full bg-border" /></div>
        {/* Title — DM Sans Bold 18px text-primary */}
        <h2
          className="font-body font-bold text-[18px] text-primary leading-none"
          style={{ fontVariationSettings: '"opsz" 14' }}
        >
          Squad Definition
        </h2>

        {/* Content — flex-col gap-[--space-5] items-start */}
        <div className="flex flex-col items-start w-full" style={{ gap: 'var(--space-5)' }}>
          {/* Details — flex-col gap-[--space-3] */}
          <div className="flex flex-col items-start justify-center w-full" style={{ gap: 'var(--space-3)' }}>
            {/* Aliases — Silkscreen --mini tertiary */}
            <p
              className="font-silkscreen text-tertiary leading-none w-full"
              style={{ fontSize: 'var(--text-mini)' }}
            >
              {aliases}
            </p>
            {/* Inner — flex-col gap-[--space-2] */}
            <div className="flex flex-col w-full" style={{ gap: 'var(--space-2)' }}>
              {/* Word — DM Sans Bold --md blue */}
              <p
                className="font-body font-bold leading-none w-full"
                style={{ fontSize: 'var(--text-md)', color: 'var(--color-blue)', fontVariationSettings: '"opsz" 14' }}
              >
                {definition.actual_word || definition.word.split(',')[0].trim()}
              </p>
              {/* Definition body — DM Sans Regular 14px secondary */}
              <p
                className="font-body text-secondary leading-normal overflow-hidden w-full"
                style={{ fontSize: '14px', fontVariationSettings: '"opsz" 14' }}
              >
                {definition.definition}
              </p>
            </div>
          </div>
          {/* Creator — DM Sans Regular --xxs tertiary */}
          {definition.creator_username && (
            <p
              className="font-body text-tertiary leading-none"
              style={{ fontSize: 'var(--text-xxs)', fontVariationSettings: '"opsz" 14' }}
            >
              Created by : {definition.creator_username}
            </p>
          )}
        </div>

        {/* Suggest button — bg-purple Silkscreen --xs primary */}
        <button
          onClick={onSuggest}
          className="w-full h-12 bg-purple overflow-hidden flex items-center justify-center px-4 py-2 active:opacity-80 transition-opacity"
        >
          <span className="font-silkscreen text-primary leading-none whitespace-nowrap" style={{ fontSize: 'var(--text-xs)' }}>
            Suggest new definition
          </span>
        </button>
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
  const [definitions,   setDefinitions]   = useState<SquadDefinitionWithCreator[]>(initialDefinitions)
  const [showCreate,    setShowCreate]    = useState(false)
  const [actionTarget,  setActionTarget]  = useState<SquadDefinitionWithCreator | null>(null)
  const [viewTarget,    setViewTarget]    = useState<SquadDefinitionWithCreator | null>(null)
  const [editTarget,    setEditTarget]    = useState<SquadDefinitionWithCreator | null>(null)
  const [deleting,      setDeleting]      = useState<string | null>(null)
  const [suggestTarget, setSuggestTarget] = useState<SquadDefinitionWithCreator | null>(null)
  const [reviewTarget,  setReviewTarget]  = useState<SquadDefinitionWithCreator | null>(null)

  // Realtime subscriptions — definitions + suggestion counts
  useEffect(() => {
    const supabase = createClient()

    const defsChannel = supabase
      .channel(`squad-defs:${crewId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'squad_definitions', filter: `crew_id=eq.${crewId}` },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            const incoming = payload.new as SquadDefinition
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
              prev.map((d) => d.id === updated.id ? { ...d, word: updated.word, actual_word: updated.actual_word, definition: updated.definition } : d)
            )
          }
        }
      )
      .subscribe()

    // Track suggestion count changes live (REPLICA IDENTITY FULL on the table gives us definition_id on DELETE)
    const sugChannel = supabase
      .channel(`def-suggestions:${crewId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'definition_suggestions', filter: `crew_id=eq.${crewId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as DefinitionSuggestion
            setDefinitions((prev) =>
              prev.map((d) => d.id === row.definition_id
                ? { ...d, suggestion_count: (d.suggestion_count ?? 0) + 1 }
                : d
              )
            )
          } else if (payload.eventType === 'DELETE') {
            const row = payload.old as DefinitionSuggestion
            setDefinitions((prev) =>
              prev.map((d) => d.id === row.definition_id
                ? { ...d, suggestion_count: Math.max(0, (d.suggestion_count ?? 0) - 1) }
                : d
              )
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(defsChannel)
      supabase.removeChannel(sugChannel)
    }
  }, [crewId])

  const handleCreated = useCallback((def: SquadDefinition) => {
    setDefinitions((prev) => {
      if (prev.some((d) => d.id === def.id)) return prev
      return [{ ...def, creator_username: currentUsername }, ...prev]
    })
  }, [currentUsername])

  const handleUpdated = useCallback((def: SquadDefinition) => {
    setDefinitions((prev) =>
      prev.map((d) => d.id === def.id ? { ...d, word: def.word, actual_word: def.actual_word, definition: def.definition } : d)
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
    if (def.creator_id === currentUserId) {
      if ((def.suggestion_count ?? 0) > 0) setReviewTarget(def)
      else setActionTarget(def)
    } else {
      setViewTarget(def)
    }
  }

  function handleEditPress() {
    if (!actionTarget) return
    setEditTarget(actionTarget)
    setActionTarget(null)
  }

  const handleSuggestionApproved = useCallback((definitionId: string, newDefinition: string) => {
    setDefinitions((prev) =>
      prev.map((d) => d.id === definitionId
        ? { ...d, definition: newDefinition, suggestion_count: Math.max(0, (d.suggestion_count ?? 0) - 1) }
        : d
      )
    )
  }, [])

  const handleSuggestionDenied = useCallback(() => {
    if (!reviewTarget) return
    setDefinitions((prev) =>
      prev.map((d) => d.id === reviewTarget.id
        ? { ...d, suggestion_count: Math.max(0, (d.suggestion_count ?? 0) - 1) }
        : d
      )
    )
  }, [reviewTarget])

  return (
    <SlidePage
      className="min-h-screen bg-black flex flex-col"
      style={{ position: 'fixed', top: 0, bottom: 0, left: 0, right: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden' }}
    >
      {/* Header — Figma 130:1115/1116 */}
      <div
        className="px-4 py-2 flex-shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}
      >
        <div className="flex items-center h-10 gap-2">
          <BackButton />
          {/* Title + subtitle stacked — Figma 135:1370 */}
          <div className="flex flex-col">
            <h1 className="font-silkscreen text-[24px] text-primary leading-none uppercase whitespace-nowrap">
              Glossary
            </h1>
            <p
              className="font-body text-tertiary leading-none whitespace-nowrap"
              style={{ fontSize: 'var(--text-xxs)', fontVariationSettings: '"opsz" 14' }}
            >
              Words and phrases defined by your squad.
            </p>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto nexus-scroll px-4 py-4 flex flex-col gap-6 min-h-0">

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
                  className="w-full text-left bg-[rgba(17,17,17,0.5)] border border-[#111111] rounded-[8px] p-4 flex flex-col gap-4 active:opacity-80 transition-opacity"
                >
                  {/* Details — Figma 130:1290: flex-col gap-[--space-3] items-start justify-center */}
                  <div className="flex flex-col items-start justify-center w-full" style={{ gap: 'var(--space-3)' }}>
                    {/* Aliases — Figma 130:1291: Silkscreen --mini tertiary leading-none */}
                    <p
                      className="font-silkscreen text-tertiary leading-none w-full"
                      style={{ fontSize: 'var(--text-mini)' }}
                    >
                      {aliases}
                    </p>
                    {/* Inner — Figma 130:1315: flex-col gap-[--space-2] */}
                    <div className="flex flex-col w-full" style={{ gap: 'var(--space-2)' }}>
                      {/* Actual word — Figma 130:1316: DM Sans Bold --md blue leading-none */}
                      <p
                        className="font-body font-bold leading-none w-full"
                        style={{ fontSize: 'var(--text-md)', color: 'var(--color-blue)', fontVariationSettings: '"opsz" 14' }}
                      >
                        {def.actual_word || def.word.split(',')[0].trim()}
                      </p>
                      {/* Definition — Figma 130:1292: DM Sans Regular 14px secondary leading-normal overflow-hidden */}
                      <p
                        className="font-body text-secondary leading-normal overflow-hidden line-clamp-3 w-full"
                        style={{ fontSize: '14px', fontVariationSettings: '"opsz" 14' }}
                      >
                        {def.definition}
                      </p>
                    </div>
                  </div>
                  {/* Footer row — Figma 143:710: flex row gap-[8px] items-center justify-center */}
                  <div
                    className="flex items-center justify-center w-full font-body font-normal leading-none"
                    style={{ gap: 8, fontSize: 'var(--text-xxs)', fontVariationSettings: '"opsz" 14' }}
                  >
                    {/* Created by — flex-1; purple if own, tertiary otherwise */}
                    <p
                      className="flex-1 min-w-0"
                      style={{ color: isCreator ? 'var(--color-purple)' : 'var(--color-tertiary)' }}
                    >
                      {def.creator_username ? `Created by : ${def.creator_username}` : ''}
                    </p>
                    {/* Suggestion count — amber, text-right; hidden when 0 */}
                    {(def.suggestion_count ?? 0) > 0 && (
                      <p className="flex-1 min-w-0 text-right" style={{ color: '#f59e0b' }}>
                        {def.suggestion_count} New Suggestion{(def.suggestion_count ?? 0) > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
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
            initialActualWord={editTarget.actual_word ?? ''}
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
        {viewTarget && (
          <DefinitionViewSheet
            key="view"
            definition={viewTarget}
            onClose={() => setViewTarget(null)}
            onSuggest={() => {
              setSuggestTarget(viewTarget)
              setViewTarget(null)
            }}
          />
        )}
        {suggestTarget && (
          <SuggestDefinitionSheet
            key="suggest"
            crewId={crewId}
            definition={suggestTarget}
            onClose={() => setSuggestTarget(null)}
            onSaved={() => {
              setDefinitions((prev) =>
                prev.map((d) => d.id === suggestTarget.id
                  ? { ...d, suggestion_count: (d.suggestion_count ?? 0) + 1 }
                  : d
                )
              )
              setSuggestTarget(null)
            }}
          />
        )}
        {reviewTarget && (
          <ReviewSuggestionSheet
            key="review"
            definition={reviewTarget}
            onClose={() => setReviewTarget(null)}
            onApproved={handleSuggestionApproved}
            onDenied={handleSuggestionDenied}
          />
        )}
      </AnimatePresence>
    </SlidePage>
  )
}
