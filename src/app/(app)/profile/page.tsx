import { redirect } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { createClient, createServiceClient } from '@/shared/supabase/server'
import { ProfileClient } from '@/features/profile/screens/ProfileClient'
import { MUSIC_DOMAINS } from '@/shared/constants/config'
import type { PublicNote, ProfilePhoto } from '@/types'

function getCachedProfile(userId: string) {
  return unstable_cache(
    async () => {
      const supabase = createServiceClient()
      const { data } = await supabase
        .from('profiles')
        .select('username, avatar_url, is_dev, custom_avatar, status, background_url, pinned_vinyl_id, instagram_url, x_url, reddit_url, linkedin_url, custom_site_url')
        .eq('id', userId)
        .single()
      return data as {
        username: string; avatar_url: string | null; is_dev: boolean; custom_avatar: boolean; status: string | null
        background_url: string | null; pinned_vinyl_id: string | null
        instagram_url: string | null; x_url: string | null; reddit_url: string | null; linkedin_url: string | null; custom_site_url: string | null
      } | null
    },
    [`profile:${userId}`],
    { tags: [`profile:${userId}`], revalidate: 60 }
  )()
}

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const user = session.user

  // Batch 1 — everything except board data (board needs crew IDs first)
  const [profile, messagesResult, membershipsResult, friendshipXPResult, photosResult] = await Promise.all([
    getCachedProfile(user.id),
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .neq('message_type', 'system'),
    supabase
      .from('crew_members')
      .select('crew_id')
      .eq('user_id', user.id),
    supabase
      .from('friendship_xp')
      .select('total_xp')
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`),
    supabase
      .from('profile_photos')
      .select('id, user_id, url, storage_key, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  const crewIds = (membershipsResult.data ?? []).map(m => (m as { crew_id: string }).crew_id)

  // Fetch non-DM crews for the board crew switcher
  let notesCrews: Array<{ id: string; name: string }> = []
  if (crewIds.length > 0) {
    const { data: crewData } = await supabase
      .from('crews')
      .select('id, name, is_dm')
      .in('id', crewIds)
      .eq('is_dm', false)
      .order('created_at')
    notesCrews = (crewData ?? []).map(c => ({
      id:   (c as { id: string }).id,
      name: (c as { name: string }).name,
    }))
  }

  // Batch 2 — all of this user's own VIBES (music-domain notes only), regardless of
  // whether they're still in the crew they were posted to (RLS grants creators standing
  // read access to their own notes; scoping this query to currently-joined crews would
  // silently hide vibes the moment someone leaves or is kicked from that squad).
  // `notes` is also used by the crew-wide "vibes board" feature (any URL, not just
  // music), so filtering by source_domain server-side isn't just a bandwidth optimization
  // — without it, a user active on that board could have their most-recent-30 window
  // filled with non-music notes, silently starving CurrentVibeRow/VibesPlaylistSheet of
  // older music vibes that fall outside it (isMusicNote's client-side filter only ever
  // sees whatever this query happened to return).
  const notesResult = await supabase
    .from('notes')
    .select('id, crew_id, created_by, url, og_title, og_image_url, source_domain, section_id, position, created_at')
    .eq('created_by', user.id)
    .in('source_domain', MUSIC_DOMAINS)
    // position first (VibesPlaylistSheet's drag-to-reorder), created_at as the tiebreaker
    // for notes that share a position (new notes default to 0 — see the migration's own
    // comment for why that still sorts them newest-first among themselves).
    .order('position', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(30)
  const initialNotes = (notesResult.data ?? []) as unknown as PublicNote[]

  const totalMessages     = messagesResult.count ?? 0
  const groupChats        = notesCrews.length
  const totalFriendshipXP = (friendshipXPResult.data ?? []).reduce((sum, r) => sum + ((r as { total_xp: number }).total_xp ?? 0), 0)
  const initialPhotos     = (photosResult.data ?? []) as unknown as ProfilePhoto[]

  return (
    <ProfileClient
      userId={user.id}
      initialUsername={profile?.username ?? ''}
      avatarUrl={profile?.avatar_url ?? null}
      backgroundUrl={profile?.background_url ?? null}
      isDev={profile?.is_dev === true}
      isGuest={user.is_anonymous === true}
      totalMessages={totalMessages}
      groupChats={groupChats}
      initialStatus={profile?.status ?? null}
      totalFriendshipXP={totalFriendshipXP}
      initialNotes={initialNotes}
      notesCrews={notesCrews}
      initialPhotos={initialPhotos}
      initialPinnedId={profile?.pinned_vinyl_id ?? null}
      instagramUrl={profile?.instagram_url ?? null}
      xUrl={profile?.x_url ?? null}
      redditUrl={profile?.reddit_url ?? null}
      linkedinUrl={profile?.linkedin_url ?? null}
      customSiteUrl={profile?.custom_site_url ?? null}
    />
  )
}
