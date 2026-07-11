'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/shared/supabase/client'
import { approveSuggestionAction, denySuggestionAction } from '@/app/(app)/chat/[crewId]/definitions/actions'
import { BottomSheet } from '@/shared/components/ui/sheet/BottomSheet'
import { SheetFooter } from '@/shared/components/ui/sheet/SheetFooter'
import { Button } from '@/shared/components/ui/Button'
import type { DefinitionSuggestion, SquadDefinitionWithCreator } from '@/types'

type SuggestionWithUsername = DefinitionSuggestion & { suggester_username?: string }

interface ReviewSuggestionSheetProps {
  definition: SquadDefinitionWithCreator
  onClose:    () => void
  onApproved: (definitionId: string, newDefinition: string) => void
  onDenied:   () => void
}

export function ReviewSuggestionSheet({
  definition,
  onClose,
  onApproved,
  onDenied,
}: ReviewSuggestionSheetProps) {
  const [suggestion, setSuggestion] = useState<SuggestionWithUsername | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [acting,     setActing]     = useState<'approve' | 'deny' | null>(null)
  const [error,      setError]      = useState('')

  useEffect(() => {
    const supabase = createClient()
    let cancelled  = false

    async function load() {
      const { data } = await supabase
        .from('definition_suggestions')
        .select('*')
        .eq('definition_id', definition.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .single()

      if (cancelled) return
      if (!data) { setLoading(false); return }

      const sug = data as DefinitionSuggestion
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', sug.suggester_id)
        .single()

      if (!cancelled) {
        setSuggestion({ ...sug, suggester_username: profile?.username as string | undefined })
        setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [definition.id])

  async function handleApprove() {
    if (!suggestion) return
    setActing('approve')
    setError('')
    const result = await approveSuggestionAction(suggestion.id, definition.id, suggestion.suggested_definition)
    setActing(null)
    if (result.error) { setError(result.error); return }
    onApproved(definition.id, suggestion.suggested_definition)
    onClose()
  }

  async function handleDeny() {
    if (!suggestion) return
    setActing('deny')
    setError('')
    const result = await denySuggestionAction(suggestion.id)
    setActing(null)
    if (result.error) { setError(result.error); return }
    onDenied()
    onClose()
  }

  return (
    <BottomSheet onClose={onClose} zIndex={70} maxHeight="90vh" className="overflow-y-auto">
      {/* Figma 143:714 */}
      <div
        className="flex flex-col px-4"
        style={{
          gap: 'var(--space-7)',
          paddingBottom: suggestion ? undefined : 'max(env(safe-area-inset-bottom), var(--x8))',
        }}
      >
        {/* Title — DM Sans Bold 18px text-primary */}
        <h2
          className="font-body font-bold text-[18px] text-primary leading-none flex-shrink-0"
          style={{ fontVariationSettings: '"opsz" 14' }}
        >
          Proposed New Definition
        </h2>

        {loading ? (
          <div className="flex flex-col gap-3 flex-shrink-0 animate-pulse">
            <div className="h-4 w-1/3 bg-border rounded" />
            <div className="h-16 w-full bg-border rounded" />
            <div className="h-4 w-1/4 bg-border rounded" />
          </div>
        ) : !suggestion ? (
          <p
            className="font-body text-[14px] text-muted flex-shrink-0"
            style={{ fontVariationSettings: '"opsz" 14' }}
          >
            No pending suggestions.
          </p>
        ) : (
          <>
            {/* Original Definition — Figma 143:723 */}
            <div className="flex flex-col gap-2 items-start w-full flex-shrink-0">
              <p
                className="font-body font-medium text-[14px] text-primary tracking-[0.2px] leading-normal"
                style={{ fontVariationSettings: '"opsz" 14' }}
              >
                Original Definition
              </p>
              <div className="flex flex-col items-start w-full" style={{ gap: 'var(--space-5)' }}>
                <p
                  className="font-body text-[14px] text-tertiary leading-normal w-full overflow-hidden"
                  style={{ fontVariationSettings: '"opsz" 14' }}
                >
                  {definition.definition}
                </p>
                {definition.creator_username && (
                  <p
                    className="font-body text-tertiary leading-none"
                    style={{ fontSize: 'var(--text-xxs)', fontVariationSettings: '"opsz" 14' }}
                  >
                    Created by : {definition.creator_username}
                  </p>
                )}
              </div>
            </div>

            {/* Proposed Definition — Figma 143:751 */}
            <div className="flex flex-col gap-2 items-start w-full flex-shrink-0">
              <p
                className="font-body font-medium text-[14px] text-primary tracking-[0.2px] leading-normal"
                style={{ fontVariationSettings: '"opsz" 14' }}
              >
                Proposed new definition
              </p>
              <div className="flex flex-col items-start w-full" style={{ gap: 'var(--space-5)' }}>
                <p
                  className="font-body text-[14px] text-secondary leading-normal w-full overflow-hidden"
                  style={{ fontVariationSettings: '"opsz" 14' }}
                >
                  {suggestion.suggested_definition}
                </p>
                {suggestion.suggester_username && (
                  <p
                    className="font-body leading-none"
                    style={{ fontSize: 'var(--text-xxs)', color: '#f59e0b', fontVariationSettings: '"opsz" 14' }}
                  >
                    Suggested by: {suggestion.suggester_username}
                  </p>
                )}
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="font-silkscreen text-[8px] text-[#ef4444] leading-relaxed flex-shrink-0">{error}</p>
            )}
          </>
        )}
      </div>

      {/* Buttons — Figma 143:728 */}
      {suggestion && (
        <SheetFooter>
          <Button
            onClick={handleApprove}
            disabled={!!acting}
            loading={acting === 'approve'}
            className="w-full"
          >
            Approve changes
          </Button>
          <Button
            variant="danger"
            onClick={handleDeny}
            disabled={!!acting}
            loading={acting === 'deny'}
            className="w-full"
          >
            Deny changes
          </Button>
        </SheetFooter>
      )}
    </BottomSheet>
  )
}
