'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { SquadDefinition } from '@/types'

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
  definition: string,
): Promise<{ data?: SquadDefinition; error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated.' }

  const trimDef = definition.trim()
  if (!trimDef || trimDef.length > 500) return { error: 'Definition must be 1–500 characters.' }

  // Verify crew membership before bypassing creator-only RLS
  const { data: member } = await supabase
    .from('crew_members')
    .select('id')
    .eq('crew_id', crewId)
    .eq('user_id', session.user.id)
    .single()
  if (!member) return { error: 'Not a member of this squad.' }

  const service = createServiceClient()
  const { data, error } = await service
    .from('squad_definitions')
    .update({ definition: trimDef })
    .eq('id', definitionId)
    .select()
    .single()

  if (error) return { error: 'Failed to submit suggestion.' }
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
