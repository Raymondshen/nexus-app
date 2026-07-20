'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient, createServiceClient } from '@/shared/supabase/server'
import type { MessageType, EventRsvpStatus } from '@/types'

export async function updateCrewImageAction(
  crewId: string,
  imageUrl: string,
  storageKey: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Verify caller is crew creator (earliest joined_at)
  const { data: earliest } = await supabase
    .from('crew_members')
    .select('user_id')
    .eq('crew_id', crewId)
    .order('joined_at', { ascending: true })
    .limit(1)
    .single()

  if (!earliest || (earliest as { user_id: string }).user_id !== user.id) {
    return { error: 'Only the squad creator can update the crew image' }
  }

  const service = createServiceClient()

  // Fetch old storage key for cleanup
  const { data: oldCrew } = await service
    .from('crews')
    .select('image_storage_key')
    .eq('id', crewId)
    .single()

  const oldKey = (oldCrew as { image_storage_key?: string | null } | null)?.image_storage_key

  const { error } = await service
    .from('crews')
    .update({ image_url: imageUrl, image_storage_key: storageKey })
    .eq('id', crewId)

  if (error) return { error: error.message }

  // Fire-and-forget: delete old variants (don't block the response)
  if (oldKey) {
    const ts = oldKey.split('/')[1]
    service.storage.from('crew-images')
      .list(crewId, { search: ts })
      .then(({ data: files }) => {
        if (files && files.length > 0) {
          service.storage.from('crew-images')
            .remove(files.map(f => `${crewId}/${f.name}`))
        }
      })
  }

  revalidateTag(`crew-members:${crewId}`, 'max')
  revalidatePath('/home')
  return {}
}

export async function updateCrewBackgroundImageAction(
  crewId: string,
  imageUrl: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const service = createServiceClient()
  const { error } = await service
    .from('crews')
    .update({ background_image_url: imageUrl })
    .eq('id', crewId)

  if (error) return { error: error.message }

  revalidateTag(`crew-members:${crewId}`, 'max')
  revalidatePath('/home')
  return {}
}

export async function kickMemberAction(
  crewId: string,
  targetUserId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const callerId = user.id
  if (callerId === targetUserId) return { error: 'Cannot remove yourself' }

  // Verify caller is the creator (earliest joined_at in this crew)
  const { data: earliest } = await supabase
    .from('crew_members')
    .select('user_id')
    .eq('crew_id', crewId)
    .order('joined_at', { ascending: true })
    .limit(1)
    .single()

  if (!earliest || (earliest as { user_id: string }).user_id !== callerId) {
    return { error: 'Only the squad creator can remove members' }
  }

  // Service client bypasses RLS to delete another user's crew_members row
  const service = createServiceClient()
  const { error } = await service
    .from('crew_members')
    .delete()
    .eq('crew_id', crewId)
    .eq('user_id', targetUserId)

  if (error) return { error: error.message }

  revalidateTag(`crew-members:${crewId}`, 'max')
  return {}
}

export async function renameCrewAction(
  crewId: string,
  name: string,
): Promise<{ error?: string }> {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length < 2 || trimmed.length > 30) {
    return { error: 'Name must be 2–30 characters' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Verify caller is the creator (earliest joined_at)
  const { data: earliest } = await supabase
    .from('crew_members')
    .select('user_id')
    .eq('crew_id', crewId)
    .order('joined_at', { ascending: true })
    .limit(1)
    .single()

  if (!earliest || (earliest as { user_id: string }).user_id !== user.id) {
    return { error: 'Only the squad creator can rename the squad' }
  }

  const service = createServiceClient()
  const { error } = await service
    .from('crews')
    .update({ name: trimmed })
    .eq('id', crewId)
    .eq('is_dm', false)

  if (error) return { error: error.message }

  revalidateTag(`crew-members:${crewId}`, 'max')
  revalidatePath('/home')
  return {}
}

export async function birthdaysCommandAction(crewId: string): Promise<{
  message?: {
    id: string; crew_id: string; user_id: string; content: string
    message_type: MessageType; element_type: null; xp_awarded: number
    reactions: Record<string, string[]>; created_at: string
  }
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: membership } = await supabase
    .from('crew_members')
    .select('id')
    .eq('crew_id', crewId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return { error: 'Not a crew member' }

  const service = createServiceClient()

  const { data: memberRows } = await service
    .from('crew_members')
    .select('user_id')
    .eq('crew_id', crewId)

  const userIds = (memberRows ?? []).map((r) => (r as { user_id: string }).user_id)

  const { data: profileRows } = await service
    .from('profiles')
    .select('id, username, birthday')
    .in('id', userIds)

  type ProfileRow = { id: string; username: string; birthday: string | null }
  const profiles = (profileRows ?? []) as ProfileRow[]

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const withBirthdays = profiles.filter((p) => p.birthday)
  let content: string

  function humanDays(days: number): string {
    if (days < 30) return `${days} day${days !== 1 ? 's' : ''}`
    const months    = Math.floor(days / 30)
    const remaining = days % 30
    if (remaining === 0) return `${months} month${months !== 1 ? 's' : ''}`
    return `${months} month${months !== 1 ? 's' : ''} and ${remaining} day${remaining !== 1 ? 's' : ''}`
  }

  if (withBirthdays.length === 0) {
    content = '🎂 No squad members have set their birthday yet.'
  } else {
    const upcoming = withBirthdays.map((p) => {
      const [, bMonth, bDay] = p.birthday!.split('-').map(Number)
      const thisYear     = new Date(today.getFullYear(), bMonth - 1, bDay)
      const nextBirthday = thisYear >= today
        ? thisYear
        : new Date(today.getFullYear() + 1, bMonth - 1, bDay)
      const daysUntil = Math.round((nextBirthday.getTime() - today.getTime()) / 86_400_000)
      return { username: p.username, daysUntil, date: nextBirthday }
    })
    upcoming.sort((a, b) => a.daysUntil - b.daysUntil)
    const next = upcoming[0]

    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    const monthStr = MONTHS[next.date.getMonth()]
    const dayStr   = next.date.getDate()
    const dateLabel = `${monthStr} ${dayStr}`

    if (next.daysUntil === 0) {
      content = `BIRTHDAY:${next.username}:${dateLabel}:Today is their birthday! 🎉`
    } else if (next.daysUntil === 1) {
      content = `BIRTHDAY:${next.username}:${dateLabel}:Next squad birthday · tomorrow`
    } else {
      content = `BIRTHDAY:${next.username}:${dateLabel}:Next squad birthday · ${humanDays(next.daysUntil)}`
    }
  }

  const { data: msg, error } = await service
    .from('messages')
    .insert({
      crew_id:      crewId,
      user_id:      user.id,
      content,
      message_type: 'system',
      element_type: null,
      xp_awarded:   0,
    })
    .select()
    .single()

  if (error) return { error: error.message }

  return {
    message: {
      id:           (msg as { id: string }).id,
      crew_id:      crewId,
      user_id:      user.id,
      content,
      message_type: 'system' as MessageType,
      element_type: null,
      xp_awarded:   0,
      reactions:    {},
      created_at:   (msg as { created_at: string }).created_at,
    },
  }
}

// Pin Squad: lets a user pin one of their own squads (surfaced first in
// ChatRoomBrowseSheet, preferred by HomeClient's launch-redirect). A single
// `profiles.pinned_crew_id` column gives "only one pin" and "pinning a new one
// unpins the old" for free — this just overwrites it. Toggling the already-pinned
// crew clears it.
export async function togglePinCrewAction(crewId: string): Promise<{ pinned: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { pinned: false, error: 'Not authenticated' }

  const { data: isMember } = await supabase.rpc('is_crew_member', { p_crew_id: crewId })
  if (!isMember) return { pinned: false, error: 'Not a crew member' }

  const { data: profile } = await supabase.from('profiles').select('pinned_crew_id').eq('id', user.id).single()
  const currentlyPinned = (profile as { pinned_crew_id: string | null } | null)?.pinned_crew_id === crewId

  const { error } = await supabase
    .from('profiles')
    .update({ pinned_crew_id: currentlyPinned ? null : crewId })
    .eq('id', user.id)

  if (error) return { pinned: currentlyPinned, error: error.message }

  revalidateTag(`profile:${user.id}`, 'max')
  return { pinned: !currentlyPinned }
}

export async function createEventAction(data: {
  crewId: string
  title: string
  description?: string
  location?: string
  eventDate: string
  coverImageUrl?: string
  createMessage?: boolean
}): Promise<{ eventId?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated' }
  const user = session.user

  const service = createServiceClient()

  // Gate: is_dev required to create events
  const { data: profile } = await service
    .from('profiles')
    .select('is_dev')
    .eq('id', user.id)
    .single()
  if (!(profile as { is_dev?: boolean } | null)?.is_dev) return { error: 'Unauthorized' }

  // Verify crew membership
  const { data: membership } = await supabase
    .from('crew_members')
    .select('id')
    .eq('crew_id', data.crewId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return { error: 'Not a crew member' }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .insert({
      crew_id:         data.crewId,
      title:           data.title.trim(),
      description:     data.description?.trim() || null,
      location:        data.location?.trim() || null,
      event_date:      data.eventDate,
      cover_image_url: data.coverImageUrl || null,
      created_by:      user.id,
    })
    .select('id')
    .single()

  if (eventError) return { error: eventError.message }

  const eventId = (event as { id: string }).id

  if (data.createMessage) {
    const { error: msgError } = await service
      .from('messages')
      .insert({
        crew_id:      data.crewId,
        user_id:      user.id,
        content:      '',
        message_type: 'event',
        element_type: null,
        xp_awarded:   0,
        reactions:    {},
        event_id:     eventId,
      })
    if (msgError) console.error('[createEventAction] message insert failed:', msgError.message)
  }

  return { eventId }
}

export async function updateEventAction(data: {
  eventId:     string
  title:       string
  description?: string
  location?:   string
  eventDate:   string
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated' }

  // Verify caller is the event creator
  const { data: existing } = await supabase
    .from('events')
    .select('created_by')
    .eq('id', data.eventId)
    .single()

  if ((existing as { created_by: string } | null)?.created_by !== session.user.id) {
    return { error: 'Only the event creator can edit this event' }
  }

  const service = createServiceClient()
  const { error } = await service
    .from('events')
    .update({
      title:       data.title.trim(),
      description: data.description?.trim() || null,
      location:    data.location?.trim() || null,
      event_date:  data.eventDate,
    })
    .eq('id', data.eventId)

  if (error) return { error: error.message }
  return {}
}

export async function upsertEventRsvpAction(
  eventId: string,
  status: EventRsvpStatus,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('event_rsvps')
    .upsert(
      { event_id: eventId, user_id: session.user.id, status, updated_at: new Date().toISOString() },
      { onConflict: 'event_id,user_id' },
    )

  if (error) return { error: error.message }
  return {}
}
