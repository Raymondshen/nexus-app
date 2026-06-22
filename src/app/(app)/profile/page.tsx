import { redirect } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { ProfileClient } from './ProfileClient'
import type { PublicNote, BoardSection } from '@/types'

async function fetchInviterUsername(userId: string): Promise<string | null> {
  const service = createServiceClient()
  const { data: invite } = await service
    .from('app_invites')
    .select('inviter_id')
    .eq('used_by', userId)
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

function getCachedProfile(userId: string) {
  return unstable_cache(
    async () => {
      const supabase = createServiceClient()
      const { data } = await supabase
        .from('profiles')
        .select('username, avatar_url, avatar_class, is_dev, created_at, custom_avatar, status, background_url')
        .eq('id', userId)
        .single()
      return data as { username: string; avatar_url: string | null; avatar_class: string | null; is_dev: boolean; created_at: string; custom_avatar: boolean; status: string | null; background_url: string | null } | null
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
  const [profile, messagesResult, membershipsResult, inviterUsername, pendingDeletion, coinsResult, friendshipXPResult] = await Promise.all([
    getCachedProfile(user.id),
    supabase
      .from('messages')
      .select('id', { count: 'estimated', head: true })
      .eq('user_id', user.id)
      .neq('message_type', 'system'),
    supabase
      .from('crew_members')
      .select('crew_id')
      .eq('user_id', user.id),
    fetchInviterUsername(user.id),
    supabase
      .from('pending_deletions')
      .select('delete_at')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('coins')
      .eq('id', user.id)
      .single(),
    supabase
      .from('friendship_xp')
      .select('total_xp')
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`),
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

  // Batch 2 — board data for first crew
  let initialNotes: PublicNote[]    = []
  let initialSections: BoardSection[] = []
  const firstCrewId = notesCrews[0]?.id ?? ''

  if (firstCrewId) {
    const [notesResult, sectionsResult] = await Promise.all([
      supabase
        .from('notes')
        .select('id, crew_id, created_by, url, og_title, og_image_url, source_domain, section_id, created_at')
        .eq('crew_id', firstCrewId)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('board_sections')
        .select('id, crew_id, created_by, name, position, created_at')
        .eq('crew_id', firstCrewId)
        .order('position')
        .order('created_at'),
    ])
    initialNotes    = (notesResult.data    ?? []) as unknown as PublicNote[]
    initialSections = (sectionsResult.data ?? []) as unknown as BoardSection[]
  }

  const pendingDeleteAt   = (pendingDeletion.data as { delete_at?: string } | null)?.delete_at ?? null
  const memberSinceYear   = profile?.created_at ? new Date(profile.created_at).getFullYear().toString() : ''
  const totalMessages     = messagesResult.count ?? 0
  const groupChats        = crewIds.length
  const coins             = (coinsResult.data as { coins?: number } | null)?.coins ?? 0
  const totalFriendshipXP = (friendshipXPResult.data ?? []).reduce((sum, r) => sum + ((r as { total_xp: number }).total_xp ?? 0), 0)

  return (
    <ProfileClient
      userId={user.id}
      userEmail={user.email ?? ''}
      initialUsername={profile?.username ?? ''}
      avatarUrl={profile?.avatar_url ?? null}
      avatarClass={profile?.avatar_class ?? null}
      customAvatar={profile?.custom_avatar === true}
      backgroundUrl={profile?.background_url ?? null}
      isDev={profile?.is_dev === true}
      isGuest={user.is_anonymous === true}
      memberSinceYear={memberSinceYear}
      totalMessages={totalMessages}
      groupChats={groupChats}
      inviterUsername={inviterUsername}
      initialStatus={profile?.status ?? null}
      pendingDeleteAt={pendingDeleteAt}
      coins={coins}
      totalFriendshipXP={totalFriendshipXP}
      initialNotes={initialNotes}
      initialSections={initialSections}
      notesCrews={notesCrews}
    />
  )
}
