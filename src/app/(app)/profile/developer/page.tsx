import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { DeveloperClient } from './DeveloperClient'

export default async function DeveloperPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const service = createServiceClient()
  const { data: profile } = await service
    .from('profiles')
    .select('is_dev, coins, friendship_xp_enabled')
    .eq('id', session.user.id)
    .maybeSingle()

  if (!(profile as { is_dev?: boolean } | null)?.is_dev) redirect('/profile')

  type ProfileRow = { is_dev?: boolean; coins?: number; friendship_xp_enabled?: boolean } | null

  return (
    <DeveloperClient
      userId={session.user.id}
      initialCoins={(profile as ProfileRow)?.coins ?? 0}
      initialFriendshipXPEnabled={(profile as ProfileRow)?.friendship_xp_enabled === true}
    />
  )
}
