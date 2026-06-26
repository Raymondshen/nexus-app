import { redirect } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { createClient, createServiceClient } from '@/shared/supabase/server'
import { VaultClient } from '@/features/combat/screens/VaultClient'
import { ErrorBoundary } from '@/shared/components/ui/ErrorBoundary'
import type { Crew, CrewMember } from '@/types'

interface VaultPageProps {
  params: Promise<{ crewId: string }>
}

function getCachedVaultContent(crewId: string) {
  return unstable_cache(
    async () => {
      const supabase = createServiceClient()
      const { data } = await supabase.from('crews').select('id, name, created_at').eq('id', crewId).single()
      return { crew: data as Crew | null }
    },
    [`vault-content:${crewId}`],
    { tags: [`vault:${crewId}`], revalidate: 300 }
  )()
}

export default async function VaultPage({ params }: VaultPageProps) {
  const supabase = await createClient()

  const [{ data: { session } }, { crewId }] = await Promise.all([
    supabase.auth.getSession(),
    params,
  ])
  if (!session) redirect('/login')
  const user = session.user

  const [membershipResult, { crew }] = await Promise.all([
    supabase
      .from('crew_members')
      .select('id')
      .eq('crew_id', crewId)
      .eq('user_id', user.id)
      .maybeSingle() as unknown as Promise<{ data: Pick<CrewMember, 'id'> | null }>,
    getCachedVaultContent(crewId),
  ])

  if (!membershipResult.data || !crew) redirect('/home')

  return (
    <ErrorBoundary>
      <VaultClient
        crewId={crewId}
        crewName={crew.name}
        crewCreatedAt={crew.created_at}
      />
    </ErrorBoundary>
  )
}
