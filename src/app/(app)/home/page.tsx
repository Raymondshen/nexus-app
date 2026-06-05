import { redirect } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { HomeClient } from './HomeClient'
import type { FriendSummary } from './HomeClient'
import type { Crew } from '@/types'

function buildFriends(
  friendshipRows: Array<{ id: string; requester_id: string; addressee_id: string }>,
  profiles: Array<{ id: string; username: string; avatar_url: string | null }>,
  userId: string,
  dmCrewMap:    Map<string, string> = new Map(),
  dmLastMsgMap: Map<string, { content: string; created_at: string }> = new Map(),
): FriendSummary[] {
  const profileMap = new Map(profiles.map((p) => [p.id, p]))
  return friendshipRows.map((f) => {
    const friendId = f.requester_id === userId ? f.addressee_id : f.requester_id
    const p = profileMap.get(friendId)
    return {
      id:            friendId,
      username:      p?.username ?? 'Unknown',
      avatarUrl:     p?.avatar_url ?? null,
      dmChannelId:   dmCrewMap.get(friendId) ?? null,
      lastDMMessage: dmLastMsgMap.get(friendId) ?? null,
    }
  })
}

export interface CrewSummary {
  crew:        Crew
  lastMessage: { content: string; sender: string; created_at: string } | null
  unreadCount: number
  lastSeen:    string | null
  memberCount: number
}

type MemberRow = { crew_id: string; user_id: string; profiles: { username: string } | null }
type LastMessage = { content: string; created_at: string; profiles: { username: string } | null } | null

// Cached: member usernames + counts for a set of crews (invalidated on join/leave via crew-members tags)
function getCachedHomeMembers(crewIds: string[]) {
  const sorted = [...crewIds].sort()
  return unstable_cache(
    async () => {
      const supabase = createServiceClient()
      const { data } = await supabase
        .from('crew_members')
        .select('crew_id, user_id, profiles(username)')
        .in('crew_id', sorted)
      return (data ?? []) as unknown as MemberRow[]
    },
    [`home-crew-members:${sorted.join(',')}`],
    { tags: sorted.map(id => `crew-members:${id}`), revalidate: 60 }
  )()
}

// Cached: last non-system message preview per crew (30s TTL — stale preview is acceptable)
function getCachedCrewLastMessage(crewId: string) {
  return unstable_cache(
    async () => {
      const supabase = createServiceClient()
      const { data } = await supabase
        .from('messages')
        .select('content, created_at, profiles(username)')
        .eq('crew_id', crewId)
        .neq('message_type', 'system')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data as LastMessage
    },
    [`home-last-msg:${crewId}`],
    { revalidate: 30 }
  )()
}

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const user = session.user

  // Profile, crew membership, total messages, and friendships are independent — run in parallel
  const [
    { data: profile },
    { data: memberRows, error: memberError },
    { count: totalMessages },
    { data: acceptedFriendships },
  ] = await Promise.all([
    supabase.from('profiles').select('username, avatar_url, birthday, created_at').eq('id', user.id).single(),
    supabase.from('crew_members').select('crew_id, last_seen, joined_at').eq('user_id', user.id).order('joined_at', { ascending: false }),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('user_id', user.id).neq('message_type', 'system'),
    supabase.from('friendships').select('id, requester_id, addressee_id').eq('status', 'accepted').or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
  ])

  if (memberError) console.error('[home] crew_members query error:', memberError)

  // Prompt existing users who haven't set their birthday yet
  const birthday = (profile as Record<string, unknown> | null)?.birthday as string | null | undefined
  if (!birthday) redirect('/onboarding/birthday')

  const memberships = memberRows ?? []

  const createdAt   = (profile as Record<string, unknown> | null)?.created_at as string | null
  const memberSince = createdAt ? new Date(createdAt).getFullYear().toString() : ''

  const friendshipRows = (acceptedFriendships ?? []) as Array<{ id: string; requester_id: string; addressee_id: string }>
  const friendUserIds  = friendshipRows.map((f) => f.requester_id === user.id ? f.addressee_id : f.requester_id)

  if (memberships.length === 0) {
    const { data: friendProfiles } = friendUserIds.length > 0
      ? await supabase.from('profiles').select('id, username, avatar_url').in('id', friendUserIds)
      : { data: [] }
    const friends = buildFriends(friendshipRows, (friendProfiles ?? []) as Array<{ id: string; username: string; avatar_url: string | null }>, user.id)
    // No memberships means no DM channels yet — dmCrewMap defaults to empty Map
    return (
      <HomeClient
        initialCrews={[]}
        userId={user.id}
        username={profile?.username ?? ''}
        avatarUrl={(profile as unknown as { avatar_url?: string | null })?.avatar_url ?? null}
        memberSince={memberSince}
        profileCache={{}}
        totalMessages={totalMessages ?? 0}
        friends={friends}
      />
    )
  }

  const crewIds = memberships.map((m) => m.crew_id)

  // Crew XP/level is always fresh (changes with every message — never cache per CLAUDE.md).
  // Member profiles and last message previews are served from cache.
  // Unread counts are personalized (depend on last_seen) — always fresh, estimated to avoid full table scan.
  const [crewsResult, cachedMembers, lastMessages, unreadResults, friendProfilesResult] = await Promise.all([
    supabase.from('crews').select('id, name, level, total_xp, invite_code, is_dm, dm_partner_1, dm_partner_2').in('id', crewIds),
    getCachedHomeMembers(crewIds),
    Promise.all(memberships.map((m) => getCachedCrewLastMessage(m.crew_id))),
    Promise.all(
      memberships.map((m) =>
        supabase
          .from('messages')
          .select('id', { count: 'estimated', head: true })
          .eq('crew_id', m.crew_id)
          .neq('message_type', 'system')
          .neq('user_id', user.id)
          .gt('created_at', m.last_seen ?? m.joined_at),
      )
    ),
    friendUserIds.length > 0
      ? supabase.from('profiles').select('id, username, avatar_url').in('id', friendUserIds)
      : Promise.resolve({ data: [] }),
  ])

  const crewMap = new Map(
    (crewsResult.data ?? []).map((c) => [c.id, c as unknown as Crew]),
  )

  // Build DM channel maps: friendId → crewId, friendId → last message
  const dmCrewMap    = new Map<string, string>()
  const dmLastMsgMap = new Map<string, { content: string; created_at: string }>()
  for (let i = 0; i < memberships.length; i++) {
    const crew = crewMap.get(memberships[i].crew_id)
    if (!crew?.is_dm) continue
    const friendId = (crew.dm_partner_1 === user.id ? crew.dm_partner_2 : crew.dm_partner_1) as string | undefined
    if (!friendId) continue
    dmCrewMap.set(friendId, crew.id)
    const lm = lastMessages[i]
    if (lm) dmLastMsgMap.set(friendId, { content: lm.content, created_at: lm.created_at })
  }

  const friends = buildFriends(
    friendshipRows,
    (friendProfilesResult.data ?? []) as Array<{ id: string; username: string; avatar_url: string | null }>,
    user.id,
    dmCrewMap,
    dmLastMsgMap,
  )

  // Build userId → username cache and memberCount per crew from cached member rows
  const profileCache: Record<string, string> = {}
  const memberCountMap: Record<string, number> = {}
  for (const row of cachedMembers ?? []) {
    const username = row.profiles?.username
    if (username) profileCache[row.user_id] = username
    memberCountMap[row.crew_id] = (memberCountMap[row.crew_id] ?? 0) + 1
  }

  const summaries: CrewSummary[] = memberships.flatMap((m, i) => {
    const crew = crewMap.get(m.crew_id)
    if (!crew || crew.is_dm) return []  // DM channels are shown in Friends section, not Squads

    const lastMsgData = lastMessages[i]
    const unreadData  = unreadResults[i]

    const lastMessage = lastMsgData
      ? {
          content:    lastMsgData.content,
          sender:     (lastMsgData.profiles as { username: string } | null)?.username ?? '',
          created_at: lastMsgData.created_at,
        }
      : null

    return [{
      crew,
      lastMessage,
      unreadCount: unreadData.count ?? 0,
      lastSeen:    m.last_seen as string | null,
      memberCount: memberCountMap[m.crew_id] ?? 1,
    }]
  })

  // Sort by most recent message activity
  summaries.sort((a, b) => {
    const aTime = a.lastMessage?.created_at ?? ''
    const bTime = b.lastMessage?.created_at ?? ''
    return bTime.localeCompare(aTime)
  })

  return (
    <HomeClient
      initialCrews={summaries}
      userId={user.id}
      username={profile?.username ?? ''}
      avatarUrl={(profile as unknown as { avatar_url?: string | null })?.avatar_url ?? null}
      memberSince={memberSince}
      profileCache={profileCache}
      totalMessages={totalMessages ?? 0}
      friends={friends}
    />
  )
}
