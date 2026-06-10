'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function kickMemberAction(
  crewId: string,
  targetUserId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated' }

  const callerId = session.user.id
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
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated' }

  // Verify caller is the creator (earliest joined_at)
  const { data: earliest } = await supabase
    .from('crew_members')
    .select('user_id')
    .eq('crew_id', crewId)
    .order('joined_at', { ascending: true })
    .limit(1)
    .single()

  if (!earliest || (earliest as { user_id: string }).user_id !== session.user.id) {
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
