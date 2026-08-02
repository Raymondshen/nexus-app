'use server'

import { redirect } from 'next/navigation'
import { revalidateTag } from 'next/cache'
import { createClient } from '@/shared/supabase/server'
import { validateBirthday, formatBirthday } from '@/shared/utils/birthday'

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

  if (!month || !day || !year) return { error: 'Please fill in all birthday fields.' }

  const birthday = formatBirthday(year, month, day)
  const birthdayError = validateBirthday(birthday)
  if (birthdayError) return { error: birthdayError }

  const { error } = await supabase
    .from('profiles')
    .update({ birthday } as Record<string, unknown>)
    .eq('id', user.id)

  if (error) return { error: error.message }

  revalidateTag(`profile:${user.id}`, 'max')

  if (crewId) {
    redirect(`/onboarding/class?crew=${crewId}${welcome ? '&welcome=1' : ''}`)
  } else {
    redirect('/onboarding/welcome')
  }
}
