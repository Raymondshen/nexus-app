import { redirect } from 'next/navigation'
import { createClient } from '@/shared/supabase/server'
import { JoinGroupPage } from '@/features/home/screens/JoinGroupPage'

export default async function JoinGroupRoute() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  return <JoinGroupPage />
}
