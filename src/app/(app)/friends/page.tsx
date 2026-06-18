import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { FriendsClient } from './FriendsClient'
import type { FriendEntry } from './FriendsClient'
import type { Friendship, FriendProfile } from '@/types'

type DmMemberRow = {
  crew_id:   string
  last_seen: string | null
  joined_at: string
  crew: {
    id:           string
    is_dm:        boolean
    dm_partner_1: string | null
    dm_partner_2: string | null
  } | null
}

export default async function FriendsPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const user = session.user

  // Stage 1 — friendships + DM channel memberships in parallel
  const [acceptedResult, pendingResult, dmMembershipsResult] = await Promise.all([
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
    supabase
      .from('crew_members')
      .select('crew_id, last_seen, joined_at, crew:crews(id, is_dm, dm_partner_1, dm_partner_2)')
      .eq('user_id', user.id),
  ])

  const acceptedRows  = (acceptedResult.data  ?? []) as Friendship[]
  const pendingRows   = (pendingResult.data    ?? []) as Friendship[]
  const incomingRows  = pendingRows.filter((r) => r.addressee_id === user.id)
  const outgoingRows  = pendingRows.filter((r) => r.requester_id === user.id)

  const friendUserIds  = acceptedRows.map((f) => (f.requester_id === user.id ? f.addressee_id : f.requester_id))
  const pendingUserIds = [...incomingRows.map((r) => r.requester_id), ...outgoingRows.map((r) => r.addressee_id)]
  const allUserIds     = [...new Set([...friendUserIds, ...pendingUserIds])]

  // Build per-friend DM entries (crewId + last_seen cutoff)
  const dmRows = ((dmMembershipsResult.data ?? []) as unknown as DmMemberRow[]).filter((m) => m.crew?.is_dm)
  const dmEntries: Array<{ friendId: string; crewId: string; cutoff: string }> = []
  for (const m of dmRows) {
    const crew     = m.crew!
    const friendId = crew.dm_partner_1 === user.id ? crew.dm_partner_2 : crew.dm_partner_1
    if (!friendId) continue
    dmEntries.push({ friendId, crewId: crew.id, cutoff: m.last_seen ?? m.joined_at })
  }

  // Stage 2 — profiles + DM last messages + unread counts, all parallel
  const [profilesResult, lastMsgResults, unreadResult] = await Promise.all([
    allUserIds.length > 0
      ? supabase.from('profiles').select('id, username, avatar_url, avatar_class, status').in('id', allUserIds)
      : Promise.resolve({ data: [] as FriendProfile[] }),
    Promise.all(
      dmEntries.map(({ crewId }) =>
        supabase
          .from('messages')
          .select('content, created_at')
          .eq('crew_id', crewId)
          .neq('message_type', 'system')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ),
    ),
    dmEntries.length > 0
      ? supabase.rpc('get_unread_counts', {
          p_crew_ids: dmEntries.map((e) => e.crewId),
          p_cutoffs:  dmEntries.map((e) => e.cutoff),
        })
      : Promise.resolve({ data: [] as Array<{ crew_id: string; unread_count: number }> }),
  ])

  // Build profile map
  const profileMap: Record<string, FriendProfile> = {}
  for (const p of profilesResult.data ?? []) {
    profileMap[(p as FriendProfile).id] = p as FriendProfile
  }

  // Build per-friend last-message, last-message-at, and unread-count maps
  const dmLastMsgMap   = new Map<string, string>()
  const dmLastMsgAtMap = new Map<string, string>()
  const dmUnreadMap    = new Map<string, number>()

  for (let i = 0; i < dmEntries.length; i++) {
    const { friendId } = dmEntries[i]
    const row = (lastMsgResults[i] as { data: { content: string; created_at: string } | null }).data
    if (row?.content)    dmLastMsgMap.set(friendId,   row.content)
    if (row?.created_at) dmLastMsgAtMap.set(friendId, row.created_at)
  }

  const unreadByCrewId = new Map(
    ((unreadResult.data ?? []) as Array<{ crew_id: string; unread_count: number }>).map(
      (r) => [r.crew_id, r.unread_count],
    ),
  )
  for (const { friendId, crewId } of dmEntries) {
    const count = unreadByCrewId.get(crewId) ?? 0
    if (count > 0) dmUnreadMap.set(friendId, count)
  }

  // Assemble FriendEntry arrays
  const friends: FriendEntry[] = acceptedRows.map((f) => {
    const friendId = f.requester_id === user.id ? f.addressee_id : f.requester_id
    return {
      friendship:    f,
      profile:       profileMap[friendId] ?? null,
      unreadCount:   dmUnreadMap.get(friendId)    ?? 0,
      lastMessage:   dmLastMsgMap.get(friendId)   ?? null,
      lastMessageAt: dmLastMsgAtMap.get(friendId) ?? null,
    }
  })

  const incoming: FriendEntry[] = incomingRows.map((r) => ({
    friendship:    r,
    profile:       profileMap[r.requester_id] ?? null,
    unreadCount:   0,
    lastMessage:   null,
    lastMessageAt: null,
  }))

  const outgoing: FriendEntry[] = outgoingRows.map((r) => ({
    friendship:    r,
    profile:       profileMap[r.addressee_id] ?? null,
    unreadCount:   0,
    lastMessage:   null,
    lastMessageAt: null,
  }))

  return (
    <FriendsClient
      userId={user.id}
      isGuest={user.is_anonymous === true}
      friends={friends}
      pendingCount={incoming.length}
    />
  )
}
