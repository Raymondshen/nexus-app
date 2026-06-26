import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/shared/supabase/server'
import { AnnouncementsClient } from '@/features/profile/screens/AnnouncementsClient'
import type { Announcement } from '@/types'

export default async function AnnouncementsPage() {
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
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false })

  return <AnnouncementsClient initialAnnouncements={(data ?? []) as Announcement[]} />
}
