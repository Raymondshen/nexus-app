import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Called by the service worker's pushsubscriptionchange handler when iOS
// rotates the APNs device token. The SW cannot authenticate via cookies, so
// we use the old endpoint as proof of prior subscription to identify the user.
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

  const { oldEndpoint, newEndpoint, p256dh, auth } = body
  if (!newEndpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const admin = createClient(supabaseUrl, serviceKey)

  // Resolve user_id from the old endpoint — the SW doesn't carry a session,
  // so the old endpoint is the only proof of prior subscription.
  let userId: string | null = null
  if (oldEndpoint) {
    const { data } = await admin
      .from('push_subscriptions')
      .select('user_id')
      .eq('endpoint', oldEndpoint)
      .maybeSingle()
    userId = (data as { user_id: string } | null)?.user_id ?? null
  }

  if (!userId) {
    // Old endpoint unknown (already cleaned up by a 410 or never saved).
    // Can't identify user — client must re-subscribe on next open.
    return NextResponse.json({ error: 'Unknown subscription' }, { status: 404 })
  }

  // Atomic swap: delete old endpoint, insert new one.
  if (oldEndpoint) {
    await admin.from('push_subscriptions').delete().eq('endpoint', oldEndpoint)
  }

  const { error } = await admin
    .from('push_subscriptions')
    .insert({ user_id: userId, endpoint: newEndpoint, p256dh, auth })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
