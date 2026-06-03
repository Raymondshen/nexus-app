import { redirect } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { VaultClient } from '@/components/game/VaultClient'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import type { Artifact, Crew, CrewMember } from '@/types'

interface VaultPageProps {
  params: Promise<{ crewId: string }>
}

// Crew name + artifacts are immutable after creation — cache for 5 minutes.
// Auth check (membership) stays outside using the cookie-based client.
// Invalidated by `revalidateTag('artifacts:{crewId}')` on boss defeat if wired.
function getCachedVaultContent(crewId: string) {
  return unstable_cache(
    async () => {
      const supabase = createServiceClient()
      const [crewResult, artifactsResult] = await Promise.all([
        supabase.from('crews').select('*').eq('id', crewId).single(),
        supabase
          .from('artifacts')
          .select('*')
          .eq('crew_id', crewId)
          .order('earned_at', { ascending: false }),
      ])
      return {
        crew:      crewResult.data as Crew | null,
        artifacts: (artifactsResult.data ?? []) as Artifact[],
      }
    },
    [`vault-content:${crewId}`],
    { tags: [`vault:${crewId}`, `artifacts:${crewId}`], revalidate: 300 }
  )()
}

export default async function VaultPage({ params }: VaultPageProps) {
  const supabase = await createClient()

  // Stage 1 — session (cookie-only, no network) + route params in parallel
  const [{ data: { session } }, { crewId }] = await Promise.all([
    supabase.auth.getSession(),
    params,
  ])
  if (!session) redirect('/login')
  const user = session.user

  // Stage 2 — membership check (fresh, security boundary) + cached crew/artifacts in parallel
  const [membershipResult, { crew, artifacts }] = await Promise.all([
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
        artifacts={artifacts}
      />
    </ErrorBoundary>
  )
}
