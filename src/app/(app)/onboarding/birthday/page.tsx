import { redirect } from 'next/navigation'
import { createClient } from '@/shared/supabase/server'
import BirthdayClient from '@/features/onboarding/screens/BirthdayClient'

export default async function BirthdayPage({
  searchParams,
}: {
  searchParams: Promise<{ crew?: string; welcome?: string; invite?: string }>
}) {
  const { crew: crewId, welcome, invite } = await searchParams

  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('birthday')
    .eq('id', session.user.id)
    .single()

  const birthday = (profile as Record<string, unknown> | null)?.birthday as string | null | undefined

  if (birthday) {
    if (crewId) {
      const inviteParam = invite ? `&invite=${invite}` : ''
      redirect(`/onboarding/class?crew=${crewId}${welcome === '1' ? '&welcome=1' : ''}${inviteParam}`)
    } else {
      redirect('/onboarding/welcome')
    }
  }

  return <BirthdayClient crewId={crewId ?? null} welcome={welcome === '1'} invite={invite ?? null} />
}
