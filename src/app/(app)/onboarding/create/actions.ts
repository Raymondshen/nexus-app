'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export async function createCrewAction(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const raw  = (formData.get('crewName') as string).trim().replace(/<[^>]*>/g, '')
  const name = raw.slice(0, 30)
  if (name.length < 2)  return { error: 'Crew name must be at least 2 characters.' }
  if (name.length > 30) return { error: 'Crew name must be 30 characters or less.' }

  // Retry up to 3 times on invite code collision
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: crewId, error } = await supabase.rpc('create_crew', {
      p_name:        name,
      p_invite_code: generateInviteCode(),
    })

    if (!error && crewId) {
      redirect(`/chat/${crewId}?welcome=1`)
    }

    if (error && !error.message.includes('unique')) {
      return { error: error.message }
    }
  }

  return { error: 'Could not generate a unique invite code. Try again.' }
}
