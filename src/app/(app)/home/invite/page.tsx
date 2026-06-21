import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { InvitePage } from '../InviteArsenal'

export default async function InvitePageRoute() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const userId = session.user.id

  const { data: profile } = await supabase
    .from('profiles')
    .select('coins')
    .eq('id', userId)
    .single()

  return (
    <InvitePage
      userId={userId}
      initialCoins={profile?.coins ?? 0}
    />
  )
}
