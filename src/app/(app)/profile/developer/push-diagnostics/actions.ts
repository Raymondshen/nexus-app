'use server'

import { createClient, createServiceClient } from '@/shared/supabase/server'

// Same requireDev() shape as profile/developer/actions.ts and home/actions.ts —
// duplicated per-file by established convention (see the devmode skill) rather
// than shared, so each action file has no cross-route import dependency.
async function requireDev() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated' as const }
  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('is_dev').eq('id', session.user.id).single()
  if (!(profile as { is_dev?: boolean } | null)?.is_dev) return { error: 'Unauthorized' as const }
  return { service }
}

// "Force resub" for a user other than the caller can't literally drive their
// browser (no server can call pushManager.subscribe() on someone else's
// device) — this deletes their push_subscriptions rows instead, which forces
// a clean re-sync the next time that device's subscribeToPush() runs (app
// mount, or the next push heartbeat if the browser-level subscription is
// still valid — see notifications.ts's INSERT-only/23505-tolerant flow).
export async function forceResubForUserAction(
  targetUserId: string,
): Promise<{ ok?: boolean; deletedCount?: number; error?: string }> {
  const auth = await requireDev()
  if ('error' in auth) return { error: auth.error }
  const { service } = auth

  const { error, count } = await service
    .from('push_subscriptions')
    .delete({ count: 'exact' })
    .eq('user_id', targetUserId)

  if (error) return { error: error.message }
  return { ok: true, deletedCount: count ?? 0 }
}
