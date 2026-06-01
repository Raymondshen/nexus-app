import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { VaultClient } from '@/components/game/VaultClient'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import type { Artifact, Crew, CrewMember } from '@/types'

interface VaultPageProps {
  params: Promise<{ crewId: string }>
}

export default async function VaultPage({ params }: VaultPageProps) {
  const supabase = await createClient()

  // Stage 1 — auth + route params in parallel
  const [{ data: { user } }, { crewId }] = await Promise.all([
    supabase.auth.getUser(),
    params,
  ])
  if (!user) redirect('/login')

  // Stage 2 — membership, crew data, and artifacts all in parallel (RLS enforces access)
  const [membershipResult, crewResult, artifactsResult] = await Promise.all([
    supabase
      .from('crew_members')
      .select('id')
      .eq('crew_id', crewId)
      .eq('user_id', user.id)
      .maybeSingle() as Promise<{ data: Pick<CrewMember, 'id'> | null }>,
    supabase
      .from('crews')
      .select('*')
      .eq('id', crewId)
      .single() as Promise<{ data: Crew | null }>,
    supabase
      .from('artifacts')
      .select('*')
      .eq('crew_id', crewId)
      .order('earned_at', { ascending: false }) as Promise<{ data: Artifact[] | null }>,
  ])

  if (!membershipResult.data || !crewResult.data) redirect('/home')

  const crew      = crewResult.data
  const artifacts = artifactsResult.data ?? []

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
