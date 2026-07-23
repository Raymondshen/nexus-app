import { redirect } from 'next/navigation'
import { createClient } from '@/shared/supabase/server'
import { ChatSquadsPage } from '@/features/chat/screens/ChatSquadsPage'
import { computeOnlineIds } from '@/shared/utils/presence'
import { PRESENCE_ONLINE_THRESHOLD_MS } from '@/shared/constants/config'
import type { BrowseRoom } from '@/features/chat/components/input/SquadsListShared'

interface SquadsPageProps {
  params: Promise<{ crewId: string }>
}

// Membership row with its embedded crew — same shape home/page.tsx's own
// MembershipWithCrew uses, plus background_image_url/invite_code (Home's query
// doesn't need either; this page's Squads-row cards do, via SwipePreviewCard's
// cover photo, and the Invite Friends button needs the current room's own code).
type MembershipWithCrew = {
  crew_id:   string
  last_seen: string | null
  joined_at: string
  crew: {
    id:                  string
    name:                string
    level:               number
    is_dm:                boolean
    image_url:            string | null
    background_image_url: string | null
    last_message_preview: string | null
    last_message_at:      string | null
    invite_code:          string
  } | null
}

type MemberRow = { crew_id: string; user_id: string }
type ProfileRow = { id: string; username: string; avatar_url: string | null }

// Server-rendered counterpart to ChatFloatingNav's Menu icon (see that
// component's own doc comment for why this couldn't just be another client-side
// overlay) — Figma 589:3617. Fetches every non-DM crew this user belongs to with
// the same RoomMeta shape ChatRoomBrowseSheet's own room cards need (level,
// member count, background photo, online members, unread count) — mirrors
// home/page.tsx's batched-query structure (one crew_members×crews join, then a
// second parallel round for member rows + get_unread_counts), extended with
// ensureRoomMeta.ts's own background-photo/presence fields Home's query doesn't
// fetch, since Home's card design has neither. Deliberately uncached (unlike
// Home's unstable_cache-wrapped queries) — this page is reached far less often
// and its whole point is surfacing what's current (unread counts, who's online),
// so a stale cache would undercut it.
export default async function SquadsPage({ params }: SquadsPageProps) {
  const { crewId } = await params
  const supabase   = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const userId = session.user.id

  const [{ data: membershipRows }, { data: profile }] = await Promise.all([
    supabase
      .from('crew_members')
      .select('crew_id, last_seen, joined_at, crew:crews(id, name, level, is_dm, image_url, background_image_url, last_message_preview, last_message_at, invite_code)')
      .eq('user_id', userId),
    supabase.from('profiles').select('pinned_crew_id').eq('id', userId).single(),
  ])

  const memberships = (membershipRows ?? []) as unknown as MembershipWithCrew[]
  const isMember = memberships.some((m) => m.crew_id === crewId)
  if (!isMember) redirect('/home')

  const squadMemberships = memberships.filter((m) => m.crew && !m.crew.is_dm)
  const crewIds = squadMemberships.map((m) => m.crew_id)
  const currentCrew = squadMemberships.find((m) => m.crew_id === crewId)?.crew
  if (!currentCrew) redirect('/home')

  // Lean member rows only (crew_id, user_id) — no profile join. Only ONLINE
  // members ever need a username/avatar (for the row's online-avatar stack), and
  // that's typically a small fraction of the full member list, so profiles are
  // fetched separately below, scoped to just `onlineIds`, instead of joining
  // every single member row to its profile up front.
  const [{ data: memberRows }, unreadResult] = await Promise.all([
    crewIds.length > 0
      ? supabase.from('crew_members').select('crew_id, user_id').in('crew_id', crewIds)
      : Promise.resolve({ data: [] as MemberRow[] }),
    crewIds.length > 0
      ? supabase.rpc('get_unread_counts', {
          p_crew_ids: crewIds,
          p_cutoffs:  squadMemberships.map((m) => (m.last_seen ?? m.joined_at) as string),
        })
      : Promise.resolve({ data: [] as { crew_id: string; unread_count: number }[] }),
  ])

  const members = (memberRows ?? []) as unknown as MemberRow[]
  const memberIds = [...new Set(members.map((r) => r.user_id))]
  const { data: presenceData } = memberIds.length > 0
    ? await supabase.from('user_presence').select('user_id, last_active_at').in('user_id', memberIds)
    : { data: [] as { user_id: string; last_active_at: string }[] }

  const lastActiveMap: Record<string, number> = {}
  for (const row of presenceData ?? []) {
    lastActiveMap[row.user_id] = new Date(row.last_active_at).getTime()
  }
  const onlineIds = computeOnlineIds(lastActiveMap, PRESENCE_ONLINE_THRESHOLD_MS)

  const onlineIdList = [...onlineIds]
  const { data: onlineProfileRows } = onlineIdList.length > 0
    ? await supabase.from('profiles').select('id, username, avatar_url').in('id', onlineIdList)
    : { data: [] as ProfileRow[] }
  const profileMap = new Map((onlineProfileRows ?? []).map((p) => [p.id, p as ProfileRow]))

  const unreadMap = new Map((unreadResult.data ?? []).map((r) => [r.crew_id, r.unread_count]))
  const membersByCrewMap = new Map<string, MemberRow[]>()
  for (const row of members) {
    const list = membersByCrewMap.get(row.crew_id) ?? []
    list.push(row)
    membersByCrewMap.set(row.crew_id, list)
  }

  const rooms: BrowseRoom[] = squadMemberships
    .map((m): BrowseRoom | null => {
      const crew = m.crew
      if (!crew) return null
      const crewMembers = membersByCrewMap.get(m.crew_id) ?? []
      const onlineMembers = crewMembers
        .filter((r) => onlineIds.has(r.user_id))
        .map((r) => {
          const p = profileMap.get(r.user_id)
          return { id: r.user_id, username: p?.username ?? '???', avatarUrl: p?.avatar_url ?? null }
        })
      return {
        id:                  crew.id,
        name:                crew.name,
        imageUrl:            crew.image_url,
        backgroundImageUrl:  crew.background_image_url,
        level:               crew.level,
        memberCount:         crewMembers.length,
        lastMessagePreview:  crew.last_message_preview,
        lastMessageAt:       crew.last_message_at,
        unreadCount:         unreadMap.get(m.crew_id) ?? 0,
        onlineMembers,
      }
    })
    .filter((r): r is BrowseRoom => r !== null)
    .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''))

  const pinnedCrewId = (profile as { pinned_crew_id: string | null } | null)?.pinned_crew_id ?? null
  const sortedRooms = pinnedCrewId
    ? [...rooms].sort((a, b) => (a.id === pinnedCrewId ? -1 : b.id === pinnedCrewId ? 1 : 0))
    : rooms

  return (
    <ChatSquadsPage
      crewId={crewId}
      inviteCode={currentCrew.invite_code}
      rooms={sortedRooms}
      pinnedRoomId={pinnedCrewId}
    />
  )
}
