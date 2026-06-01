import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { VaultClient } from '@/components/game/VaultClient'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import type { Artifact, Crew, CrewMember } from '@/types'

interface VaultPageProps {
  params: Promise<{ crewId: string }>
}

export default async function VaultPage({ params }: VaultPageProps) {
  const { crewId } = await params
  const supabase   = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verify membership
  const { data: membership } = await supabase
    .from('crew_members')
    .select('id')
    .eq('crew_id', crewId)
    .eq('user_id', user.id)
    .maybeSingle() as { data: Pick<CrewMember, 'id'> | null }

  if (!membership) redirect('/onboarding')

  // Fetch crew
  const { data: crew } = await supabase
    .from('crews')
    .select('*')
    .eq('id', crewId)
    .single() as { data: Crew | null }

  if (!crew) redirect('/onboarding')

  // Fetch all artifacts for this crew, newest first
  const { data: artifacts } = await supabase
    .from('artifacts')
    .select('*')
    .eq('crew_id', crewId)
    .order('earned_at', { ascending: false }) as { data: Artifact[] | null }

  return (
    <ErrorBoundary>
      <VaultClient
        crewId={crewId}
        crewName={crew.name}
        crewCreatedAt={crew.created_at}
        artifacts={artifacts ?? []}
      />
    </ErrorBoundary>
  )
}
