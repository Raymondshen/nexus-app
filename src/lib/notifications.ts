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

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = window.atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
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

  try {
    const registration = await navigator.serviceWorker.ready
    const applicationServerKey = urlBase64ToUint8Array(
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    )

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    })

    const json     = subscription.toJSON()
    const p256dh   = json.keys?.p256dh
    const auth     = json.keys?.auth
    const endpoint = subscription.endpoint

    if (!p256dh || !auth) return null

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    await supabase
      .from('push_subscriptions')
      .upsert({ user_id: user.id, endpoint, p256dh, auth }, { onConflict: 'endpoint' })

    return subscription
  } catch (err) {
    console.error('[notifications] subscribeToPush failed:', err)
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
