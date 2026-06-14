import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { ErrorLogsClient } from './ErrorLogsClient'
import type { ClientError } from '@/types'

export default async function ErrorLogsPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const service = createServiceClient()
  const { data: profile } = await service
    .from('profiles')
    .select('is_dev')
    .eq('id', session.user.id)
    .maybeSingle()

  if (!(profile as { is_dev?: boolean } | null)?.is_dev) redirect('/profile')

  const { data } = await service
    .from('client_errors')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  return <ErrorLogsClient initialErrors={(data ?? []) as ClientError[]} />
}
