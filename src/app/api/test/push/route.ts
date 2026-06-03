import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
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

    return NextResponse.json({
      user_id:       user.id,
      subs_in_db:    subs?.length ?? 0,
      endpoints:     (subs ?? []).map((s) => ({
        id:         s.id,
        // Show enough to identify the push service (apns vs fcm) without leaking full URL
        endpoint_preview: String(s.endpoint).slice(0, 60) + '...',
        is_apns:    String(s.endpoint).includes('web.push.apple.com'),
        created_at: s.created_at,
      })),
      subs_error: subsErr?.message ?? null,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST — send a test notification to the calling user
export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const token = request.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const res = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        user_id: user.id,
        type:    'message_received',
        payload: {
          sender_name:     'Test',
          content_preview: '🔔 Push notifications are working!',
          crew_name:       'Nexus Dev',
          crew_id:         'test',
        },
      }),
    })

    const result = await res.json()
    return NextResponse.json({ ok: res.ok, status: res.status, result })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
