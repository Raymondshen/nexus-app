import { createClient } from '@/shared/supabase/client'

export type PermissionState = 'granted' | 'denied' | 'unsupported'

const PERMISSION_KEY = 'nexus_notif_state'
const DEVICE_ID_KEY  = 'nexus_push_device_id'

// A stable per-device id, generated once and persisted locally — see
// subscribeToPush()'s pruning step for what this exists to make safe.
function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

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
 * (PushRefresh) whenever permission is already granted — there's no separate
 * manual "force resubscribe" entry point on this device's own side anymore;
 * the closest equivalent is /profile/developer/manage-notifications's per-user
 * refresh button, which only deletes DB rows server-side and relies on this
 * function running again next time that device's own PushRefresh mounts.
 *
 * Design decisions:
 * - Session is checked first so we fail fast with a clear warning.
 * - INSERT first, not delete-then-insert or a plain upsert — see trySave()'s
 *   own comment for why (RLS + a shared-device conflict scenario).
 * - If the existing endpoint fails to save (any error other than a 23505
 *   conflict on our own row — e.g. it was 410'd and APNs now rejects it at
 *   the source), we unsubscribe, get a fresh APNs token, and try again.
 * - pruneOtherRowsForThisDevice() cleans up this device's own past duplicate
 *   endpoints (see its own comment) after every successful save.
 * - Dispatches 'nexus-push-subscribed' on window when done so PushDebugFAB's
 *   status pill can re-check without polling.
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!isSupported()) return null

  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) {
    console.warn('[notifications] subscribeToPush: no session — skipping')
    return null
  }
  const userId   = session.user.id
  const deviceId = getOrCreateDeviceId()

  const regs = await navigator.serviceWorker.getRegistrations()
  if (regs.length === 0) {
    await navigator.serviceWorker.register('/sw-push.js', { scope: '/' })
  }
  const registration = await navigator.serviceWorker.ready
  const vapidKey = urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!)

  // INSERT first (not upsert) — push_subscriptions' UPDATE RLS policy is scoped to
  // `auth.uid() = user_id` (rows the caller already owns). An upsert's ON CONFLICT DO
  // UPDATE runs that same policy check against the CONFLICTING row, so if the
  // endpoint already belongs to a *different* user (a shared device/browser two
  // accounts both subscribed from, without clearing site data between them — a real
  // scenario with this project's own test accounts) RLS denies the update, upsert
  // throws, and the caller below falls back to unsubscribe+fresh-subscribe — burning
  // a needless new endpoint, exactly the duplicate-accumulation bug this whole
  // mechanism exists to stop. Insert-then-conditionally-update avoids that: a 23505
  // conflict falls through to a plain UPDATE scoped to `.eq('user_id', userId)`,
  // which the same RLS policy still governs — but a 0-row UPDATE is not an error, it
  // just silently no-ops when the row belongs to someone else, instead of throwing.
  async function trySave(sub: PushSubscription): Promise<PushSubscription> {
    const json   = sub.toJSON()
    const p256dh = json.keys?.p256dh
    const auth   = json.keys?.auth
    if (!p256dh || !auth) throw new Error('subscription missing p256dh/auth keys')

    // os_permission/sw_state are diagnostic-only (see /profile/developer/manage-notifications)
    // — captured at the one moment this code has both facts in hand, since neither is
    // knowable server-side for another user's device without a client report like this.
    const fields = {
      p256dh,
      auth,
      device_id:     deviceId,
      os_permission: 'Notification' in window ? Notification.permission : null,
      sw_state:      registration.active?.state ?? null,
    }

    const { error: insertError } = await supabase
      .from('push_subscriptions')
      .insert({ user_id: userId, endpoint: sub.endpoint, ...fields })

    if (!insertError) return sub
    if (insertError.code !== '23505') {
      throw new Error(`insert failed: ${insertError.message} (code=${insertError.code})`)
    }

    // Conflict: row already exists. Backfill device_id/os_permission/sw_state onto it
    // — best-effort, since this only matters for a row this device already owns; if it
    // belongs to another user sharing this browser, RLS makes it a harmless 0-row no-op.
    try {
      await supabase.from('push_subscriptions').update(fields).eq('endpoint', sub.endpoint).eq('user_id', userId)
    } catch { /* best-effort backfill only */ }
    return sub
  }

  // Self-heals the iOS getSubscription()-false-negative bug (see the retry loop's
  // own comment below): every time this device successfully saves a subscription,
  // delete any of its OWN other rows — same user_id + device_id, different endpoint
  // — left behind by a past false negative that minted a needless duplicate.
  // Scoping to device_id (not just user_id) is what makes this safe to run
  // unconditionally; without it, a blanket cleanup could delete a different
  // device's still-valid row (see the notification-engine skill's own gotcha on
  // why mass-deletion was rejected before this identifier existed). Best-effort —
  // never throws, since a failed prune just means one more duplicate row sticks
  // around, not a broken subscription.
  async function pruneOtherRowsForThisDevice(currentEndpoint: string) {
    try {
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('device_id', deviceId)
        .neq('endpoint', currentEndpoint)
    } catch { /* best-effort */ }
  }

  // getSubscription() can throw or transiently return null on iOS before the SW is
  // fully controlling — retrying a couple times avoids mistaking that race for "no
  // subscription exists" and minting a needless fresh one (each fresh subscribe()
  // gets its own unique endpoint on iOS, so a false negative here mints a genuine
  // duplicate). Retries reduce how often that happens but don't eliminate it — it's
  // a Safari-side quirk, not something client code fully controls — so
  // pruneOtherRowsForThisDevice() below is what actually stops it from being
  // permanent, by cleaning up this device's own past duplicates on every successful
  // save rather than relying on this loop alone.
  let sub: PushSubscription | null = null
  for (let attempt = 0; attempt < 3 && !sub; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 150))
    try {
      sub = await registration.pushManager.getSubscription()
    } catch { /* iOS can throw before SW is fully controlling — retry */ }
  }

  if (sub) {
    try {
      const saved = await trySave(sub)
      await pruneOtherRowsForThisDevice(saved.endpoint)
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
    await pruneOtherRowsForThisDevice(saved.endpoint)
    window.dispatchEvent(new CustomEvent('nexus-push-subscribed'))
    return saved
  } catch (err) {
    console.error('[notifications] fresh subscribe failed:', err)
    return null
  }
}

/**
 * Tells the service worker which crew's chat screen (if any) is currently mounted
 * and foregrounded, so it can skip showing a push banner for a message the user is
 * already seeing live via Realtime — see sw-push.js's 'push' handler. Call with the
 * crew id on mount/visible, and with null on backgrounding, unmount, or crew switch.
 */
export function notifyActiveCrew(crewId: string | null): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.controller?.postMessage({ type: 'nexus-active-crew', crewId })
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
