'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function sendFriendRequestAction(addresseeId: string): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated' }
  if (session.user.is_anonymous) return { error: 'Sign in with Google to add friends' }

  const { error } = await supabase
    .from('friendships')
    .insert({ requester_id: session.user.id, addressee_id: addresseeId, status: 'pending' })

  if (error) return { error: error.message }
  revalidatePath('/friends')
  return { ok: true }
}

export async function acceptFriendRequestAction(friendshipId: string): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId)
    .eq('addressee_id', session.user.id)

  if (error) return { error: error.message }
  revalidatePath('/friends')
  return { ok: true }
}

export async function deleteFriendshipAction(friendshipId: string): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId)

  if (error) return { error: error.message }
  revalidatePath('/friends')
  return { ok: true }
}
