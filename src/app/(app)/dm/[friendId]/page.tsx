import { redirect } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { DMOverlayBack } from '@/components/chat/DMOverlayBack'
import { MessageList } from '@/components/chat/MessageList'
import { ChatInput } from '@/components/chat/ChatInput'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { SlidePage } from '@/components/ui/SlidePage'
import type { Profile, ActiveRaid, AvatarClass } from '@/types'

type MemberProfile = Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url' | 'status'>
type MemberProfileMap = Record<string, MemberProfile>

function getCachedDMMemberProfiles(crewId: string) {
  return unstable_cache(
    async () => {
      const supabase = createServiceClient()
      const { data } = await supabase
        .from('crew_members')
        .select('user_id, class, profile:profiles(id, username, avatar_url, status)')
        .eq('crew_id', crewId)
      type RawRow = { user_id: string; class: string | null; profile: Omit<MemberProfile, 'avatar_class'> | null }
      return (data ?? []).map((r) => {
        const row = r as unknown as RawRow
        return {
          user_id: row.user_id,
          profile: row.profile
            ? { ...row.profile, avatar_class: row.class as AvatarClass | null }
            : null,
        }
      }) as { user_id: string; profile: MemberProfile | null }[]
    },
    [`chat-member-profiles:${crewId}`],
    { tags: [`crew-members:${crewId}`], revalidate: 60 }
  )()
}

interface DMPageProps {
  params: Promise<{ friendId: string }>
}

export default async function DMPage({ params }: DMPageProps) {
  const supabase = await createClient()

  const [{ data: { session } }, { friendId }] = await Promise.all([
    supabase.auth.getSession(),
    params,
  ])
  if (!session) redirect('/login')
  const user = session.user

  // Security: verify an accepted friendship exists before creating/opening a DM channel
  const { data: friendship } = await supabase
    .from('friendships')
    .select('id')
    .eq('status', 'accepted')
    .or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${friendId}),` +
      `and(requester_id.eq.${friendId},addressee_id.eq.${user.id})`
    )
    .maybeSingle()

  if (!friendship) redirect('/home')

  // Get or create the DM channel (idempotent — safe to call on every page load)
  const { data: channelId, error: rpcError } = await supabase
    .rpc('get_or_create_dm', { other_user_id: friendId })

  if (rpcError || !channelId) redirect('/home')

  const dmCrewId = channelId as string

  // Fetch friend profile, crew XP, raid, and member profiles in parallel
  const [friendProfileResult, cachedProfiles, crewResult, raidResult] = await Promise.all([
    supabase.from('profiles').select('username, avatar_url').eq('id', friendId).single(),
    getCachedDMMemberProfiles(dmCrewId),
    supabase.from('crews').select('id, total_xp, level').eq('id', dmCrewId).single(),
    supabase
      .from('active_raids')
      .select('*')
      .eq('crew_id', dmCrewId)
      .is('defeated_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle(),
  ])

  if (!crewResult.data) redirect('/home')

  const friendUsername  = friendProfileResult.data?.username ?? 'Friend'
  const friendAvatarUrl = (friendProfileResult.data as Record<string, unknown> | null)?.avatar_url as string | null ?? null
  const crew            = crewResult.data as unknown as { id: string; total_xp: number; level: number }
  const raidRow         = raidResult.data as ActiveRaid | null

  const memberProfiles: MemberProfileMap = Object.fromEntries(
    cachedProfiles.filter((r) => r.profile).map((r) => [r.user_id, r.profile!])
  )

  return (
    <SlidePage
      className="flex flex-col bg-black"
      nativeSwipe
      style={{
        position:     'fixed',
        top:          0,
        bottom:       0,
        left:         0,
        right:        0,
        maxWidth:     480,
        marginLeft:   'auto',
        marginRight:  'auto',
        overflow:     'hidden',
      }}
    >
      <div className="relative flex-1 min-h-0">
        <ErrorBoundary>
          <MessageList
            crewId={dmCrewId}
            crewName={friendUsername}
            currentUserId={user.id}
            memberProfiles={memberProfiles}
            initialRaid={raidRow}
          />
        </ErrorBoundary>
        <DMOverlayBack
          crewId={dmCrewId}
          currentUserId={user.id}
          initialXP={crew.total_xp}
          initialRaid={raidRow}
          friendUsername={friendUsername}
          friendAvatarUrl={friendAvatarUrl}
          friendId={friendId}
        />
      </div>

      <ErrorBoundary>
        <ChatInput
          crewId={dmCrewId}
          userId={user.id}
          userProfile={
            memberProfiles[user.id] ?? {
              id: user.id, username: '???', avatar_class: null, avatar_url: null, status: null,
            }
          }
          memberProfiles={memberProfiles}
          crewName={friendUsername}
          isDM
          dmPartnerId={friendId}
        />
      </ErrorBoundary>
    </SlidePage>
  )
}
