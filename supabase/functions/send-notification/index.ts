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

type NotificationType = 'message_received' | 'mention_received' | 'friend_request' | 'recruit_arrived'

// Maps each notification type to its preference column in notification_preferences.
// null = always deliver (no preference gate).
const PREF_COLUMN: Record<NotificationType, 'notif_messages' | 'notif_mentions' | null> = {
  message_received: 'notif_messages',
  mention_received: 'notif_mentions',
  friend_request:   null,
  recruit_arrived:  null,
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
    case 'mention_received':
      return {
        title: `${data.sender_name ?? 'Someone'} mentioned you in ${data.crew_name ?? 'your crew'}`,
        body:  String(data.content_preview || 'sent'),
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
    case 'recruit_arrived':
      return {
        title: 'Your recruit arrived.',
        body:  `${data.new_username ?? 'Someone'} just entered the Nexus.`,
        icon:  '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data:  { url: '/home' },
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

    // Support single user_id and user_ids array (batch mode from award-xp)
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

    // Fetch global prefs, crew prefs, and subscriptions all in parallel.
    // Fetching subscriptions upfront avoids a serial round-trip after filtering.
    const [globalPrefsResult, crewPrefsResult, subsResult] = await Promise.all([
      prefCol !== null
        ? supabase
            .from('notification_preferences')
            .select(`user_id, ${prefCol}`)
            .in('user_id', targetIds)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),

      prefCol !== null && payload?.crew_id
        ? supabase
            .from('crew_notification_preferences')
            .select(`user_id, ${prefCol}`)
            .in('user_id', targetIds)
            .eq('crew_id', payload.crew_id as string)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),

      supabase
        .from('push_subscriptions')
        .select('id, user_id, endpoint, p256dh, auth')
        .in('user_id', targetIds),
    ])

    // Apply global preference filter
    let finalIds = targetIds
    if (prefCol !== null) {
      const prefDisabledSet = new Set(
        // deno-lint-ignore no-explicit-any
        (globalPrefsResult.data ?? []).filter((r: any) => r[prefCol] === false).map((r: any) => r.user_id as string)
      )
      finalIds = targetIds.filter(uid => !prefDisabledSet.has(uid))

      if (finalIds.length === 0) {
        return new Response(
          JSON.stringify({ status: 'all_preferences_disabled', results: [] }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
        )
      }

      // Apply per-crew preference filter
      if (payload?.crew_id) {
        const crewDisabledSet = new Set(
          // deno-lint-ignore no-explicit-any
          (crewPrefsResult.data ?? []).filter((r: any) => r[prefCol] === false).map((r: any) => r.user_id as string)
        )
        finalIds = finalIds.filter(uid => !crewDisabledSet.has(uid))
      }
    }

    if (finalIds.length === 0) {
      return new Response(
        JSON.stringify({ status: 'crew_notifications_muted', results: [] }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    // Group pre-fetched subscriptions by user_id, filtered to finalIds
    const finalIdSet = new Set(finalIds)
    const subsByUser = new Map<string, { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }[]>()
    for (const sub of subsResult.data ?? []) {
      const s = sub as { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }
      if (!finalIdSet.has(s.user_id)) continue
      if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, [])
      subsByUser.get(s.user_id)!.push(s)
    }

    const notifPayload = buildPayload(type as NotificationType, payload ?? {})
    const results: { user_id: string; endpoint: string; status: string }[] = []
    const staleSubIds: string[] = []

    // Fire all webpush calls in parallel — critical for multi-member chats where
    // sequential sends would compound latency (each APNs call ~100-200ms).
    const sendPromises: Promise<void>[] = []

    for (const uid of finalIds) {
      const subs = subsByUser.get(uid)
      if (!subs || subs.length === 0) {
        results.push({ user_id: uid, endpoint: '', status: 'no_subscriptions' })
        continue
      }

      for (const sub of subs) {
        sendPromises.push(
          webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(notifPayload),
            {
              TTL:     86400, // 1 day — keeps the message queued if the device is offline
              urgency: 'high', // maps to apns-priority:10 — deliver immediately on iOS
            },
          ).then(() => {
            results.push({ user_id: uid, endpoint: sub.endpoint, status: 'sent' })
          }).catch((err: unknown) => {
            const code = (err as { statusCode?: number })?.statusCode
            if (code === 410 || code === 404) {
              staleSubIds.push(sub.id)
              results.push({ user_id: uid, endpoint: sub.endpoint, status: 'expired_deleted' })
            } else {
              console.error('[send-notification] push failed:', err)
              results.push({ user_id: uid, endpoint: sub.endpoint, status: 'error' })
            }
          })
        )
      }
    }

    await Promise.all(sendPromises)

    // Batch-delete stale subscriptions (410/404 from APNs)
    if (staleSubIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', staleSubIds)
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
