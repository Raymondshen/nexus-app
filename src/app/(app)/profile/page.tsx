import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProfileClient } from './ProfileClient'

const DEV_EMAIL = 'shenraymonds@gmail.com'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const user = session.user

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, avatar_url')
    .eq('id', user.id)
    .single()

  return (
    <ProfileClient
      userId={user.id}
      userEmail={user.email ?? ''}
      initialUsername={profile?.username ?? ''}
      avatarUrl={(profile as unknown as { avatar_url?: string | null })?.avatar_url ?? null}
      isDev={user.email === DEV_EMAIL}
      isGuest={user.is_anonymous === true}
    />
  )
}
