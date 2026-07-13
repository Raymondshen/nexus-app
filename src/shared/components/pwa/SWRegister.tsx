'use client'

import { useEffect } from 'react'

// next-pwa v5 injects the SW registration script into _document.js (Pages Router).
// In App Router there is no _document.js, so the generated sw.js is never registered.
// This component fills that gap — call it once in the root layout.
export function SWRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    // sw-push.js calls skipWaiting()+clients.claim() on every install/activate — a new
    // deploy's SW seizes control of already-open clients with no opt-in. Without this
    // listener, the page keeps running the PREVIOUS deploy's JS (stale Server Action IDs,
    // stale RSC payload shapes) against a NEW SW/cache generation underneath it. On iOS,
    // the PWA's WKWebView process stays resident across backgrounding, so "first launch"
    // after a deploy is often a resume of that stale session — it looks like a freeze
    // because a stale Server Action call against the new deployment hangs/fails rather
    // than erroring cleanly, and only a force-quit (killing the resident process) forces
    // a truly fresh load. Reloading once on controllerchange closes that gap.
    let reloaded = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    })

    navigator.serviceWorker
      .register('/sw-push.js', { scope: '/' })
      .then((registration) => {
        // iOS doesn't reliably re-check for a SW byte diff on background→foreground resume
        // the way a browser tab does on navigation, so an update can otherwise sit
        // undiscovered until the next real navigation. Force a check whenever the PWA
        // returns to foreground.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') registration.update().catch(() => {})
        })
      })
      .catch((err) => console.error('[SW] registration failed:', err))
  }, [])

  return null
}
