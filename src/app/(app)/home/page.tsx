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

// Cached: home profile + estimated message count. Both cached together under the
// same profile:{userId} tag so a single cache miss fetches both in parallel.
type HomeProfile = {
  username: string; avatar_url: string | null; birthday: string | null
  coins: number; created_at: string; totalMessages: number
}
function getCachedHomeProfile(userId: string) {
  return unstable_cache(
    async () => {
      const supabase = createServiceClient()
      const [{ data: profile }, { count: msgCount }] = await Promise.all([
        supabase.from('profiles').select('username, avatar_url, birthday, coins, created_at').eq('id', userId).single(),
        supabase.from('messages').select('id', { count: 'estimated', head: true }).eq('user_id', userId).neq('message_type', 'system'),
      ])
      return profile ? { ...profile, totalMessages: msgCount ?? 0 } as HomeProfile : null
    },
    [`home-profile:${userId}`],
    { tags: [`profile:${userId}`], revalidate: 60 }
  )()
}

// Cached: accepted friendships for the user. Tagged friends:{userId} so all
// friendship mutations bust this cache. 60s TTL as a safety net.
type FriendshipRow = { id: string; requester_id: string; addressee_id: string }
function getCachedFriendships(userId: string) {
  return unstable_cache(
    async () => {
      const supabase = createServiceClient()
      const { data } = await supabase
        .from('friendships')
        .select('id, requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      return (data ?? []) as FriendshipRow[]
    },
    [`home-friendships:${userId}`],
    { tags: [`friends:${userId}`], revalidate: 60 }
  )()
}

// Cached: friend profiles by ID list. Tagged per-profile so an avatar/username
// change busts only the affected entry. Empty list returns instantly.
function getCachedFriendProfiles(friendIds: string[]) {
  if (friendIds.length === 0) {
    return Promise.resolve([] as Array<{ id: string; username: string; avatar_url: string | null }>)
  }
  const sorted = [...friendIds].sort()
  return unstable_cache(
    async () => {
      const supabase = createServiceClient()
      const { data } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', sorted)
      return (data ?? []) as Array<{ id: string; username: string; avatar_url: string | null }>
    },
    [`home-friend-profiles:${sorted.join(',')}`],
    { tags: sorted.map(id => `profile:${id}`), revalidate: 60 }
  )()
}

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

// Crew membership row with embedded crew data (single joined query replaces two separate queries)
type MembershipWithCrew = {
  crew_id:   string
  last_seen: string | null
  joined_at: string
  crew:      Crew | null
}

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const user = session.user

  // Stage 1 — 3 parallel calls, only 1 hits the DB (crew_members + crews joined).
  // profile (cached) + friendships (cached) avoid fresh queries on cache hits.
  // Crew total_xp/level is always fresh because crew_members itself is a fresh query.
  const [
    profile,
    { data: membershipRows, error: memberError },
    friendshipRows,
  ] = await Promise.all([
    getCachedHomeProfile(user.id),
    supabase
      .from('crew_members')
      .select('crew_id, last_seen, joined_at, crew:crews(id, name, level, total_xp, invite_code, is_dm, dm_partner_1, dm_partner_2, image_url)')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: false }),
    getCachedFriendships(user.id),
  ])

  if (memberError) console.error('[home] crew_members query error:', memberError)

  // Prompt existing users who haven't set their birthday yet
  if (!profile?.birthday) redirect('/onboarding/birthday')

  const memberships = (membershipRows ?? []) as unknown as MembershipWithCrew[]
  const memberSince = profile?.created_at ? new Date(profile.created_at).getFullYear().toString() : ''
  const friendUserIds = friendshipRows.map(f => f.requester_id === user.id ? f.addressee_id : f.requester_id)

  if (memberships.length === 0) {
    const friendProfiles = await getCachedFriendProfiles(friendUserIds)
    const friends = buildFriends(friendshipRows, friendProfiles, user.id)
    return (
      <HomeClient
        initialCrews={[]}
        userId={user.id}
        username={profile?.username ?? ''}
        avatarUrl={profile?.avatar_url ?? null}
        memberSince={memberSince}
        profileCache={{}}
        totalMessages={profile?.totalMessages ?? 0}
        friends={friends}
        initialCoins={profile?.coins ?? 0}
      />
    )
  }

  const crewIds = memberships.map((m) => m.crew_id)

  // Stage 2 — 4 parallel calls, only 1 hits the DB (get_unread_counts RPC).
  // cachedMembers + lastMessages are served from cache; friendProfiles now also cached.
  const [cachedMembers, lastMessages, unreadResult, friendProfiles] = await Promise.all([
    getCachedHomeMembers(crewIds),
    Promise.all(memberships.map((m) => getCachedCrewLastMessage(m.crew_id))),
    supabase.rpc('get_unread_counts', {
      p_crew_ids: crewIds,
      p_cutoffs:  memberships.map(m => (m.last_seen ?? m.joined_at) as string),
    }),
    getCachedFriendProfiles(friendUserIds),
  ])

  const unreadMap = new Map((unreadResult.data ?? []).map(r => [r.crew_id, r.unread_count]))

  // Build crew map from the already-fetched embedded crew data — no separate crews query needed
  const crewMap = new Map(
    memberships.filter(m => m.crew).map(m => [m.crew_id, m.crew as unknown as Crew])
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

  const friends = buildFriends(friendshipRows, friendProfiles, user.id, dmCrewMap, dmLastMsgMap)

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
      unreadCount: unreadMap.get(m.crew_id) ?? 0,
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
      avatarUrl={profile?.avatar_url ?? null}
      memberSince={memberSince}
      profileCache={profileCache}
      totalMessages={profile?.totalMessages ?? 0}
      friends={friends}
      initialCoins={profile?.coins ?? 0}
    />
  )
}
