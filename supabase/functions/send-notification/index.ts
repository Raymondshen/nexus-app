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

type NotificationType = 'boss_spawned' | 'boss_defeated' | 'raid_expiring' | 'crew_silent' | 'message_received' | 'friend_request'

// Maps each notification type to its preference column in notification_preferences.
// null = always deliver (no preference gate).
const PREF_COLUMN: Record<NotificationType, 'notif_messages' | 'notif_raids' | 'notif_victory' | null> = {
  message_received: 'notif_messages',
  boss_spawned:     'notif_raids',
  raid_expiring:    'notif_raids',
  crew_silent:      'notif_raids',
  boss_defeated:    'notif_victory',
  friend_request:   null,
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
    case 'friend_request':
      return {
        title: '⚔ COMPANION REQUEST',
        body:  `${data.requester_name ?? 'Someone'} wants to be your companion.`,
        icon:  '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data:  { url: '/friends' },
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
    const body = await req.json()
    const { user_id, user_ids, type, payload } = body

    // Support single user_id (backward compat from attack-boss, check-raid-expiry)
    // and user_ids array (batch mode from award-xp)
    const targetIds: string[] = Array.isArray(user_ids) && user_ids.length > 0
      ? user_ids
      : user_id
        ? [user_id]
        : []

    if (targetIds.length === 0 || !type) {
      return new Response(
        JSON.stringify({ error: 'user_id or user_ids and type are required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const prefCol = PREF_COLUMN[type as NotificationType]

    // null prefCol = always deliver (e.g. friend_request), skip preference gate entirely
    let enabledIds = targetIds
    if (prefCol !== null) {
      // Batch: fetch preferences for all target users in one query
      const { data: prefsRows } = await supabase
        .from('notification_preferences')
        .select(`user_id, ${prefCol}`)
        .in('user_id', targetIds)

      // Users with a row where the pref is explicitly false are opted out; missing row = opted in
      const prefDisabledSet = new Set(
        // deno-lint-ignore no-explicit-any
        (prefsRows ?? []).filter((r: any) => r[prefCol] === false).map((r: any) => r.user_id as string)
      )
      enabledIds = targetIds.filter(uid => !prefDisabledSet.has(uid))

      if (enabledIds.length === 0) {
        return new Response(
          JSON.stringify({ status: 'all_preferences_disabled', results: [] }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
        )
      }
    }

    // Per-crew preference check — applies when crew_id is in the payload and type has a pref column.
    // Missing row = opted in (all true by default); explicit false = opted out.
    let finalIds = enabledIds
    if (prefCol !== null && payload?.crew_id) {
      const { data: crewPrefRows } = await supabase
        .from('crew_notification_preferences')
        .select(`user_id, ${prefCol}`)
        .in('user_id', enabledIds)
        .eq('crew_id', payload.crew_id as string)
      const crewDisabledSet = new Set(
        // deno-lint-ignore no-explicit-any
        (crewPrefRows ?? []).filter((r: any) => r[prefCol] === false).map((r: any) => r.user_id as string)
      )
      finalIds = enabledIds.filter((uid) => !crewDisabledSet.has(uid))
    }

    if (finalIds.length === 0) {
      return new Response(
        JSON.stringify({ status: 'crew_notifications_muted', results: [] }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    // Batch: fetch all push subscriptions for enabled users in one query
    const { data: allSubs } = await supabase
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth')
      .in('user_id', finalIds)

    // Group subscriptions by user_id
    const subsByUser = new Map<string, { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }[]>()
    for (const sub of allSubs ?? []) {
      const s = sub as { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }
      if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, [])
      subsByUser.get(s.user_id)!.push(s)
    }

    const notifPayload = buildPayload(type as NotificationType, payload ?? {})
    const results: { user_id: string; endpoint: string; status: string }[] = []

    for (const uid of finalIds) {
      const subs = subsByUser.get(uid)
      if (!subs || subs.length === 0) {
        results.push({ user_id: uid, endpoint: '', status: 'no_subscriptions' })
        continue
      }

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
          results.push({ user_id: uid, endpoint: sub.endpoint, status: 'sent' })
        } catch (err: unknown) {
          const code = (err as { statusCode?: number })?.statusCode
          if (code === 410 || code === 404) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id)
            results.push({ user_id: uid, endpoint: sub.endpoint, status: 'expired_deleted' })
          } else {
            console.error('[send-notification] push failed:', err)
            results.push({ user_id: uid, endpoint: sub.endpoint, status: 'error' })
          }
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
