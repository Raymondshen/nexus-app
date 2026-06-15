'use server'

import { revalidateTag } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function toggleFriendshipXPAction(enabled: boolean): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated' }

  const service = createServiceClient()
  const { data: profile } = await service
    .from('profiles')
    .select('is_dev')
    .eq('id', session.user.id)
    .single()

  if (!(profile as { is_dev?: boolean } | null)?.is_dev) return { error: 'Unauthorized' }

  const { error } = await service
    .from('profiles')
    .update({ friendship_xp_enabled: enabled } as Record<string, unknown>)
    .eq('id', session.user.id)

  if (error) return { error: error.message }

  revalidateTag(`profile:${session.user.id}`, 'max')
  return { ok: true }
}
