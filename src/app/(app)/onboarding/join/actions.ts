'use server'

import { redirect } from 'next/navigation'
import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function joinCrewAction(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const code = (formData.get('inviteCode') as string).trim().toUpperCase()
  if (code.length !== 6) return { error: 'Enter the full 6-character code.' }

  const { data: crewId, error } = await supabase.rpc('join_crew', {
    p_invite_code: code,
  })

  if (error || !crewId) {
    if (error?.message.includes('Crew not found')) {
      return { error: 'No crew found with that code. Check with your crew leader.' }
    }
    return { error: error?.message ?? 'Unknown error joining crew.' }
  }

  // Fetch the joining user's profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()

  const username = profile?.username ?? 'A warrior'

  // Fetch other crew members (excluding the new joiner)
  const { data: otherMembers } = await supabase
    .from('crew_members')
    .select('user_id')
    .eq('crew_id', crewId)
    .neq('user_id', user.id)
    .limit(5)

  // Fetch crew name
  const { data: crew } = await supabase
    .from('crews')
    .select('name')
    .eq('id', crewId)
    .single()

  let welcomeText: string

  if (!otherMembers || otherMembers.length === 0) {
    welcomeText = `⚔️ ${username} has entered the Nexus. The crew grows stronger.`
  } else {
    const memberIds = otherMembers.map((m) => m.user_id)
    const { data: memberProfiles } = await supabase
      .from('profiles')
      .select('username')
      .in('id', memberIds)
      .limit(3)

    const names = (memberProfiles ?? []).map((p) => p.username)
    const crewName = crew?.name ?? 'the crew'

    if (names.length === 1) {
      welcomeText = `⚔️ ${username} has joined ${crewName}. ${names[0]} is already here.`
    } else {
      const listed = names.slice(0, 2).join(' and ')
      welcomeText = `⚔️ ${username} has joined ${crewName}. ${listed} are already here.`
    }
  }

  // Insert system welcome message
  await supabase.from('messages').insert({
    crew_id:      crewId,
    user_id:      user.id,
    content:      welcomeText,
    message_type: 'system',
    element_type: null,
    xp_awarded:   0,
  })

  revalidatePath('/home')
  revalidateTag(`crew-members:${crewId}`, 'max')
  redirect(`/onboarding/birthday?crew=${crewId}`)
}
