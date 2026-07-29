// Server-only — never import into a client component (reads SUPABASE_SERVICE_ROLE_KEY).
// Every push notification in the app funnels through the send-notification edge
// function; this is the one place Next.js server code (server actions, route
// handlers) builds that request, so the URL/auth-header/envelope shape lives in
// exactly one spot instead of being hand-rolled at each call site. The Deno edge
// runtime (supabase/functions/award-xp/index.ts) can't import this module — it
// builds its own single batched request the same way, see that file's own comment.

export type PushNotificationType = 'message_received' | 'mention_received' | 'reply_received' | 'friend_request' | 'health_check'

export type PushNotificationRequest = {
  user_id?:  string
  user_ids?: string[]
  type:      PushNotificationType
  payload?:  Record<string, unknown>
}

/**
 * Fires one or more push notifications through send-notification in a single
 * request. Returns the raw Response so callers that need to inspect delivery
 * (the push-health canary, the test-push debug route) can, but the network
 * call itself is never the caller's problem to build — a delivery failure
 * must never fail the action that triggered it, so most callers should wrap
 * this in try/catch and ignore the result (see friends/actions.ts).
 *
 * Returns null if VAPID/Supabase env vars aren't configured or notifications
 * is empty — callers that don't care can just `.catch(() => {})` without
 * checking for null.
 */
export async function sendPushNotification(notifications: PushNotificationRequest[]): Promise<Response | null> {
  if (notifications.length === 0) return null

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return null

  return fetch(`${supabaseUrl}/functions/v1/send-notification`, {
    method: 'POST',
    // send-notification is meant to be deployed with --no-verify-jwt (only ever
    // called server-side), but that's deploy-time gateway config, not something
    // this code controls — a future redeploy without that flag would silently
    // 401 this call before send-notification's own code runs. The service-role
    // key is a valid signed JWT, so it passes the gateway check regardless of
    // the flag's state.
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
    body: JSON.stringify({ notifications }),
  })
}
