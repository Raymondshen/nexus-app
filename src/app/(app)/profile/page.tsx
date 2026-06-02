import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProfileClient } from './ProfileClient'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, avatar_url')
    .eq('id', user.id)
    .single()

  return (
    <ProfileClient
      userId={user.id}
      initialUsername={profile?.username ?? ''}
      avatarUrl={(profile as unknown as { avatar_url?: string | null })?.avatar_url ?? null}
    />
  )
}
