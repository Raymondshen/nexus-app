import { createClient } from '@/lib/supabase/client'

export type PermissionState = 'granted' | 'denied' | 'unsupported'

const PERMISSION_KEY = 'nexus_notif_state'

export function isSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  )
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = window.atob(base64)
  const bytes   = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export async function requestPermission(): Promise<PermissionState> {
  if (!isSupported()) return 'unsupported'

  const result = await Notification.requestPermission()

  if (result === 'granted') {
    savePermissionState('granted')
    return 'granted'
  }

  savePermissionState('denied')
  return 'denied'
}

/**
 * Save the current push subscription to the DB. Called on every app mount
 * (via PushRefresh) and after FORCE RESUB.
 *
 * Strategy:
 * 1. Get existing browser subscription.
 * 2. Try to upsert it into push_subscriptions.
 * 3. If the insert fails for any reason (stale endpoint, constraint error, etc.)
 *    unsubscribe the old one and create a completely fresh subscription, then
 *    try the insert once more.
 *
 * This handles the most common iOS push failure mode: APNs silently expires
 * the token and returns 410 on the next push attempt (deleting the DB row),
 * but the browser doesn't fire pushsubscriptionchange, so the app is stuck
 * holding an expired endpoint. The fresh-subscribe path below recovers from
 * this without needing FORCE RESUB.
 *
 * Throws with a descriptive message if all attempts fail so callers can log it.
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!isSupported()) return null

  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) {
    console.warn('[notifications] subscribeToPush: no session — skipping')
    return null
  }
  const userId = session.user.id

  // Ensure sw-push.js is registered.
  const regs = await navigator.serviceWorker.getRegistrations()
  if (regs.length === 0) {
    await navigator.serviceWorker.register('/sw-push.js', { scope: '/' })
  }
  const registration = await navigator.serviceWorker.ready

  const vapidKey = urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!)

  async function trySave(sub: PushSubscription): Promise<PushSubscription | null> {
    const json   = sub.toJSON()
    const p256dh = json.keys?.p256dh
    const auth   = json.keys?.auth
    if (!p256dh || !auth) {
      console.error('[notifications] subscription missing keys')
      return null
    }

    // Delete any existing row for this exact endpoint (idempotent).
    await supabase
      .from('push_subscriptions')
      .delete()
      .match({ endpoint: sub.endpoint, user_id: userId })

    const { error } = await supabase
      .from('push_subscriptions')
      .insert({ user_id: userId, endpoint: sub.endpoint, p256dh, auth })

    if (error) throw new Error(`DB insert failed: ${error.message} (code=${error.code})`)

    return sub
  }

  // Attempt 1: try with the existing subscription (avoids re-subscribing when not needed).
  let sub: PushSubscription | null = null
  try {
    // iOS can throw when calling getSubscription() before SW is fully active —
    // the ready promise above should prevent this, but wrap defensively.
    sub = await registration.pushManager.getSubscription()
  } catch { /* treat as no subscription */ }

  if (sub) {
    try {
      return await trySave(sub)
    } catch (err) {
      // Insert failed — the existing endpoint is likely stale (APNs expired it,
      // send-notification got 410 and deleted the DB row, but the browser still
      // holds the old token). Unsubscribe and fall through to a fresh subscribe.
      console.warn('[notifications] existing endpoint save failed, trying fresh subscribe:', err)
      try { await sub.unsubscribe() } catch { /* ignore */ }
    }
  }

  // Attempt 2: fresh subscription (new APNs token).
  // Note: iOS can throw if subscribe() is called while one already exists —
  // the unsubscribe above should clear it, but we still wrap in try/catch.
  try {
    const freshSub = await registration.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: vapidKey,
    })
    return await trySave(freshSub)
  } catch (err) {
    console.error('[notifications] fresh subscribe failed:', err)
    return null
  }
}

export function getPermissionState(): PermissionState {
  if (!isSupported()) return 'unsupported'

  const stored = localStorage.getItem(PERMISSION_KEY) as PermissionState | null
  if (stored) return stored

  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'

  return 'unsupported'
}

export function savePermissionState(state: PermissionState): void {
  localStorage.setItem(PERMISSION_KEY, state)
}
