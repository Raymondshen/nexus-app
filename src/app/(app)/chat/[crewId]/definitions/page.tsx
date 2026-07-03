import { redirect } from 'next/navigation'
import { createClient } from '@/shared/supabase/server'
import { DefinitionHomePage } from '@/features/chat/screens/DefinitionHomePage'
import type { SquadDefinition, SquadDefinitionWithCreator } from '@/types'

interface DefinitionsPageProps {
  params: Promise<{ crewId: string }>
}

export default async function DefinitionsPage({ params }: DefinitionsPageProps) {
  const { crewId } = await params
  const supabase   = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  // Round 1: member guard + definitions + current user profile run in parallel.
  // Fetching currentProfile here avoids including it in the creator batch below.
  const [memberResult, defsResult, currentProfileResult] = await Promise.all([
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
    supabase
      .from('profiles')
      .select('id, username')
      .eq('id', session.user.id)
      .single(),
  ])

  if (!memberResult.data) redirect('/home')

  const defs = (defsResult.data ?? []) as SquadDefinition[]
  const currentUsername = (currentProfileResult.data as { id: string; username: string } | null)?.username ?? ''

  const defIds     = defs.map((d) => d.id)
  // Exclude current user — already fetched above.
  const otherCreatorIds = [...new Set(defs.map((d) => d.creator_id).filter((id) => id !== session.user.id))]

  // Round 2: creator usernames (other users) + suggestion counts in parallel.
  const [otherProfilesResult, suggestionsResult] = await Promise.all([
    otherCreatorIds.length > 0
      ? supabase.from('profiles').select('id, username').in('id', otherCreatorIds)
      : Promise.resolve({ data: [] as { id: string; username: string }[] }),
    defIds.length > 0
      ? supabase.from('definition_suggestions').select('definition_id').in('definition_id', defIds)
      : Promise.resolve({ data: [] as { definition_id: string }[] }),
  ])

  const usernameMap: Record<string, string> = { [session.user.id]: currentUsername }
  for (const p of (otherProfilesResult.data ?? [])) {
    usernameMap[p.id as string] = p.username as string
  }

  const countMap: Record<string, number> = {}
  for (const row of (suggestionsResult.data ?? [])) {
    const id = row.definition_id as string
    countMap[id] = (countMap[id] ?? 0) + 1
  }

  const enrichedDefs: SquadDefinitionWithCreator[] = defs.map((d) => ({
    ...d,
    creator_username: usernameMap[d.creator_id],
    suggestion_count: countMap[d.id] ?? 0,
  }))

  return (
    <DefinitionHomePage
      crewId={crewId}
      currentUserId={session.user.id}
      currentUsername={currentUsername}
      initialDefinitions={enrichedDefs}
    />
  )
}
