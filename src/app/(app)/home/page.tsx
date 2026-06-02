import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { HomeClient } from './HomeClient'
import type { Crew } from '@/types'

export interface CrewSummary {
  crew:        Crew
  lastMessage: { content: string; sender: string; created_at: string } | null
  unreadCount: number
  lastSeen:    string | null
  memberCount: number
}

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, avatar_url')
    .eq('id', user.id)
    .single()

  const { data: memberRows, error: memberError } = await supabase
    .from('crew_members')
    .select('crew_id, last_seen, joined_at')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false })

  if (memberError) console.error('[home] crew_members query error:', memberError)

  const memberships = memberRows ?? []

  if (memberships.length === 0) {
    return (
      <HomeClient
        initialCrews={[]}
        userId={user.id}
        username={profile?.username ?? ''}
        avatarUrl={(profile as unknown as { avatar_url?: string | null })?.avatar_url ?? null}
        profileCache={{}}
      />
    )
  }

  const crewIds = memberships.map((m) => m.crew_id)

  // Fetch all crews, member profiles, last messages, and unread counts in parallel
  const [crewsResult, profilesResult, ...perCrewResults] = await Promise.all([
    supabase.from('crews').select('id, name, level, total_xp, invite_code').in('id', crewIds),

    supabase
      .from('crew_members')
      .select('crew_id, user_id, profiles(username)')
      .in('crew_id', crewIds),

    ...memberships.flatMap((m) => [
      supabase
        .from('messages')
        .select('content, created_at, profiles(username)')
        .eq('crew_id', m.crew_id)
        .neq('message_type', 'system')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('crew_id', m.crew_id)
        .neq('message_type', 'system')
        .neq('user_id', user.id)
        .gt('created_at', m.last_seen ?? m.joined_at),
    ]),
  ])

  const crewMap = new Map(
    (crewsResult.data ?? []).map((c) => [c.id, c as unknown as Crew]),
  )

  // Build userId → username cache and memberCount per crew from all crew members
  const profileCache: Record<string, string> = {}
  const memberCountMap: Record<string, number> = {}
  for (const row of profilesResult.data ?? []) {
    const r = row as unknown as { crew_id: string; user_id: string; profiles: { username: string } | null }
    const username = r.profiles?.username
    if (username) profileCache[r.user_id] = username
    memberCountMap[r.crew_id] = (memberCountMap[r.crew_id] ?? 0) + 1
  }

  const summaries: CrewSummary[] = memberships.flatMap((m, i) => {
    const crew = crewMap.get(m.crew_id)
    if (!crew) return []

    const lastMsgData = (perCrewResults[i * 2] as { data: { content: string; created_at: string; profiles: unknown } | null }).data
    const unreadData  = perCrewResults[i * 2 + 1] as { count: number | null }

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
      profileCache={profileCache}
    />
  )
}
