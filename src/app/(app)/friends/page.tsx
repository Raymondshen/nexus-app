import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { FriendsClient } from './FriendsClient'
import type { FriendEntry } from './FriendsClient'
import type { Friendship, FriendProfile } from '@/types'

export default async function FriendsPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const user = session.user

  const [acceptedResult, pendingResult] = await Promise.all([
    supabase
      .from('friendships')
      .select('id, requester_id, addressee_id, status, created_at')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    supabase
      .from('friendships')
      .select('id, requester_id, addressee_id, status, created_at')
      .eq('status', 'pending')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
  ])

  const acceptedRows = (acceptedResult.data ?? []) as Friendship[]
  const pendingRows  = (pendingResult.data  ?? []) as Friendship[]

  const incomingRows = pendingRows.filter((r) => r.addressee_id === user.id)
  const outgoingRows = pendingRows.filter((r) => r.requester_id === user.id)

  const friendUserIds  = acceptedRows.map((f) => (f.requester_id === user.id ? f.addressee_id : f.requester_id))
  const pendingUserIds = [...incomingRows.map((r) => r.requester_id), ...outgoingRows.map((r) => r.addressee_id)]
  const allUserIds     = [...new Set([...friendUserIds, ...pendingUserIds])]

  const profileMap: Record<string, FriendProfile> = {}
  if (allUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, avatar_class')
      .in('id', allUserIds)
    for (const p of profiles ?? []) {
      profileMap[(p as FriendProfile).id] = p as FriendProfile
    }
  }

  const friends: FriendEntry[] = acceptedRows.map((f) => ({
    friendship: f,
    profile:    profileMap[f.requester_id === user.id ? f.addressee_id : f.requester_id] ?? null,
  }))

  const incoming: FriendEntry[] = incomingRows.map((r) => ({
    friendship: r,
    profile:    profileMap[r.requester_id] ?? null,
  }))

  const outgoing: FriendEntry[] = outgoingRows.map((r) => ({
    friendship: r,
    profile:    profileMap[r.addressee_id] ?? null,
  }))

  return (
    <FriendsClient
      userId={user.id}
      isGuest={user.is_anonymous === true}
      friends={friends}
      incomingRequests={incoming}
      outgoingRequests={outgoing}
    />
  )
}
