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
  if (!event.data) return

  let data
  try { data = event.data.json() } catch { return }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Nexus', {
      body:     data.body  || '',
      icon:     data.icon  || '/icons/icon-192.png',
      badge:    data.badge || '/icons/icon-192.png',
      data:     data.data  || {},
      tag:      (data.data && data.data.url) || 'nexus',
      renotify: true,
    }).then(() => {
      self.navigator.setAppBadge?.()
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
        self.navigator.clearAppBadge?.()
      })
  )
})
