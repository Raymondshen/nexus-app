export type PermissionState = 'granted' | 'denied' | 'unsupported'

const PERMISSION_KEY = 'nexus_notif_state'

export function isSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
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

export async function subscribeToPush(): Promise<null> {
  console.log('VAPID keys pending — skipping subscription')
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
