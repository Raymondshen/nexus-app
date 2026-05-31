'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type SignupState = { error: string } | null

export async function signupAction(
  _prevState: SignupState,
  formData: FormData
): Promise<SignupState> {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const username = (formData.get('username') as string).trim()

  if (username.length < 3) {
    return { error: 'Warrior name must be at least 3 characters.' }
  }
  if (username.length > 20) {
    return { error: 'Warrior name must be 20 characters or less.' }
  }

  const { data, error } = await supabase.auth.signUp({ email, password })

  if (error) {
    return { error: error.message }
  }

  if (data.user) {
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({ id: data.user.id, username })

    if (profileError) {
      return { error: profileError.message }
    }
  }

  redirect('/onboarding')
}
