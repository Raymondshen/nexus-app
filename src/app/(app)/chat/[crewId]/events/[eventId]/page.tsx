import { notFound, redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { EventPageInfoClient } from './EventPageInfoClient'
import type { Event } from '@/types'

interface EventPageInfoPageProps {
  params: Promise<{ crewId: string; eventId: string }>
}

type GoingProfile = { id: string; username: string; avatar_url: string | null }

export default async function EventPageInfoPage({ params }: EventPageInfoPageProps) {
  const { crewId, eventId } = await params
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const service = createServiceClient()

  const [memberResult, eventResult] = await Promise.all([
    supabase
      .from('crew_members')
      .select('user_id')
      .eq('crew_id', crewId)
      .eq('user_id', session.user.id)
      .maybeSingle(),
    service
      .from('events')
      .select('*')
      .eq('id', eventId)
      .eq('crew_id', crewId)
      .single(),
  ])

  if (!memberResult.data) redirect('/home')
  if (!eventResult.data) notFound()

  const event = eventResult.data as unknown as Event

  const [creatorResult, rsvpsResult, myRsvpResult] = await Promise.all([
    service
      .from('profiles')
      .select('username')
      .eq('id', event.created_by)
      .single(),
    service
      .from('event_rsvps')
      .select('user_id')
      .eq('event_id', eventId)
      .eq('status', 'going'),
    supabase
      .from('event_rsvps')
      .select('status')
      .eq('event_id', eventId)
      .eq('user_id', session.user.id)
      .maybeSingle(),
  ])

  const creatorUsername = (creatorResult.data as { username: string } | null)?.username ?? null
  const goingUserIds    = ((rsvpsResult.data ?? []) as { user_id: string }[]).map((r) => r.user_id)

  let goingProfiles: GoingProfile[] = []
  if (goingUserIds.length > 0) {
    const { data: profilesData } = await service
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', goingUserIds)
    goingProfiles = (profilesData ?? []) as GoingProfile[]
  }

  const initialIsGoing = (myRsvpResult.data as { status: string } | null)?.status === 'going'
  const isCreator      = event.created_by === session.user.id

  return (
    <EventPageInfoClient
      crewId={crewId}
      currentUserId={session.user.id}
      event={{ ...event, creatorUsername, goingProfiles }}
      initialIsGoing={initialIsGoing}
      isCreator={isCreator}
    />
  )
}
