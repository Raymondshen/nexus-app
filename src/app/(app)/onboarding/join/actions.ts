'use server'

import { redirect } from 'next/navigation'
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
  } as never)

  if (error) {
    if (error.message.includes('Crew not found')) {
      return { error: 'No crew found with that code. Check with your crew leader.' }
    }
    return { error: error.message }
  }

  redirect(`/chat/${crewId}`)
}
