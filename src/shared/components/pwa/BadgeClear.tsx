'use client'

import { useEffect } from 'react'

// Clears the PWA home-screen icon badge whenever the user opens or returns to
// the app. Works alongside the SW push handler which sets the badge on arrival.
export function BadgeClear() {
  useEffect(() => {
    function clear() {
      navigator.clearAppBadge?.()
    }

    clear()
    document.addEventListener('visibilitychange', clear)
    return () => document.removeEventListener('visibilitychange', clear)
  }, [])

  return null
}
