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
  return { service, userId: session.user.id }
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

// Dev-only, immediate, irreversible full account wipeout (Figma 740:19299
// "Remove User Completely?"). Reuses process-deletions' existing 7-phase
// cascade (storage files, messages, crew_members, profile row, auth user, …)
// via an { user_id } target that bypasses the 7-day pending_deletions grace
// period entirely — self-service deletion (requestAccountDeletionAction)
// queues that grace period; this is a dev nuking someone else's account right
// now, so there's no reason to wait. Called with the service-role key as the
// bearer token rather than the caller's session, since this is a server→edge
// call the caller never sees (same shape as the /api/cron/process-deletions
// route's own call to this function).
export async function adminDeleteUserAction(
  targetUserId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const auth = await requireDev()
  if ('error' in auth) return { error: auth.error }
  const { userId } = auth
  if (targetUserId === userId) return { error: "You can't remove your own account from here." }

  const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-deletions`
  let res: Response
  try {
    res = await fetch(fnUrl, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ user_id: targetUserId }),
    })
  } catch (err) {
    return { error: `Failed to reach deletion service: ${String(err).slice(0, 120)}` }
  }

  const data = await res.json().catch(() => null) as { processed?: number; errors?: string[]; error?: string } | null
  if (!res.ok) return { error: data?.error ?? `Delete failed (${res.status})` }
  if (data?.errors && data.errors.length > 0) return { error: data.errors[0] }
  if (!data?.processed) return { error: 'User was not found or already removed' }
  return { ok: true }
}
