import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type NotificationType = 'boss_spawned' | 'boss_defeated' | 'raid_expiring' | 'crew_silent'

interface NotificationPayload {
  user_id: string
  type:    NotificationType
  payload: Record<string, unknown>
}

function buildPayload(type: NotificationType, data: Record<string, unknown>) {
  switch (type) {
    case 'boss_spawned':
      return {
        title: '⚔ RAID ALERT',
        body:  `${data.boss_name ?? 'A boss'} has appeared! Your crew needs you.`,
        icon:  '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data:  { url: `/chat/${data.crew_id}` },
      }
    case 'boss_defeated':
      return {
        title: '🏆 VICTORY',
        body:  `${data.boss_name ?? 'The boss'} has been defeated! Artifact incoming.`,
        icon:  '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data:  { url: `/vault/${data.crew_id}` },
      }
    case 'raid_expiring':
      return {
        title: '⏳ RAID EXPIRING',
        body:  'The boss escapes in 1 hour. Jump in now!',
        icon:  '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data:  { url: `/chat/${data.crew_id}` },
      }
    case 'crew_silent':
      return {
        title: '💀 THE VOID STIRS',
        body:  'Your crew has gone quiet. Send a message before The Void spawns.',
        icon:  '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data:  { url: `/chat/${data.crew_id}` },
      }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  try {
    const body = await req.json() as NotificationPayload
    const { user_id, type, payload } = body

    if (!user_id || !type) {
      return new Response(
        JSON.stringify({ error: 'user_id and type are required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    const notifPayload = buildPayload(type, payload)

    // TODO: replace with real web push when VAPID keys are wired
    console.log('[send-notification] VAPID pending — would send:', {
      user_id,
      type,
      notifPayload,
    })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Fetch subscriptions for this user so we know where we'd push
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', user_id)

    console.log(`[send-notification] ${subs?.length ?? 0} subscription(s) found for user`)

    return new Response(
      JSON.stringify({ status: 'VAPID pending', type, subscriptions: subs?.length ?? 0 }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[send-notification] error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }
})
