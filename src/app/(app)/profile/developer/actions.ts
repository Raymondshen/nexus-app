'use server'

import { revalidateTag } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function requireDev() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated' as const }
  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('is_dev').eq('id', session.user.id).single()
  if (!(profile as { is_dev?: boolean } | null)?.is_dev) return { error: 'Unauthorized' as const }
  return { session, service }
}

export async function toggleFriendshipXPAction(enabled: boolean): Promise<{ ok?: boolean; error?: string }> {
  const auth = await requireDev()
  if ('error' in auth) return { error: auth.error }
  const { session, service } = auth

  const { error } = await service
    .from('profiles')
    .update({ friendship_xp_enabled: enabled } as Record<string, unknown>)
    .eq('id', session.user.id)

  if (error) return { error: error.message }
  revalidateTag(`profile:${session.user.id}`, 'max')
  return { ok: true }
}

export async function resetFriendshipXPAction(): Promise<{ ok?: boolean; error?: string }> {
  const auth = await requireDev()
  if ('error' in auth) return { error: auth.error }
  const { session, service } = auth

  const userId = session.user.id
  const { error } = await service
    .from('friendship_xp')
    .delete()
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)

  if (error) return { error: error.message }
  return { ok: true }
}
