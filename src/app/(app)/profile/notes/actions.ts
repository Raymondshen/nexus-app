'use server'

import { createClient } from '@/lib/supabase/server'
import { fetchOGPreview } from '@/lib/og-preview'
import type { PublicNote, BoardSection } from '@/types'

const NOTE_COLS    = 'id, crew_id, created_by, url, og_title, og_image_url, source_domain, section_id, created_at'
const SECTION_COLS = 'id, crew_id, created_by, name, position, created_at'

// ─── Notes ────────────────────────────────────────────────────────────────────

export async function addNoteAction(
  crewId: string,
  url: string,
  sectionId?: string | null,
): Promise<{ note?: PublicNote; error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Unauthorized' }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') throw new Error()
  } catch {
    return { error: 'Invalid URL' }
  }

  const { data: member } = await supabase
    .from('crew_members')
    .select('id')
    .eq('crew_id', crewId)
    .eq('user_id', session.user.id)
    .maybeSingle()
  if (!member) return { error: 'Not a crew member' }

  const preview = await fetchOGPreview(url)
  const domain  = parsedUrl.hostname.replace(/^www\./, '')

  const { data: row, error } = await supabase
    .from('notes')
    .insert({
      crew_id:       crewId,
      created_by:    session.user.id,
      url,
      og_title:      preview?.title ?? null,
      og_image_url:  preview?.image ?? null,
      source_domain: domain || null,
      section_id:    sectionId ?? null,
    })
    .select(NOTE_COLS)
    .single()

  if (error) return { error: 'Failed to save note' }
  return { note: row as unknown as PublicNote }
}

export async function fetchMoreNotesAction(cursor: string, crewId: string): Promise<PublicNote[]> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return []

  const { data } = await supabase
    .from('notes')
    .select(NOTE_COLS)
    .eq('crew_id', crewId)
    .lt('created_at', cursor)
    .order('created_at', { ascending: false })
    .limit(30)

  return (data ?? []) as unknown as PublicNote[]
}

export async function deleteNoteAction(noteId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', noteId)
    .eq('created_by', session.user.id)

  if (error) return { error: 'Failed to delete card' }
  return {}
}

export async function moveToSectionAction(
  noteId: string,
  sectionId: string | null,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('notes')
    .update({ section_id: sectionId })
    .eq('id', noteId)
    .eq('created_by', session.user.id)

  if (error) return { error: 'Failed to move card' }
  return {}
}

// ─── Sections ─────────────────────────────────────────────────────────────────

export async function fetchCrewBoardAction(crewId: string): Promise<{ notes: PublicNote[]; sections: BoardSection[] }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { notes: [], sections: [] }

  const [notesResult, sectionsResult] = await Promise.all([
    supabase
      .from('notes')
      .select(NOTE_COLS)
      .eq('crew_id', crewId)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('board_sections')
      .select(SECTION_COLS)
      .eq('crew_id', crewId)
      .order('position')
      .order('created_at'),
  ])

  return {
    notes:    (notesResult.data    ?? []) as unknown as PublicNote[],
    sections: (sectionsResult.data ?? []) as unknown as BoardSection[],
  }
}

export async function createSectionAction(
  crewId: string,
  name: string,
): Promise<{ section?: BoardSection; error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Unauthorized' }

  const trimmed = name.trim()
  if (!trimmed) return { error: 'Name required' }

  const { data: member } = await supabase
    .from('crew_members')
    .select('id')
    .eq('crew_id', crewId)
    .eq('user_id', session.user.id)
    .maybeSingle()
  if (!member) return { error: 'Not a crew member' }

  const { data: row, error } = await supabase
    .from('board_sections')
    .insert({ crew_id: crewId, created_by: session.user.id, name: trimmed, position: Date.now() })
    .select(SECTION_COLS)
    .single()

  if (error) return { error: 'Failed to create section' }
  return { section: row as unknown as BoardSection }
}

export async function deleteSectionAction(sectionId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Unauthorized' }

  const { error } = await supabase
    .from('board_sections')
    .delete()
    .eq('id', sectionId)
    .eq('created_by', session.user.id)

  if (error) return { error: 'Failed to delete section' }
  return {}
}
