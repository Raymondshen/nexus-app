import { redirect } from 'next/navigation'
import { createClient } from '@/shared/supabase/server'
import { SlidePage } from '@/app/layouts/SlidePage'
import { AccountPageMember } from '@/features/profile/components/AccountPageMember'
import { MUSIC_DOMAINS } from '@/shared/constants/config'
import type { PublicNote, ProfilePhoto } from '@/types'

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

  const [
    viewerMembership,
    profileResult,
    targetMembership,
    crewResult,
    notesResult,
    globalMembershipsResult,
    globalMessagesResult,
    friendshipXPResult,
    targetCrewMemberResult,
    photosResult,
  ] = await Promise.all([
    supabase
      .from('crew_members')
      .select('user_id')
      .eq('crew_id', crewId)
      .eq('user_id', viewerId)
      .maybeSingle(),
    supabase
      .from('profiles')
      // is_dev is only ever read below when isOwner (userId === viewerId) — in that
      // case this row IS the viewer's own, so it doubles as the Braces-icon gate
      // without a second query. Irrelevant/unused when viewing someone else's profile.
      .select('username, avatar_url, background_url, status, created_at, pinned_vinyl_id, is_dev, instagram_url, x_url, reddit_url, linkedin_url, custom_site_url')
      .eq('id', userId)
      .single(),
    supabase
      .from('crew_members')
      .select('user_id')
      .eq('crew_id', crewId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.from('crews').select('name').eq('id', crewId).single(),
    supabase
      .from('notes')
      .select('id, crew_id, created_by, url, og_title, og_image_url, source_domain, section_id, position, created_at')
      .eq('created_by', userId)
      // Music-domain notes only — see profile/page.tsx's identical filter for why this
      // is a correctness fix (not just bandwidth), since `notes` is shared with the
      // crew-wide vibes board feature (any URL).
      .in('source_domain', MUSIC_DOMAINS)
      // Reflect this member's own drag-to-reorder order (VibesPlaylistSheet), same as
      // the profile/page.tsx query for the owner's own profile.
      .order('position', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(30),
    // Global crew memberships for the member (filtered to non-DM below — DMs aren't group chats)
    supabase
      .from('crew_members')
      .select('crew_id')
      .eq('user_id', userId),
    // Global message count for the member
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .neq('message_type', 'system'),
    // Friendship XP between viewer and member
    supabase
      .from('friendship_xp')
      .select('total_xp')
      .or(
        `and(user_a.eq.${viewerId},user_b.eq.${userId}),and(user_a.eq.${userId},user_b.eq.${viewerId})`
      )
      .maybeSingle(),
    // Joined date for this specific crew
    supabase
      .from('crew_members')
      .select('joined_at')
      .eq('crew_id', crewId)
      .eq('user_id', userId)
      .maybeSingle(),
    // Profile photos for the member
    supabase
      .from('profile_photos')
      .select('id, user_id, url, storage_key, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  if (!viewerMembership.data) redirect('/home')
  if (!targetMembership.data || !profileResult.data) redirect(`/chat/${crewId}`)

  type ProfileRow = {
    username: string; avatar_url: string | null; background_url: string | null; status: string | null; created_at: string
    pinned_vinyl_id: string | null; is_dev: boolean
    instagram_url: string | null; x_url: string | null; reddit_url: string | null; linkedin_url: string | null; custom_site_url: string | null
  }
  const profile      = profileResult.data as ProfileRow
  const crewName     = (crewResult.data as { name?: string } | null)?.name ?? ''
  const notesCrews   = [{ id: crewId, name: crewName }]
  const joinedYear   = profile.created_at ? new Date(profile.created_at).getFullYear() : null
  const globalMsgs   = globalMessagesResult.count ?? 0

  // Group chat count excludes DM channels (crews.is_dm = true) — DMs aren't group chats
  const globalCrewIds = (globalMembershipsResult.data ?? []).map(m => (m as { crew_id: string }).crew_id)
  let globalGroups = 0
  if (globalCrewIds.length > 0) {
    const { count } = await supabase
      .from('crews')
      .select('id', { count: 'exact', head: true })
      .in('id', globalCrewIds)
      .eq('is_dm', false)
    globalGroups = count ?? 0
  }
  const friendshipXP   = (friendshipXPResult.data as { total_xp?: number } | null)?.total_xp ?? null
  const initialPhotos  = (photosResult.data ?? []) as unknown as ProfilePhoto[]

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
      <AccountPageMember
        userId={userId}
        viewerId={viewerId}
        isDev={profile.is_dev === true}
        isGuest={session.user.is_anonymous === true}
        username={profile.username}
        avatarUrl={profile.avatar_url}
        backgroundUrl={profile.background_url}
        status={profile.status}
        joinedYear={joinedYear}
        globalGroupChats={globalGroups}
        globalMessages={globalMsgs}
        friendshipXP={friendshipXP}
        initialNotes={(notesResult.data ?? []) as unknown as PublicNote[]}
        notesCrews={notesCrews}
        initialPhotos={initialPhotos}
        initialPinnedId={profile.pinned_vinyl_id}
        instagramUrl={profile.instagram_url}
        xUrl={profile.x_url}
        redditUrl={profile.reddit_url}
        linkedinUrl={profile.linkedin_url}
        customSiteUrl={profile.custom_site_url}
      />
    </SlidePage>
  )
}
