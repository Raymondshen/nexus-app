import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { InboxClient } from './InboxClient'
import type { FriendEntry } from '../FriendsClient'
import type { Friendship, FriendProfile } from '@/types'

export default async function InboxPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const user = session.user

  const { data: pendingRows } = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id, status, created_at')
    .eq('status', 'pending')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)

  const rows        = (pendingRows ?? []) as Friendship[]
  const incomingRows = rows.filter((r) => r.addressee_id === user.id)
  const outgoingRows = rows.filter((r) => r.requester_id === user.id)

  const allUserIds = [
    ...incomingRows.map((r) => r.requester_id),
    ...outgoingRows.map((r) => r.addressee_id),
  ]

  const profileMap: Record<string, FriendProfile> = {}
  if (allUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, avatar_class, status')
      .in('id', allUserIds)
    for (const p of profiles ?? []) {
      profileMap[(p as FriendProfile).id] = p as FriendProfile
    }
  }

  const incoming: FriendEntry[] = incomingRows.map((r) => ({
    friendship: r,
    profile:    profileMap[r.requester_id] ?? null,
  }))

  const outgoing: FriendEntry[] = outgoingRows.map((r) => ({
    friendship: r,
    profile:    profileMap[r.addressee_id] ?? null,
  }))

  return (
    <InboxClient
      incomingRequests={incoming}
      outgoingRequests={outgoing}
    />
  )
}
