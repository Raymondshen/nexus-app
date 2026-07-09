import { redirect } from 'next/navigation'
import { createClient } from '@/shared/supabase/server'
import { SettingsClient } from '@/features/profile/screens/SettingsClient'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const user = session.user

  const [profileResult, membershipsResult, messagesResult, pendingDeletion] = await Promise.all([
    supabase
      .from('profiles')
      .select('username, avatar_url, background_url, is_dev, custom_avatar, status, created_at, coins')
      .eq('id', user.id)
      .single(),
    supabase
      .from('crew_members')
      .select('crew_id')
      .eq('user_id', user.id),
    supabase
      .from('messages')
      .select('id', { count: 'estimated', head: true })
      .eq('user_id', user.id)
      .neq('message_type', 'system'),
    supabase
      .from('pending_deletions')
      .select('delete_at')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  const profile    = profileResult.data as { username: string; avatar_url: string | null; background_url: string | null; is_dev: boolean; custom_avatar: boolean; status: string | null; created_at: string; coins: number } | null
  const groupChats = (membershipsResult.data ?? []).length
  const totalMessages = messagesResult.count ?? 0
  const pendingDeleteAt = (pendingDeletion.data as { delete_at?: string } | null)?.delete_at ?? null
  const memberSinceYear = profile?.created_at ? new Date(profile.created_at).getFullYear().toString() : ''

  return (
    <SettingsClient
      userId={user.id}
      userEmail={user.email ?? ''}
      initialUsername={profile?.username ?? ''}
      initialStatus={profile?.status ?? null}
      avatarUrl={profile?.avatar_url ?? null}
      backgroundUrl={profile?.background_url ?? null}
      isDev={profile?.is_dev === true}
      isGuest={user.is_anonymous === true}
      customAvatar={profile?.custom_avatar === true}
      memberSinceYear={memberSinceYear}
      totalMessages={totalMessages}
      groupChats={groupChats}
      pendingDeleteAt={pendingDeleteAt}
      initialCoins={profile?.coins ?? 0}
    />
  )
}
