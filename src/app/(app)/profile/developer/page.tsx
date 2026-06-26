import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/shared/supabase/server'
import { DeveloperClient } from '@/features/profile/screens/DeveloperClient'

export default async function DeveloperPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const service = createServiceClient()
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    service.from('profiles').select('is_dev, coins').eq('id', session.user.id).maybeSingle(),
    service
      .from('crew_members')
      .select('crews(id, name, is_dm)')
      .eq('user_id', session.user.id),
  ])

  if (!(profile as { is_dev?: boolean } | null)?.is_dev) redirect('/profile')

  type ProfileRow = { is_dev?: boolean; coins?: number } | null
  type MembershipRow = { crews: { id: string; name: string; is_dm: boolean } | null }

  const crews = ((memberships ?? []) as unknown as MembershipRow[])
    .map((m) => m.crews)
    .filter((c): c is { id: string; name: string; is_dm: boolean } => c !== null && !c.is_dm)
    .map(({ id, name }) => ({ id, name }))

  return (
    <DeveloperClient
      userId={session.user.id}
      initialCoins={(profile as ProfileRow)?.coins ?? 0}
      userCrews={crews}
    />
  )
}
