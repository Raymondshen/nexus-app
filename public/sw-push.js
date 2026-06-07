// Minimal push-only service worker for Nexus.
// Intentionally has zero importScripts / workbox dependencies — the
// multi-argument importScripts call in next-pwa's generated sw.js silently
// kills installation on iOS Safari, so we bypass it entirely.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let title = 'Nexus'
  let body  = ''
  let notifData = {}

  if (event.data) {
    try {
      const parsed = event.data.json()
      title     = parsed.title || 'Nexus'
      body      = parsed.body  || ''
      notifData = parsed.data  || {}
    } catch {
      // malformed JSON — still show a generic notification below
    }
  }

  // iOS does not support `badge` in showNotification options and may reject calls
  // that include unknown options in strict mode. Use the minimal set that iOS
  // documents as supported for Web Push: title (1st arg), body, icon, data, tag.
  const show = self.registration.showNotification(title, {
    body,
    icon:  '/icons/icon-192.png',
    data:  notifData,
    tag:   (notifData && notifData.url) || 'nexus',
  }).catch((err) => {
    // Full options rejected — try absolute bare minimum
    console.error('[sw-push] showNotification failed, retrying minimal:', err)
    return self.registration.showNotification(title, { body })
  })

  event.waitUntil(
    show.then(() => {
      // navigator (not self.navigator) is the correct SW global
      if (typeof navigator !== 'undefined' && navigator.setAppBadge) {
        navigator.setAppBadge().catch(() => {})
      }
      // Notify any open clients so dev diagnostics can confirm the push fired
      return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((openClients) => {
        openClients.forEach((c) => c.postMessage({ type: 'nexus-push-received', ts: Date.now(), title }))
      })
    }).catch((err) => {
      console.error('[sw-push] notification display failed entirely:', err)
    })
  )
})

// APNs device tokens rotate periodically on iOS. When the subscription changes,
// message any open clients so they can re-save the new endpoint to the DB.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((openClients) => {
        openClients.forEach((c) => c.postMessage({ type: 'nexus-resubscribe' }))
      })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const path = event.notification.data && event.notification.data.url
  if (!path) return

  const targetUrl = new URL(path, self.location.origin).href

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((openWindows) => {
        for (const win of openWindows) {
          if (!('focus' in win)) continue
          if (win.url === targetUrl) return win.focus()
          if (typeof win.navigate === 'function') {
            return win.navigate(targetUrl)
              .then((w) => (w ?? win).focus())
              .catch(() => clients.openWindow(targetUrl))
          }
        }
        return clients.openWindow(targetUrl)
      })
      .then(() => {
        if (typeof navigator !== 'undefined' && navigator.clearAppBadge) {
          navigator.clearAppBadge().catch(() => {})
        }
      })
  )
})
