'use server'

import { createClient } from '@/lib/supabase/server'
import type { SquadDefinition } from '@/types'

export async function createDefinitionAction(
  crewId: string,
  word: string,
  definition: string,
): Promise<{ data?: SquadDefinition; error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated.' }

  const trimWord = word.trim()
  const trimDef  = definition.trim()
  if (!trimWord || trimWord.length > 100) return { error: 'Word(s) must be 1–100 characters.' }
  if (!trimDef  || trimDef.length  > 500) return { error: 'Definition must be 1–500 characters.' }

  const { data, error } = await supabase
    .from('squad_definitions')
    .insert({ crew_id: crewId, creator_id: session.user.id, word: trimWord, definition: trimDef })
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
): Promise<{ data?: SquadDefinition; error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated.' }

  const trimWord = word.trim()
  const trimDef  = definition.trim()
  if (!trimWord || trimWord.length > 100) return { error: 'Word(s) must be 1–100 characters.' }
  if (!trimDef  || trimDef.length  > 500) return { error: 'Definition must be 1–500 characters.' }

  const { data, error } = await supabase
    .from('squad_definitions')
    .update({ word: trimWord, definition: trimDef })
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
