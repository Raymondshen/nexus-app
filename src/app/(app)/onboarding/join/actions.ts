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

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()

  const welcomeText = `JOIN:${profile?.username ?? 'warrior'}`

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
