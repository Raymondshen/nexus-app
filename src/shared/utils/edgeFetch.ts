import { createClient } from '@/shared/supabase/client'
import { SUPABASE_URL } from '@/shared/constants/config'

const EDGE_FETCH_TIMEOUT_MS = 12_000

// Authenticated, timeout-guarded POST to a Supabase edge function.
//
// Sends the user's session access token — required since award-xp /
// attack-boss / award-friendship-xp verify the caller's identity server-side
// (the anon key passes verify_jwt but carries no user, so it is rejected).
// Returns null when there's no session (caller should treat as a no-op).
//
// Deliberately NO retry: award-xp and attack-boss are not idempotent — a retry
// after a lost response could double-award XP or double-spend ability charges.
// The AbortController only prevents a hung request on a bad connection from
// dangling forever.
export async function postEdgeFn(path: string, body: unknown): Promise<Response | null> {
  const { data: { session } } = await createClient().auth.getSession()
  const token = session?.access_token
  if (!token) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), EDGE_FETCH_TIMEOUT_MS)
  try {
    return await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}
