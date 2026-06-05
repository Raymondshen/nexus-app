import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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

  // Security: verify viewer is in the crew + target is in the crew
  // Fetch profile, class, stats, and friendship status in parallel
  const [
    viewerMembership,
    profileResult,
    targetMembership,
    statsResult,
    friendshipResult,
  ] = await Promise.all([
    supabase
      .from('crew_members')
      .select('user_id')
      .eq('crew_id', crewId)
      .eq('user_id', viewerId)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('username, avatar_url, birthday')
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
  ])

  // Must be a crew member viewing another crew member
  if (!viewerMembership.data) redirect('/home')
  if (!targetMembership.data || !profileResult.data) redirect(`/chat/${crewId}`)

  const profile = profileResult.data
  const statsRow = statsResult.data?.[0] ?? { msg_count: 0, total_xp: 0 }
  const friendship = friendshipResult.data as {
    id: string; requester_id: string; addressee_id: string; status: string
  } | null

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
        friendship={friendship}
      />
    </SlidePage>
  )
}
