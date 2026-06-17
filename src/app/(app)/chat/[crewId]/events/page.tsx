import { notFound, redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { GroupEventsClient } from './GroupEventsClient'

interface EventsPageProps {
  params: Promise<{ crewId: string }>
}

export default async function GroupEventsPage({ params }: EventsPageProps) {
  const { crewId } = await params
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const service = createServiceClient()

  const [memberResult, devResult] = await Promise.all([
    supabase.from('crew_members').select('user_id').eq('crew_id', crewId).eq('user_id', session.user.id).maybeSingle(),
    service.from('profiles').select('is_dev').eq('id', session.user.id).single(),
  ])

  if (!memberResult.data) redirect('/home')

  const isDev = (devResult.data as { is_dev: boolean } | null)?.is_dev ?? false
  if (!isDev) notFound()

  return (
    <GroupEventsClient
      crewId={crewId}
      currentUserId={session.user.id}
    />
  )
}
