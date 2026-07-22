import { redirect } from 'next/navigation'
import { createClient } from '@/shared/supabase/server'
import { CreateSquadPage } from '@/features/home/screens/CreateSquadPage'

export default async function CreateSquadRoute() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  return <CreateSquadPage />
}
