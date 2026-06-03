'use client'

import { useEffect } from 'react'

// next-pwa v5 injects the SW registration script into _document.js (Pages Router).
// In App Router there is no _document.js, so the generated sw.js is never registered.
// This component fills that gap — call it once in the root layout.
export function SWRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => console.error('[SW] registration failed:', err))
  }, [])

  return null
}
