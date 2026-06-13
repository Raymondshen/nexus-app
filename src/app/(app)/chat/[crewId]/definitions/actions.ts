'use server'

import { createClient } from '@/lib/supabase/server'
import type { SquadDefinition, DefinitionSuggestion } from '@/types'

export async function createDefinitionAction(
  crewId: string,
  word: string,
  definition: string,
  actualWord?: string,
): Promise<{ data?: SquadDefinition; error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated.' }

  const trimWord       = word.trim()
  const trimDef        = definition.trim()
  const trimActualWord = actualWord?.trim() || null
  if (!trimWord || trimWord.length > 100) return { error: 'Word(s) must be 1–100 characters.' }
  if (!trimDef  || trimDef.length  > 500) return { error: 'Definition must be 1–500 characters.' }

  const { data, error } = await supabase
    .from('squad_definitions')
    .insert({ crew_id: crewId, creator_id: session.user.id, word: trimWord, actual_word: trimActualWord, definition: trimDef })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'That word is already defined in this squad.' }
    return { error: 'Failed to save definition.' }
  }

  return { data: data as SquadDefinition }
}

export async function updateDefinitionAction(
  definitionId: string,
  word: string,
  definition: string,
  actualWord?: string,
): Promise<{ data?: SquadDefinition; error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated.' }

  const trimWord       = word.trim()
  const trimDef        = definition.trim()
  const trimActualWord = actualWord?.trim() || null
  if (!trimWord || trimWord.length > 100) return { error: 'Word(s) must be 1–100 characters.' }
  if (!trimDef  || trimDef.length  > 500) return { error: 'Definition must be 1–500 characters.' }

  const { data, error } = await supabase
    .from('squad_definitions')
    .update({ word: trimWord, actual_word: trimActualWord, definition: trimDef })
    .eq('id', definitionId)
    .eq('creator_id', session.user.id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'That word is already defined in this squad.' }
    return { error: 'Failed to update definition.' }
  }

  return { data: data as SquadDefinition }
}

export async function suggestDefinitionAction(
  definitionId: string,
  crewId: string,
  suggestion: string,
): Promise<{ data?: DefinitionSuggestion; error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated.' }

  const trimDef = suggestion.trim()
  if (!trimDef || trimDef.length > 500) return { error: 'Definition must be 1–500 characters.' }

  const { data, error } = await supabase
    .from('definition_suggestions')
    .insert({
      definition_id:        definitionId,
      crew_id:              crewId,
      suggester_id:         session.user.id,
      suggested_definition: trimDef,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'You already have a pending suggestion for this definition.' }
    return { error: 'Failed to submit suggestion.' }
  }

  return { data: data as DefinitionSuggestion }
}

export async function approveSuggestionAction(
  suggestionId: string,
  definitionId: string,
  newDefinition: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated.' }

  // Update the definition — creator_id guard enforces ownership
  const { error: updateError } = await supabase
    .from('squad_definitions')
    .update({ definition: newDefinition })
    .eq('id', definitionId)
    .eq('creator_id', session.user.id)

  if (updateError) return { error: 'Failed to update definition.' }

  // Delete the approved suggestion (RLS allows creator to delete)
  await supabase
    .from('definition_suggestions')
    .delete()
    .eq('id', suggestionId)

  return {}
}

export async function denySuggestionAction(
  suggestionId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated.' }

  const { error } = await supabase
    .from('definition_suggestions')
    .delete()
    .eq('id', suggestionId)

  if (error) return { error: 'Failed to deny suggestion.' }
  return {}
}

export async function deleteDefinitionAction(
  definitionId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated.' }

  const { error } = await supabase
    .from('squad_definitions')
    .delete()
    .eq('id', definitionId)
    .eq('creator_id', session.user.id)

  if (error) return { error: 'Failed to delete definition.' }
  return {}
}
