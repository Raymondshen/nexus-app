import { redirect } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { HomeClient } from './HomeClient'
import type { Crew } from '@/types'

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

  // Profile, crew membership, and total messages are independent — run in parallel
  const [
    { data: profile },
    { data: memberRows, error: memberError },
    { count: totalMessages },
  ] = await Promise.all([
    supabase.from('profiles').select('username, avatar_url, birthday, created_at').eq('id', user.id).single(),
    supabase.from('crew_members').select('crew_id, last_seen, joined_at').eq('user_id', user.id).order('joined_at', { ascending: false }),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('user_id', user.id).neq('message_type', 'system'),
  ])

  if (memberError) console.error('[home] crew_members query error:', memberError)

  // Prompt existing users who haven't set their birthday yet
  const birthday = (profile as Record<string, unknown> | null)?.birthday as string | null | undefined
  if (!birthday) redirect('/onboarding/birthday')

  const memberships = memberRows ?? []

  const createdAt   = (profile as Record<string, unknown> | null)?.created_at as string | null
  const memberSince = createdAt ? new Date(createdAt).getFullYear().toString() : ''

  if (memberships.length === 0) {
    return (
      <HomeClient
        initialCrews={[]}
        userId={user.id}
        username={profile?.username ?? ''}
        avatarUrl={(profile as unknown as { avatar_url?: string | null })?.avatar_url ?? null}
        memberSince={memberSince}
        profileCache={{}}
        totalMessages={totalMessages ?? 0}
      />
    )
  }

  const crewIds = memberships.map((m) => m.crew_id)

  // Crew XP/level is always fresh (changes with every message — never cache per CLAUDE.md).
  // Member profiles and last message previews are served from cache.
  // Unread counts are personalized (depend on last_seen) — always fresh, estimated to avoid full table scan.
  const [crewsResult, cachedMembers, lastMessages, unreadResults] = await Promise.all([
    supabase.from('crews').select('id, name, level, total_xp, invite_code').in('id', crewIds),
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
  ])

  const crewMap = new Map(
    (crewsResult.data ?? []).map((c) => [c.id, c as unknown as Crew]),
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
    if (!crew) return []

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
    />
  )
}
