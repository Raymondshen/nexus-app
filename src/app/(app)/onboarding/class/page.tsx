import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClassSelectClient from './ClassSelectClient'

export default async function ClassSelectPage({
  searchParams,
}: {
  searchParams: Promise<{ crew?: string; welcome?: string }>
}) {
  const { crew: crewId, welcome } = await searchParams
  if (!crewId) redirect('/home')

  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  // Skip selection if this crew already has a class — check crew_members.class (per-crew),
  // not profiles.avatar_class (global). Using the global field caused an infinite redirect
  // loop: chat page guards on crew_members.class, class page skipped on avatar_class,
  // so users with a global class but a new crew would bounce back and forth forever.
  const { data: memberRow } = await supabase
    .from('crew_members')
    .select('class')
    .eq('crew_id', crewId)
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (memberRow?.class) {
    redirect(`/chat/${crewId}${welcome === '1' ? '?welcome=1' : ''}`)
  }

  return <ClassSelectClient crewId={crewId} welcome={welcome === '1'} />
}
