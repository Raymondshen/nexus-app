import { redirect } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { ProfileClient } from './ProfileClient'

const DEV_EMAIL = 'shenraymonds@gmail.com'

function getCachedProfile(userId: string) {
  return unstable_cache(
    async () => {
      const supabase = createServiceClient()
      const { data } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', userId)
        .single()
      return data as { username: string; avatar_url: string | null } | null
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

  const profile = await getCachedProfile(user.id)

  return (
    <ProfileClient
      userId={user.id}
      userEmail={user.email ?? ''}
      initialUsername={profile?.username ?? ''}
      avatarUrl={profile?.avatar_url ?? null}
      isDev={user.email === DEV_EMAIL}
      isGuest={user.is_anonymous === true}
    />
  )
}
