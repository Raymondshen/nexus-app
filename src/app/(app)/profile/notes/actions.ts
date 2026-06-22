'use server'

import { createClient } from '@/lib/supabase/server'
import { fetchOGPreview } from '@/lib/og-preview'
import type { PublicNote } from '@/types'

const NOTE_COLS = 'id, crew_id, created_by, url, og_title, og_image_url, source_domain, created_at'

export async function addNoteAction(
  crewId: string,
  url: string,
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

  // Derive metadata server-side — client never supplies og fields
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
    })
    .select(NOTE_COLS)
    .single()

  if (error) return { error: 'Failed to save note' }

  return { note: row as unknown as PublicNote }
}

export async function fetchMoreNotesAction(cursor: string): Promise<PublicNote[]> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return []

  const { data } = await supabase
    .from('notes')
    .select(NOTE_COLS)
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

  if (error) return { error: 'Failed to delete note' }
  return {}
}
