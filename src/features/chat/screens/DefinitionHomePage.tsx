'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SlidePage, useSlideBack } from '@/app/layouts/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { Plus } from 'pixelarticons/react/Plus'
import { createClient } from '@/shared/supabase/client'
import { createDefinitionAction, updateDefinitionAction, deleteDefinitionAction } from '@/app/(app)/chat/[crewId]/definitions/actions'
import { SuggestDefinitionSheet } from '@/features/chat/components/sheets/SuggestDefinitionSheet'
import { ReviewSuggestionSheet } from '@/features/chat/components/sheets/ReviewSuggestionSheet'
import { Button } from '@/shared/components/ui/Button'
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
      <motion.div
        className="fixed inset-0 z-[60] bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[70] bg-[var(--color-surface-sheet)] rounded-tl-[16px] rounded-tr-[16px] flex flex-col gap-6 px-4 overflow-y-auto"
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
        <h2
          className="font-body font-bold text-[18px] text-primary leading-none"
          style={{ fontVariationSettings: '"opsz" 14' }}
        >
          Squad Definition
        </h2>

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

// ─── DefinitionActionSheet ────────────────────────────────────────────────────

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
        className="fixed bottom-0 left-0 right-0 z-[70] bg-[var(--color-surface-sheet)] rounded-tl-[16px] rounded-tr-[16px] flex flex-col gap-6 px-4"
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
        <div className="flex flex-col items-start w-full" style={{ gap: 'var(--x5)' }}>
          <div className="flex flex-col items-start justify-center w-full" style={{ gap: 'var(--x3)' }}>
            <p className="font-silkscreen text-tertiary leading-none w-full" style={{ fontSize: 'var(--mini)' }}>
              {aliases}
            </p>
            <div className="flex flex-col w-full" style={{ gap: 'var(--x2)' }}>
              <p
                className="font-body font-bold text-primary leading-none w-full"
                style={{ fontSize: 'var(--md)', fontVariationSettings: '"opsz" 14' }}
              >
                {definition.actual_word || definition.word.split(',')[0].trim()}
              </p>
              <p
                className="font-body text-secondary leading-normal overflow-hidden line-clamp-4 w-full"
                style={{ fontSize: '14px', fontVariationSettings: '"opsz" 14' }}
              >
                {definition.definition}
              </p>
            </div>
          </div>
          {definition.creator_username && (
            <p
              className="font-body font-light text-tertiary leading-none"
              style={{ fontSize: 'var(--xs)', fontVariationSettings: '"opsz" 14' }}
            >
              Created by : {definition.creator_username}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4 w-full">
          <Button variant="outlined" onClick={onEdit} className="w-full">
            Edit definition
          </Button>
          <Button variant="outlined" color="red" onClick={onDelete} disabled={!!deleting} loading={!!deleting} className="w-full">
            Delete definition
          </Button>
        </div>
      </motion.div>
    </>
  )
}

// ─── DefinitionViewSheet ─────────────────────────────────────────────────────

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
        className="fixed bottom-0 left-0 right-0 z-[70] bg-[var(--color-surface-sheet)] rounded-tl-[16px] rounded-tr-[16px] flex flex-col px-4"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 400) onClose() }}
        style={{ gap: 'var(--x7)', paddingTop: 12, paddingBottom: 'max(env(safe-area-inset-bottom), 28px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-start w-full" style={{ gap: 'var(--x5)' }}>
          <div className="flex flex-col items-start justify-center w-full" style={{ gap: 'var(--x3)' }}>
            <p className="font-silkscreen text-tertiary leading-none w-full" style={{ fontSize: 'var(--mini)' }}>
              {aliases}
            </p>
            <div className="flex flex-col w-full" style={{ gap: 'var(--x2)' }}>
              <p
                className="font-body font-bold text-primary leading-none w-full"
                style={{ fontSize: 'var(--md)', fontVariationSettings: '"opsz" 14' }}
              >
                {definition.actual_word || definition.word.split(',')[0].trim()}
              </p>
              <p
                className="font-body text-secondary leading-normal overflow-hidden w-full"
                style={{ fontSize: '14px', fontVariationSettings: '"opsz" 14' }}
              >
                {definition.definition}
              </p>
            </div>
          </div>
          {definition.creator_username && (
            <p
              className="font-body font-light text-tertiary leading-none"
              style={{ fontSize: 'var(--xs)', fontVariationSettings: '"opsz" 14' }}
            >
              Created by : {definition.creator_username}
            </p>
          )}
        </div>

        <Button onClick={onSuggest} className="w-full">
          Suggest new definition
        </Button>
      </motion.div>
    </>
  )
}

// ─── DefinitionHomePage ───────────────────────────────────────────────────────

interface DefinitionHomePageProps {
  crewId:             string
  currentUserId:      string
  currentUsername:    string
  initialDefinitions: SquadDefinitionWithCreator[]
}

export function DefinitionHomePage({
  crewId,
  currentUserId,
  currentUsername,
  initialDefinitions,
}: DefinitionHomePageProps) {
  const [definitions,   setDefinitions]   = useState<SquadDefinitionWithCreator[]>(initialDefinitions)
  const [showCreate,    setShowCreate]    = useState(false)
  const [actionTarget,  setActionTarget]  = useState<SquadDefinitionWithCreator | null>(null)
  const [viewTarget,    setViewTarget]    = useState<SquadDefinitionWithCreator | null>(null)
  const [editTarget,    setEditTarget]    = useState<SquadDefinitionWithCreator | null>(null)
  const [deleting,      setDeleting]      = useState<string | null>(null)
  const [suggestTarget, setSuggestTarget] = useState<SquadDefinitionWithCreator | null>(null)
  const [reviewTarget,  setReviewTarget]  = useState<SquadDefinitionWithCreator | null>(null)

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
      {/* Header — Figma 402:9394: px-md py-x3, heading h-40px justify-between */}
      <div
        className="flex-shrink-0 flex flex-col"
        style={{
          paddingLeft: 'var(--md)',
          paddingRight: 'var(--md)',
          paddingTop: 'max(env(safe-area-inset-top), var(--x3))',
          paddingBottom: 'var(--x3)',
        }}
      >
        <div className="flex items-center justify-between h-10">
          {/* Left container — icon+title gap-x3 (Figma I402:9394;189:2437) */}
          <div className="flex items-center h-full" style={{ gap: 'var(--x3)' }}>
            <BackButton />
            <h1
              className="font-silkscreen uppercase leading-none text-primary"
              style={{ fontSize: 'var(--xl)' }}
            >
              Definitions
            </h1>
          </div>
          {/* Right — add button (Figma I402:9394;189:2442) */}
          <button
            onClick={() => setShowCreate(true)}
            aria-label="Add definition"
            className="flex-shrink-0 flex items-center justify-center"
            style={{ width: 24, height: 40 }}
          >
            <Plus style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Body — Figma 402:9281: px-md py-x5 gap-x6 */}
      <div
        className="flex-1 min-h-0 overflow-y-auto nexus-scroll flex flex-col"
        style={{
          gap: 'var(--x6)',
          paddingLeft: 'var(--md)',
          paddingRight: 'var(--md)',
          paddingTop: 'var(--x5)',
          paddingBottom: 'max(env(safe-area-inset-bottom), var(--x5))',
        }}
      >
        {definitions.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3">
            <p className="font-silkscreen text-[8px] text-tertiary text-center leading-relaxed">
              NO DEFINITIONS YET
            </p>
            <p
              className="font-body text-[14px] text-muted text-center"
              style={{ fontVariationSettings: '"opsz" 14' }}
            >
              Tap + to create the first squad definition.
            </p>
          </div>
        ) : (
          definitions.map((def) => {
            const aliases   = def.word.split(',').map((w) => w.trim()).filter(Boolean).join(', ')
            const isCreator = def.creator_id === currentUserId
            return (
              <button
                key={def.id}
                onClick={() => handleCardTap(def)}
                className="w-full text-left active:opacity-80 transition-opacity flex-shrink-0"
              >
                {/* Card — Figma 402:9403: bg-surface-sheet rounded-x3 p-x5 gap-x5 */}
                <div
                  className="flex flex-col w-full rounded-[var(--x3)] bg-[var(--color-surface-sheet)]"
                  style={{ padding: 'var(--x5)', gap: 'var(--x5)' }}
                >
                  {/* Details — Figma 402:9404: gap-x3 */}
                  <div className="flex flex-col items-start w-full" style={{ gap: 'var(--x3)' }}>
                    {/* Aliases — Silkscreen mini tertiary */}
                    <p
                      className="font-silkscreen text-tertiary leading-none w-full"
                      style={{ fontSize: 'var(--mini)' }}
                    >
                      {aliases}
                    </p>
                    {/* Word + definition — Figma 402:9406: gap-x2 */}
                    <div className="flex flex-col w-full" style={{ gap: 'var(--x2)' }}>
                      {/* Word — DM Sans Bold md primary leading-none */}
                      <p
                        className="font-body font-bold text-primary leading-none w-full"
                        style={{ fontSize: 'var(--md)', fontVariationSettings: '"opsz" 14' }}
                      >
                        {def.actual_word || def.word.split(',')[0].trim()}
                      </p>
                      {/* Definition — DM Sans Regular 14px secondary leading-[1.5] */}
                      <p
                        className="font-body text-secondary w-full"
                        style={{ fontSize: '14px', lineHeight: '1.5', fontVariationSettings: '"opsz" 14' }}
                      >
                        {def.definition}
                      </p>
                    </div>
                  </div>

                  {/* Footer — creator + suggestion badge */}
                  <div className="flex items-center justify-between w-full">
                    <p
                      className="font-body font-light leading-none"
                      style={{
                        fontSize: 'var(--xs)',
                        color: isCreator ? 'var(--color-purple)' : 'var(--color-tertiary)',
                        fontVariationSettings: '"opsz" 14',
                      }}
                    >
                      {def.creator_username ? `Created by : ${def.creator_username}` : ''}
                    </p>
                    {(def.suggestion_count ?? 0) > 0 && (
                      <p
                        className="font-body font-light leading-none"
                        style={{ fontSize: 'var(--xs)', color: '#f59e0b', fontVariationSettings: '"opsz" 14' }}
                      >
                        {def.suggestion_count} New Suggestion{(def.suggestion_count ?? 0) > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            )
          })
        )}
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
