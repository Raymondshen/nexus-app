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

  return <ClassSelectClient crewId={crewId} welcome={welcome === '1'} />
}
