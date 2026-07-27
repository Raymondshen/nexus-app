import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Daily canary that push delivery still actually works end to end — catches the
// exact silent-breakage shape documented in CLAUDE.md's Edge Functions section
// (a function can be fully correct in the repo and still be undeployed or
// misconfigured live, e.g. send-notification redeployed without --no-verify-jwt,
// which 401s the gateway before send-notification's own code ever runs). Without
// this, the first signal is a user reporting they stopped getting notified.
//
// Targets is_dev accounts' own subscriptions as the canary — a real device gets a
// visible confirmation push too, not just a status JSON blob nobody looks at. If no
// dev account has ever enabled push (PushDebugFAB → SUBSCRIBE), this check has
// nothing to canary against and fails loudly with 'no_canary_subscription' rather
// than silently reporting success — that failure itself is the signal to go
// subscribe a dev device.
export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ status: 'server_misconfigured' }, { status: 500 })
  }

  const admin = createClient(supabaseUrl, serviceKey)

  const { data: devs, error: devErr } = await admin
    .from('profiles')
    .select('id')
    .eq('is_dev', true)

  if (devErr) {
    return NextResponse.json({ status: 'error', error: devErr.message }, { status: 500 })
  }

  const devIds = (devs ?? []).map((d: { id: string }) => d.id)
  if (devIds.length === 0) {
    return NextResponse.json({ status: 'no_dev_accounts' }, { status: 500 })
  }

  let sendRes: Response
  try {
    sendRes = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
      method:  'POST',
      // Same defensive Bearer-token pattern as every other send-notification caller
      // (see friends/actions.ts, award-xp) — the service-role key is a valid signed
      // JWT, so this succeeds regardless of the function's --no-verify-jwt deploy
      // flag. A 401 here specifically means that flag drifted on a redeploy.
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
      body: JSON.stringify({
        user_ids: devIds,
        type:     'health_check',
        payload:  { checked_at: new Date().toISOString() },
      }),
    })
  } catch (err) {
    return NextResponse.json({ status: 'unreachable', error: String(err) }, { status: 500 })
  }

  let body: { results?: { user_id: string; status: string }[]; error?: string; status?: string }
  try {
    body = await sendRes.json()
  } catch {
    return NextResponse.json({ status: 'bad_response', http_status: sendRes.status }, { status: 500 })
  }

  if (!sendRes.ok) {
    return NextResponse.json({ status: 'http_error', http_status: sendRes.status, body }, { status: 500 })
  }

  const results   = body.results ?? []
  const sentCount = results.filter((r) => r.status === 'sent').length

  if (sentCount === 0) {
    return NextResponse.json({ status: 'delivery_failed', dev_count: devIds.length, results }, { status: 500 })
  }

  return NextResponse.json({ status: 'ok', sent: sentCount, dev_count: devIds.length, results })
}
