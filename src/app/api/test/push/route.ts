import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set on server' }, { status: 500 })
    }

    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: subs, error: subsErr } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, created_at')
      .eq('user_id', user.id)

    // Optional: check if a specific endpoint is in the DB (passed by the debug FAB
    // so it can show "current subscription in DB: yes/no").
    const currentEp = request.nextUrl.searchParams.get('ep')
    const hasCurrentEndpoint = currentEp
      ? (subs ?? []).some((s) => String(s.endpoint) === currentEp)
      : null

    return NextResponse.json({
      user_id:    user.id,
      subs_in_db: subs?.length ?? 0,
      has_current_endpoint: hasCurrentEndpoint,
      endpoints:  (subs ?? []).map((s) => ({
        id:               s.id,
        endpoint_preview: String(s.endpoint).slice(0, 60) + '...',
        endpoint_tail:    String(s.endpoint).slice(-20),
        is_apns:          String(s.endpoint).includes('web.push.apple.com'),
        created_at:       s.created_at,
      })),
      vapid_configured: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      subs_error: subsErr?.message ?? null,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST — send a test notification to the calling user
export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) return NextResponse.json({ error: 'NEXT_PUBLIC_SUPABASE_URL not set' }, { status: 500 })
  if (!serviceKey)  return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set on server' }, { status: 500 })

  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: `Auth failed: ${authErr?.message}` }, { status: 401 })

    const fnUrl = `${supabaseUrl}/functions/v1/send-notification`
    let res: Response
    let rawText: string
    try {
      res = await fetch(fnUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
        body: JSON.stringify({
          user_id: user.id,
          type:    'message_received',
          payload: { sender_name: 'Test', content_preview: '🔔 Push is working!', crew_name: 'Dev', crew_id: 'test' },
        }),
      })
      rawText = await res.text()
    } catch (fetchErr) {
      return NextResponse.json({ error: `fetch to send-notification failed: ${String(fetchErr)}` }, { status: 500 })
    }

    let result: unknown = rawText
    try { result = JSON.parse(rawText) } catch { /* keep as raw text */ }

    return NextResponse.json({ fn_status: res.status, fn_ok: res.ok, result })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
