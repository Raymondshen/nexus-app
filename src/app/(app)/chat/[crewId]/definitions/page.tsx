import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DefinitionsClient } from './DefinitionsClient'
import type { SquadDefinition } from '@/types'

interface DefinitionsPageProps {
  params: Promise<{ crewId: string }>
}

export default async function DefinitionsPage({ params }: DefinitionsPageProps) {
  const { crewId } = await params
  const supabase   = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const [memberResult, defsResult] = await Promise.all([
    supabase
      .from('crew_members')
      .select('user_id')
      .eq('crew_id', crewId)
      .eq('user_id', session.user.id)
      .maybeSingle(),
    supabase
      .from('squad_definitions')
      .select('*')
      .eq('crew_id', crewId)
      .order('created_at', { ascending: false }),
  ])

  if (!memberResult.data) redirect('/home')

  return (
    <DefinitionsClient
      crewId={crewId}
      currentUserId={session.user.id}
      initialDefinitions={(defsResult.data ?? []) as SquadDefinition[]}
    />
  )
}
