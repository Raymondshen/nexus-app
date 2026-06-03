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

export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!isSupported()) return null

  // iOS is strict about timing — retry up to twice with a delay if the first
  // attempt fails. This handles cases where the SW is still activating right
  // after permission is granted.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500))

    try {
      // Ensure sw-push.js is registered (next-pwa's generated sw.js fails on iOS
      // due to multi-arg importScripts; sw-push.js is a minimal dependency-free SW)
      const regs = await navigator.serviceWorker.getRegistrations()
      if (regs.length === 0) {
        await navigator.serviceWorker.register('/sw-push.js', { scope: '/' })
      }
      const registration = await navigator.serviceWorker.ready

      // Use an existing subscription when available (calling subscribe() on iOS
      // when one already exists can throw in some versions).
      let subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly:   true,
          applicationServerKey: urlBase64ToUint8Array(
            process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
          ),
        })
      }

      const json   = subscription.toJSON()
      const p256dh = json.keys?.p256dh
      const auth   = json.keys?.auth
      if (!p256dh || !auth) return null

      // getSession() reads from cookies — no network call, never fails due to connectivity.
      // getUser() makes a network round-trip; on slow PWA launch it can time out and
      // silently return null, leaving the subscription unregistered in the DB.
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return null
      const userId = session.user.id

      const { error } = await supabase
        .from('push_subscriptions')
        .upsert(
          { user_id: userId, endpoint: subscription.endpoint, p256dh, auth },
          { onConflict: 'endpoint' },
        )

      if (error) throw error

      return subscription
    } catch (err) {
      console.error(`[notifications] subscribeToPush attempt ${attempt + 1} failed:`, err)
    }
  }

  return null
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
