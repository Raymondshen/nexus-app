import { redirect } from 'next/navigation'
import { createClient } from '@/shared/supabase/server'
import { DeveloperUserSettings } from '@/features/profile/screens/DeveloperUserSettings'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_dev, coins')
    .eq('id', session.user.id)
    .single()

  const isDev = (profile as { is_dev?: boolean } | null)?.is_dev === true
  if (!isDev) redirect('/profile')

  return (
    <DeveloperUserSettings
      initialCoins={(profile as { coins?: number } | null)?.coins ?? 0}
    />
  )
}
