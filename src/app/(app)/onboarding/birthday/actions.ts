'use server'

import { redirect } from 'next/navigation'
import { revalidateTag } from 'next/cache'
import { createClient } from '@/shared/supabase/server'

export async function saveBirthdayAction(
  _prevState: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const month   = parseInt(formData.get('month')  as string, 10)
  const day     = parseInt(formData.get('day')    as string, 10)
  const year    = parseInt(formData.get('year')   as string, 10)
  const crewId  = (formData.get('crewId') as string) || null
  const welcome = formData.get('welcome') === '1'
  const invite  = (formData.get('invite') as string) || null

  if (!month || !day || !year) return { error: 'Please fill in all birthday fields.' }

  // Validate the date is real (catches Feb 30, Apr 31, etc.)
  const date = new Date(year, month - 1, day)
  if (
    date.getMonth()    !== month - 1 ||
    date.getDate()     !== day       ||
    date.getFullYear() !== year
  ) {
    return { error: 'That date doesn\'t exist. Please check your birthday.' }
  }
  if (date >= new Date()) return { error: 'Birthday cannot be today or in the future.' }

  const birthday = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  const { error } = await supabase
    .from('profiles')
    .update({ birthday } as Record<string, unknown>)
    .eq('id', user.id)

  if (error) return { error: error.message }

  revalidateTag(`profile:${user.id}`, 'max')

  if (crewId) {
    const inviteParam = invite ? `&invite=${invite}` : ''
    redirect(`/onboarding/class?crew=${crewId}${welcome ? '&welcome=1' : ''}${inviteParam}`)
  } else {
    redirect('/onboarding/welcome')
  }
}
