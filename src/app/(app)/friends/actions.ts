'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/shared/supabase/server'

export async function sendFriendRequestAction(addresseeId: string): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (user.is_anonymous) return { error: 'Sign in with Google to add friends' }

  const { error } = await supabase
    .from('friendships')
    .insert({ requester_id: user.id, addressee_id: addresseeId, status: 'pending' })

  if (error) return { error: error.message }

  // Notify the addressee — best-effort, don't fail the action
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .single()

    const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`
    await fetch(fnUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: addresseeId,
        type:    'friend_request',
        payload: { requester_name: profile?.username ?? 'Someone' },
      }),
    })
  } catch { /* notification is best-effort */ }

  // Bust friendship cache for both parties
  revalidateTag(`friends:${user.id}`, 'max')
  revalidateTag(`friends:${addresseeId}`, 'max')
  revalidatePath('/friends')
  return { ok: true }
}

export async function acceptFriendRequestAction(friendshipId: string): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Fetch requester ID so we can bust their cache too
  const { data: fship } = await supabase
    .from('friendships')
    .select('requester_id')
    .eq('id', friendshipId)
    .eq('addressee_id', user.id)
    .single()

  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId)
    .eq('addressee_id', user.id)

  if (error) return { error: error.message }

  revalidateTag(`friends:${user.id}`, 'max')
  if (fship) revalidateTag(`friends:${(fship as { requester_id: string }).requester_id}`, 'max')
  revalidatePath('/friends')
  return { ok: true }
}

export async function deleteFriendshipAction(friendshipId: string): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Fetch the other party's ID so we can bust their cache too
  const { data: fship } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('id', friendshipId)
    .single()

  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId)

  if (error) return { error: error.message }

  revalidateTag(`friends:${user.id}`, 'max')
  if (fship) {
    const f = fship as { requester_id: string; addressee_id: string }
    const otherId = f.requester_id === user.id ? f.addressee_id : f.requester_id
    revalidateTag(`friends:${otherId}`, 'max')
  }
  revalidatePath('/friends')
  return { ok: true }
}
