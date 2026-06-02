'use client'

import { useEffect } from 'react'
import { isSupported, getPermissionState, subscribeToPush } from '@/lib/notifications'

// Silently refreshes the push subscription on every app load when the user
// has already granted notification permission. Subscriptions can be silently
// invalidated by the browser or push service; re-subscribing is idempotent
// and ensures the server always has a live endpoint.
export function PushRefresh() {
  useEffect(() => {
    if (isSupported() && getPermissionState() === 'granted') {
      subscribeToPush().catch(() => {})
    }
  }, [])
  return null
}
