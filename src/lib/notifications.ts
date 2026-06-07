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
  if (result === 'granted') { savePermissionState('granted'); return 'granted' }
  savePermissionState('denied')
  return 'denied'
}

/**
 * Save the current push subscription to the DB. Called on every app mount
 * (PushRefresh) and after FORCE RESUB.
 *
 * Design decisions:
 * - Session is checked first so we fail fast with a clear warning.
 * - We INSERT without deleting first. Deleting then inserting creates a
 *   zero-row window that races with the debug FAB's auto-check (which fires
 *   on mount at the same time). It also risks losing the row if the insert
 *   fails after the delete. A plain INSERT that treats 23505 (duplicate key)
 *   as success is both safer and race-free.
 * - If the existing endpoint fails to insert (any non-23505 error — e.g. it
 *   was 410'd and now APNs rejects it at the source), we unsubscribe, get a
 *   fresh APNs token, and try again.
 * - Dispatches 'nexus-push-subscribed' on window when done so the FAB can
 *   re-check status without polling.
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

  const regs = await navigator.serviceWorker.getRegistrations()
  if (regs.length === 0) {
    await navigator.serviceWorker.register('/sw-push.js', { scope: '/' })
  }
  const registration = await navigator.serviceWorker.ready
  const vapidKey = urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!)

  // INSERT only — no delete first. 23505 (duplicate key) means the row
  // already exists with the correct endpoint; treat it as success.
  async function trySave(sub: PushSubscription): Promise<PushSubscription> {
    const json   = sub.toJSON()
    const p256dh = json.keys?.p256dh
    const auth   = json.keys?.auth
    if (!p256dh || !auth) throw new Error('subscription missing p256dh/auth keys')

    const { error } = await supabase
      .from('push_subscriptions')
      .insert({ user_id: userId, endpoint: sub.endpoint, p256dh, auth })

    // 23505 = unique_violation: row already exists — nothing to do.
    if (!error || error.code === '23505') return sub

    throw new Error(`insert failed: ${error.message} (code=${error.code})`)
  }

  let sub: PushSubscription | null = null
  try {
    sub = await registration.pushManager.getSubscription()
  } catch { /* iOS can throw before SW is fully controlling */ }

  if (sub) {
    try {
      const saved = await trySave(sub)
      window.dispatchEvent(new CustomEvent('nexus-push-subscribed'))
      return saved
    } catch (err) {
      // Existing endpoint failed to save — likely stale (APNs 410'd it).
      // Unsubscribe so we can create a fresh one.
      console.warn('[notifications] existing endpoint save failed, refreshing:', err)
      try { await sub.unsubscribe() } catch { /* ignore */ }
    }
  }

  // Fresh subscription — new APNs token.
  try {
    const freshSub = await registration.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: vapidKey,
    })
    const saved = await trySave(freshSub)
    window.dispatchEvent(new CustomEvent('nexus-push-subscribed'))
    return saved
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
