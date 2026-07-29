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

type NotificationType = 'message_received' | 'mention_received' | 'reply_received' | 'friend_request' | 'health_check'

// Maps each notification type to its mute column in crew_notification_preferences —
// the sole mute mechanism (see NotifSheet.tsx / ChatInput.tsx). notification_preferences
// (the old *global* kill switch) is deliberately no longer read here: NotifSheet dropped
// its global-mute toggle when muting became per-crew-only, so that table had no client
// write path left and could only ever hold stale pre-redesign values — a user who'd
// muted it before the redesign was stuck permanently unreachable with no UI to undo it.
// Migration 20260729120000_reset_global_notification_prefs.sql reset those rows to true.
// null = always deliver (no preference gate).
const PREF_COLUMN: Record<NotificationType, 'notif_messages' | 'notif_mentions' | 'notif_replies' | null> = {
  message_received: 'notif_messages',
  mention_received: 'notif_mentions',
  reply_received:   'notif_replies',
  friend_request:   null,
  // Ops canary only — see /api/cron/push-health. Never user-facing, so it's
  // always-deliver by design, not a preference gap to fill in later.
  health_check:     null,
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
        // crew_id (not just baked into url) lets the SW match against the client's
        // currently-active crew directly — /dm/[friendId] routes don't expose crew_id
        // in their URL, so URL-string matching alone can't detect an open DM.
        data:  { url: `/chat/${data.crew_id}`, crew_id: data.crew_id },
      }
    case 'mention_received':
      return {
        title: `${data.sender_name ?? 'Someone'} mentioned you in ${data.crew_name ?? 'your crew'}`,
        body:  String(data.content_preview || 'sent'),
        icon:  '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data:  { url: `/chat/${data.crew_id}`, crew_id: data.crew_id },
      }
    case 'reply_received':
      return {
        title: `${data.sender_name ?? 'Someone'} replied to your message${crewTag}`,
        body:  String(data.content_preview || 'sent'),
        icon:  '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data:  { url: `/chat/${data.crew_id}`, crew_id: data.crew_id },
      }
    case 'friend_request':
      return {
        title: '⚔ COMPANION REQUEST',
        body:  `${data.requester_name ?? 'Someone'} wants to be your companion.`,
        icon:  '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data:  { url: '/friends' },
      }
    case 'health_check':
      // Deliberately distinct copy so a dev seeing it on their own phone never
      // mistakes it for a real message or bug report — see /api/cron/push-health.
      return {
        title: '🩺 Nexus Push Health Check',
        body:  `Daily push pipeline check — ${String(data.checked_at || new Date().toISOString()).slice(0, 10)}`,
        icon:  '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data:  { url: '/profile' },
      }
  }
}

// One request can carry several notifications at once (e.g. a single chat message
// fans out to a reply target + mentioned users + everyone else, each needing its own
// title/type). Batching them into one request — rather than one HTTP call per group —
// is what keeps this the single delivery pipe in practice, not just in name: every
// caller (award-xp, friend requests, the health-check canary) sends exactly one
// request here per triggering event, and this function does exactly one subscriptions
// query + one crew-prefs query total, no matter how many groups are inside it.
type RawNotification = {
  user_id?:  string
  user_ids?: string[]
  type:      NotificationType
  payload?:  Record<string, unknown>
}

type NotificationGroup = {
  type:      NotificationType
  payload:   Record<string, unknown>
  targetIds: string[]
}

function resolveGroups(body: unknown): NotificationGroup[] {
  const raw = (body as { notifications?: unknown } | null)?.notifications
  const list: RawNotification[] = Array.isArray(raw) ? raw : []
  return list
    .map((g) => ({
      type:      g.type,
      payload:   g.payload ?? {},
      targetIds: Array.isArray(g.user_ids) && g.user_ids.length > 0
        ? g.user_ids
        : g.user_id
          ? [g.user_id]
          : [],
    }))
    .filter((g) => !!g.type && g.targetIds.length > 0)
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
    const body   = await req.json()
    const groups = resolveGroups(body)

    if (groups.length === 0) {
      return new Response(
        JSON.stringify({ error: 'notifications: [{ type, user_id|user_ids }] with at least one entry is required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const allUserIds = [...new Set(groups.flatMap((g) => g.targetIds))]

    // Crew-scoped groups (a mute-able type with a crew_id) share one preference
    // fetch — a single chat message's reply/mention/message groups all target the
    // same crew, so this is typically one query covering every notif_* column at
    // once instead of one query per group per type.
    const crewIds = [...new Set(
      groups
        .filter((g) => PREF_COLUMN[g.type] !== null && g.payload.crew_id)
        .map((g) => g.payload.crew_id as string)
    )]

    const [crewPrefsResult, subsResult] = await Promise.all([
      crewIds.length > 0
        ? supabase
            .from('crew_notification_preferences')
            .select('user_id, crew_id, notif_messages, notif_mentions, notif_replies')
            .in('user_id', allUserIds)
            .in('crew_id', crewIds)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),

      supabase
        .from('push_subscriptions')
        .select('id, user_id, endpoint, p256dh, auth')
        .in('user_id', allUserIds),
    ])

    const prefsByKey = new Map<string, Record<string, unknown>>()
    for (const r of crewPrefsResult.data ?? []) {
      prefsByKey.set(`${r.crew_id}:${r.user_id}`, r)
    }

    const subsByUser = new Map<string, { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }[]>()
    for (const sub of subsResult.data ?? []) {
      const s = sub as { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }
      if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, [])
      subsByUser.get(s.user_id)!.push(s)
    }

    const results: { user_id?: string; type: NotificationType; endpoint?: string; status: string }[] = []
    const staleSubIds: string[] = []
    const sendPromises: Promise<void>[] = []

    for (const group of groups) {
      const prefCol = PREF_COLUMN[group.type]

      // Apply per-crew preference filter (the sole mute mechanism)
      let finalIds = group.targetIds
      if (prefCol !== null && group.payload.crew_id) {
        const crewId = group.payload.crew_id as string
        finalIds = finalIds.filter((uid) => prefsByKey.get(`${crewId}:${uid}`)?.[prefCol] !== false)
      }

      if (finalIds.length === 0) {
        results.push({ type: group.type, status: 'crew_notifications_muted' })
        continue
      }

      const notifPayload = buildPayload(group.type, group.payload)

      for (const uid of finalIds) {
        const subs = subsByUser.get(uid)
        if (!subs || subs.length === 0) {
          results.push({ user_id: uid, type: group.type, status: 'no_subscriptions' })
          continue
        }

        for (const sub of subs) {
          // Fire all webpush calls in parallel — critical for multi-member chats
          // where sequential sends would compound latency (each APNs call ~100-200ms).
          sendPromises.push(
            webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              JSON.stringify(notifPayload),
              {
                TTL:     86400, // 1 day — keeps the message queued if the device is offline
                urgency: 'high', // maps to apns-priority:10 — deliver immediately on iOS
              },
            ).then(() => {
              results.push({ user_id: uid, type: group.type, endpoint: sub.endpoint, status: 'sent' })
            }).catch((err: unknown) => {
              const code = (err as { statusCode?: number })?.statusCode
              if (code === 410 || code === 404) {
                staleSubIds.push(sub.id)
                results.push({ user_id: uid, type: group.type, endpoint: sub.endpoint, status: 'expired_deleted' })
              } else {
                console.error('[send-notification] push failed:', err)
                results.push({ user_id: uid, type: group.type, endpoint: sub.endpoint, status: 'error' })
              }
            })
          )
        }
      }
    }

    await Promise.all(sendPromises)

    // Batch-delete stale subscriptions (410/404 from APNs)
    if (staleSubIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', [...new Set(staleSubIds)])
    }

    return new Response(
      JSON.stringify({ results }),
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
