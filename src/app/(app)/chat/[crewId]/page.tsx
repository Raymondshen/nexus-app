import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ChatHeader } from '@/components/chat/ChatHeader'
import { MessageList } from '@/components/chat/MessageList'
import { ChatInput } from '@/components/chat/ChatInput'
import type { MessageWithProfile, Profile } from '@/types'

interface ChatPageProps {
  params: Promise<{ crewId: string }>
}

export default async function ChatPage({ params }: ChatPageProps) {
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
    .maybeSingle()

  if (!membership) redirect('/onboarding')

  // Fetch crew
  const { data: crew } = await supabase
    .from('crews')
    .select('*')
    .eq('id', crewId)
    .single()

  if (!crew) redirect('/onboarding')

  // Fetch all crew member profiles
  const { data: memberRows } = await supabase
    .from('crew_members')
    .select('user_id')
    .eq('crew_id', crewId)

  const memberUserIds = (memberRows ?? []).map((r) => r.user_id)

  const { data: profileRows } = await supabase
    .from('profiles')
    .select('id, username, avatar_class')
    .in('id', memberUserIds)

  const profiles = profileRows ?? []

  const memberProfiles: Record<string, Pick<Profile, 'id' | 'username' | 'avatar_class'>> =
    Object.fromEntries(profiles.map((p) => [p.id, p]))

  // Fetch last 50 messages with profile info
  const { data: messageRows } = await supabase
    .from('messages')
    .select('*')
    .eq('crew_id', crewId)
    .order('created_at', { ascending: true })
    .limit(50)

  const initialMessages: MessageWithProfile[] = (messageRows ?? []).map((m) => ({
    ...m,
    profile: memberProfiles[m.user_id] ?? { id: m.user_id, username: '???', avatar_class: null },
  }))

  // Fetch active raid
  const { data: raidRow } = await supabase
    .from('active_raids')
    .select('*')
    .eq('crew_id', crewId)
    .is('defeated_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  return (
    <div
      className="flex flex-col h-[100dvh] bg-[#0a0612]"
      style={{ maxWidth: 480, margin: '0 auto' }}
    >
      <ChatHeader
        crew={crew}
        members={profiles}
        initialXP={crew.total_xp}
        initialRaid={raidRow ?? null}
      />

      <MessageList
        crewId={crewId}
        currentUserId={user.id}
        initialMessages={initialMessages}
        memberProfiles={memberProfiles}
        initialRaid={raidRow ?? null}
      />

      <ChatInput
        crewId={crewId}
        userId={user.id}
        userProfile={memberProfiles[user.id] ?? { id: user.id, username: '???', avatar_class: null }}
      />
    </div>
  )
}
