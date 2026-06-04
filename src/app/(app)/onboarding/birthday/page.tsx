import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BirthdayClient from './BirthdayClient'

export default async function BirthdayPage({
  searchParams,
}: {
  searchParams: Promise<{ crew?: string; welcome?: string }>
}) {
  const { crew: crewId, welcome } = await searchParams

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
      redirect(`/onboarding/class?crew=${crewId}${welcome === '1' ? '&welcome=1' : ''}`)
    } else {
      redirect('/home')
    }
  }

  return <BirthdayClient crewId={crewId ?? null} welcome={welcome === '1'} />
}
