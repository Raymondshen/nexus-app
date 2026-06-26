import { redirect } from 'next/navigation'
import { createClient } from '@/shared/supabase/server'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (session) {
    redirect('/onboarding')
  } else {
    redirect('/login')
  }
}
