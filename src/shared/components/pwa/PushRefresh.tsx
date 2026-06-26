'use client'

import { useEffect } from 'react'
import { isSupported, getPermissionState, subscribeToPush } from '@/shared/utils/notifications'

export function PushRefresh() {
  useEffect(() => {
    if (!isSupported()) return

    if (getPermissionState() === 'granted') {
      subscribeToPush().catch(() => {})
    }

    // Re-subscribe when the SW signals an APNs token rotation.
    // pushsubscriptionchange fires in the SW; it messages open clients
    // since the SW has no access to the user session for DB writes.
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'nexus-resubscribe') {
        subscribeToPush().catch(() => {})
      }
    }

    navigator.serviceWorker.addEventListener('message', handleMessage)
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage)
  }, [])

  return null
}
