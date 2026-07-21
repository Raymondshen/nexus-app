import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Called by the service worker's push handler on every push it actually
// receives, even while the app is fully closed — the one moment a dormant
// PWA still runs code without the user opening it. The SW has no session,
// so (like /api/push/resubscribe) the endpoint itself is the only proof of
// identity: if it matches a row we already track, refresh last_seen_at and
// re-sync the keys in case they've silently drifted. If it doesn't match
// any row, there's no user_id to attach it to — nothing to repair, this
// device just needs to reopen the app once to re-subscribe from scratch.
export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  let body: Record<string, string>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { endpoint, p256dh, auth } = body
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const admin = createClient(supabaseUrl, serviceKey)

  const { data, error } = await admin
    .from('push_subscriptions')
    .update({ p256dh, auth, last_seen_at: new Date().toISOString() })
    .eq('endpoint', endpoint)
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data || data.length === 0) {
    // Endpoint unknown — already cleaned up by a 410, or never saved.
    // Can't identify a user from a bare endpoint; client must re-subscribe
    // on next open.
    return NextResponse.json({ error: 'Unknown subscription' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
