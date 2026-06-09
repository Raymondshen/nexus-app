import { redirect } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'

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
import { ProfileClient } from './ProfileClient'


function getCachedProfile(userId: string) {
  return unstable_cache(
    async () => {
      const supabase = createServiceClient()
      const { data } = await supabase
        .from('profiles')
        .select('username, avatar_url, avatar_class, is_dev, created_at, custom_avatar')
        .eq('id', userId)
        .single()
      return data as { username: string; avatar_url: string | null; avatar_class: string | null; is_dev: boolean; created_at: string; custom_avatar: boolean } | null
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

  const [profile, messagesResult, crewsResult, inviterUsername] = await Promise.all([
    getCachedProfile(user.id),
    supabase
      .from('messages')
      .select('id', { count: 'estimated', head: true })
      .eq('user_id', user.id)
      .neq('message_type', 'system'),
    supabase
      .from('crew_members')
      .select('id', { count: 'estimated', head: true })
      .eq('user_id', user.id),
    fetchInviterUsername(user.id),
  ])

  const memberSinceYear = profile?.created_at
    ? new Date(profile.created_at).getFullYear().toString()
    : ''
  const totalMessages = messagesResult.count ?? 0
  const groupChats    = crewsResult.count ?? 0

  return (
    <ProfileClient
      userId={user.id}
      userEmail={user.email ?? ''}
      initialUsername={profile?.username ?? ''}
      avatarUrl={profile?.avatar_url ?? null}
      avatarClass={profile?.avatar_class ?? null}
      customAvatar={profile?.custom_avatar === true}
      isDev={profile?.is_dev === true}
      isGuest={user.is_anonymous === true}
      memberSinceYear={memberSinceYear}
      totalMessages={totalMessages}
      groupChats={groupChats}
      inviterUsername={inviterUsername}
    />
  )
}
