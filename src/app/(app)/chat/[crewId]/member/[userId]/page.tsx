import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { SlidePage } from '@/components/ui/SlidePage'
import { MemberProfileClient } from './MemberProfileClient'
import type { AvatarClass } from '@/types'

interface Props {
  params: Promise<{ crewId: string; userId: string }>
}

export default async function MemberProfilePage({ params }: Props) {
  const supabase = await createClient()

  const [{ data: { session } }, { crewId, userId }] = await Promise.all([
    supabase.auth.getSession(),
    params,
  ])
  if (!session) redirect('/login')
  const viewerId = session.user.id

  async function fetchInviterUsername(targetUserId: string): Promise<string | null> {
    const service = createServiceClient()
    const { data: invite } = await service
      .from('app_invites')
      .select('inviter_id')
      .eq('used_by', targetUserId)
      .eq('used', true)
      .maybeSingle()
    if (!invite?.inviter_id) return null
    const { data: prof } = await service
      .from('profiles')
      .select('username')
      .eq('id', invite.inviter_id as string)
      .single()
    return (prof as { username?: string } | null)?.username ?? null
  }

  // Security: verify viewer is in the crew + target is in the crew
  // Fetch profile, class, stats, friendship, invite origin, and global stats in parallel
  const [
    viewerMembership,
    profileResult,
    targetMembership,
    statsResult,
    friendshipResult,
    inviterUsername,
    targetCrewCountResult,
    targetMessagesResult,
  ] = await Promise.all([
    supabase
      .from('crew_members')
      .select('user_id')
      .eq('crew_id', crewId)
      .eq('user_id', viewerId)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('username, avatar_url, birthday, created_at, status, background_url')
      .eq('id', userId)
      .single(),
    supabase
      .from('crew_members')
      .select('class')
      .eq('crew_id', crewId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.rpc('get_member_crew_stats', { p_crew_id: crewId, p_user_id: userId }),
    viewerId !== userId
      ? supabase
          .from('friendships')
          .select('id, requester_id, addressee_id, status')
          .or(
            `and(requester_id.eq.${viewerId},addressee_id.eq.${userId}),` +
            `and(requester_id.eq.${userId},addressee_id.eq.${viewerId})`
          )
          .maybeSingle()
      : Promise.resolve({ data: null }),
    fetchInviterUsername(userId),
    supabase
      .from('crew_members')
      .select('id', { count: 'estimated', head: true })
      .eq('user_id', userId),
    supabase
      .from('messages')
      .select('id', { count: 'estimated', head: true })
      .eq('user_id', userId)
      .neq('message_type', 'system'),
  ])

  // Must be a crew member viewing another crew member
  if (!viewerMembership.data) redirect('/home')
  if (!targetMembership.data || !profileResult.data) redirect(`/chat/${crewId}`)

  const profile = profileResult.data
  const statsRow = statsResult.data?.[0] ?? { msg_count: 0, total_xp: 0 }
  const friendship = friendshipResult.data as {
    id: string; requester_id: string; addressee_id: string; status: string
  } | null
  const globalGroupChats = targetCrewCountResult.count ?? 0
  const globalMessages   = targetMessagesResult.count ?? 0

  return (
    <SlidePage
      className="flex flex-col bg-black"
      style={{
        position:    'fixed',
        top:         0,
        bottom:      0,
        left:        0,
        right:       0,
        maxWidth:    480,
        marginLeft:  'auto',
        marginRight: 'auto',
        overflow:    'hidden',
      }}
    >
      <MemberProfileClient
        crewId={crewId}
        userId={userId}
        viewerId={viewerId}
        isGuest={session.user.is_anonymous === true}
        username={profile.username}
        avatarUrl={(profile as Record<string, unknown>).avatar_url as string | null}
        birthday={(profile as Record<string, unknown>).birthday as string | null}
        avatarClass={(targetMembership.data as Record<string, unknown>).class as AvatarClass | null}
        msgCount={Number(statsRow.msg_count)}
        totalXP={Number(statsRow.total_xp)}
        status={(profile as Record<string, unknown>).status as string | null}
        backgroundUrl={(profile as Record<string, unknown>).background_url as string | null}
        joinedAt={(profile as Record<string, unknown>).created_at as string | null}
        friendship={friendship}
        inviterUsername={inviterUsername}
        globalGroupChats={globalGroupChats}
        globalMessages={globalMessages}
      />
    </SlidePage>
  )
}
