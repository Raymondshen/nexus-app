import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push'

const VAPID_SUBJECT    = Deno.env.get('VAPID_SUBJECT')
const VAPID_PUBLIC_KEY = Deno.env.get('NEXT_PUBLIC_VAPID_PUBLIC_KEY')
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')

const VAPID_MISSING = !VAPID_SUBJECT || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY

if (!VAPID_MISSING) {
  webpush.setVapidDetails(VAPID_SUBJECT!, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!)
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type NotificationType = 'boss_spawned' | 'boss_defeated' | 'raid_expiring' | 'crew_silent' | 'message_received'

interface NotificationPayload {
  user_id: string
  type:    NotificationType
  payload: Record<string, unknown>
}

// Maps each notification type to its preference column in notification_preferences
const PREF_COLUMN: Record<NotificationType, 'notif_messages' | 'notif_raids' | 'notif_victory'> = {
  message_received: 'notif_messages',
  boss_spawned:     'notif_raids',
  raid_expiring:    'notif_raids',
  crew_silent:      'notif_raids',
  boss_defeated:    'notif_victory',
}

function buildPayload(type: NotificationType, data: Record<string, unknown>) {
  const crewTag = data.crew_name ? ` in ${data.crew_name}` : ''
  switch (type) {
    case 'message_received':
      return {
        title: `${data.sender_name ?? 'Someone'} from ${data.crew_name ?? 'your crew'}`,
        body:  String(data.content_preview || 'sent'),
        icon:  '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data:  { url: `/chat/${data.crew_id}` },
      }
    case 'boss_spawned':
      return {
        title: '⚔ RAID ALERT',
        body:  `${data.boss_name ?? 'A boss'} has appeared${crewTag}! Your crew needs you.`,
        icon:  '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data:  { url: `/chat/${data.crew_id}` },
      }
    case 'boss_defeated':
      return {
        title: '🏆 VICTORY',
        body:  `${data.boss_name ?? 'The boss'} defeated${crewTag}! Claim your artifact.`,
        icon:  '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data:  { url: `/vault/${data.crew_id}` },
      }
    case 'raid_expiring':
      return {
        title: '⏳ RAID EXPIRING',
        body:  `The boss escapes${crewTag} in 2 hours. Jump in now!`,
        icon:  '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data:  { url: `/chat/${data.crew_id}` },
      }
    case 'crew_silent':
      return {
        title: '💀 THE VOID STIRS',
        body:  `Your crew${crewTag ? ` (${data.crew_name})` : ''} has gone quiet. Send a message before The Void spawns.`,
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

  if (VAPID_MISSING) {
    const missing = [
      !VAPID_SUBJECT     && 'VAPID_SUBJECT',
      !VAPID_PUBLIC_KEY  && 'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
      !VAPID_PRIVATE_KEY && 'VAPID_PRIVATE_KEY',
    ].filter(Boolean).join(', ')
    return new Response(
      JSON.stringify({ error: `VAPID env vars not set: ${missing}` }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Check user's notification preferences — if the preference row exists and
    // the relevant column is false, skip sending entirely.
    const prefCol = PREF_COLUMN[type]
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select(prefCol)
      .eq('user_id', user_id)
      .maybeSingle()

    if (prefs && prefs[prefCol] === false) {
      return new Response(
        JSON.stringify({ status: 'preference_disabled' }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', user_id)

    if (!subs || subs.length === 0) {
      return new Response(
        JSON.stringify({ status: 'no_subscriptions' }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    const notifPayload = buildPayload(type, payload)
    const results: { endpoint: string; status: string }[] = []

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(notifPayload),
          {
            TTL:     86400, // 1 day — keeps the message queued if the device is offline
            urgency: 'high', // maps to apns-priority:10 — deliver immediately on iOS
          },
        )
        results.push({ endpoint: sub.endpoint, status: 'sent' })
      } catch (err: unknown) {
        const code = (err as { statusCode?: number })?.statusCode
        if (code === 410 || code === 404) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
          results.push({ endpoint: sub.endpoint, status: 'expired_deleted' })
        } else {
          console.error('[send-notification] push failed:', err)
          results.push({ endpoint: sub.endpoint, status: 'error' })
        }
      }
    }

    return new Response(
      JSON.stringify({ type, results }),
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
