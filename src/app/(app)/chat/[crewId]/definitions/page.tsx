import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DefinitionsClient } from './DefinitionsClient'
import type { SquadDefinition, SquadDefinitionWithCreator } from '@/types'

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

  const defs = (defsResult.data ?? []) as SquadDefinition[]

  // Resolve creator usernames in a single batch query
  const creatorIds = [...new Set([session.user.id, ...defs.map((d) => d.creator_id)])]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', creatorIds)

  const usernameMap = Object.fromEntries((profiles ?? []).map((p) => [p.id as string, p.username as string]))
  const currentUsername = usernameMap[session.user.id] ?? ''

  const enrichedDefs: SquadDefinitionWithCreator[] = defs.map((d) => ({
    ...d,
    creator_username: usernameMap[d.creator_id],
  }))

  return (
    <DefinitionsClient
      crewId={crewId}
      currentUserId={session.user.id}
      currentUsername={currentUsername}
      initialDefinitions={enrichedDefs}
    />
  )
}
