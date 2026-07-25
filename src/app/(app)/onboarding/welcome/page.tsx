import { redirect } from 'next/navigation'
import { createClient } from '@/shared/supabase/server'
import WelcomeClient from '@/features/onboarding/screens/WelcomeClient'

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ crew?: string }>
}) {
  const { crew: crewId } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <WelcomeClient crewId={crewId ?? null} />
}
