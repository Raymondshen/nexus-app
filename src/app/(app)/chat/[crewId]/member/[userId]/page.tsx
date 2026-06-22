import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SlidePage } from '@/components/ui/SlidePage'
import { AccountPageMember } from './AccountPageMember'
import type { PublicNote, BoardSection } from '@/types'

interface Props {
  params: Promise<{ crewId: string; userId: string }>
}

export default async function MemberProfilePage({ params }: Props) {
  const supabase = await createClient()

  const [{ data: { session } }, { crewId, userId }] = await Promise.all([
    supabase.auth.getSession(),
    params,
  ])
  if (!session) redirect('/login')
  const viewerId = session.user.id

  const [
    viewerMembership,
    profileResult,
    targetMembership,
    crewResult,
    notesResult,
    sectionsResult,
  ] = await Promise.all([
    supabase
      .from('crew_members')
      .select('user_id')
      .eq('crew_id', crewId)
      .eq('user_id', viewerId)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single(),
    supabase
      .from('crew_members')
      .select('user_id')
      .eq('crew_id', crewId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.from('crews').select('name').eq('id', crewId).single(),
    supabase
      .from('notes')
      .select('id, crew_id, created_by, url, og_title, og_image_url, source_domain, section_id, created_at')
      .eq('crew_id', crewId)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('board_sections')
      .select('id, crew_id, created_by, name, position, created_at')
      .eq('crew_id', crewId)
      .order('position')
      .order('created_at'),
  ])

  if (!viewerMembership.data) redirect('/home')
  if (!targetMembership.data || !profileResult.data) redirect(`/chat/${crewId}`)

  const username  = (profileResult.data as { username: string }).username
  const crewName  = (crewResult.data as { name?: string } | null)?.name ?? ''
  const notesCrews = [{ id: crewId, name: crewName }]

  return (
    <SlidePage
      className="flex flex-col bg-black"
      style={{
        position:    'fixed',
        top:         0,
        bottom:      0,
        left:        0,
        right:       0,
        maxWidth:    480,
        marginLeft:  'auto',
        marginRight: 'auto',
        overflow:    'hidden',
      }}
    >
      <AccountPageMember
        crewId={crewId}
        userId={userId}
        viewerId={viewerId}
        username={username}
        initialNotes={(notesResult.data ?? []) as unknown as PublicNote[]}
        initialSections={(sectionsResult.data ?? []) as unknown as BoardSection[]}
        notesCrews={notesCrews}
      />
    </SlidePage>
  )
}
