import { redirect } from 'next/navigation'
import { createClient } from '@/shared/supabase/server'
import { ManageUserProfile } from '@/features/profile/screens/ManageUserProfile'

export default async function ManageProfilePage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const user = session.user
  if (user.is_anonymous) redirect('/profile')

  const [{ data: profile }, messagesResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('username, avatar_url, background_url, is_dev, status, coins, gem_balance')
      .eq('id', user.id)
      .single(),
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .neq('message_type', 'system'),
  ])

  type ProfileRow = {
    username:      string
    avatar_url:    string | null
    background_url: string | null
    is_dev:        boolean
    status:        string | null
    coins:         number
    gem_balance:   number
  }
  const row = profile as ProfileRow | null

  return (
    <ManageUserProfile
      userId={user.id}
      userEmail={user.email ?? ''}
      initialUsername={row?.username ?? ''}
      initialStatus={row?.status ?? null}
      avatarUrl={row?.avatar_url ?? null}
      backgroundUrl={row?.background_url ?? null}
      isDev={row?.is_dev === true}
      totalMessages={messagesResult.count ?? 0}
      coins={row?.coins ?? 0}
      gemBalance={row?.gem_balance ?? 0}
    />
  )
}
