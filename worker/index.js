// Push event — show the notification when the server sends one.
// Without this handler the browser receives the push message but discards it.
self.addEventListener('push', (event) => {
  if (!event.data) return

  let data
  try {
    data = event.data.json()
  } catch {
    return
  }

  // iOS does not support `badge` in showNotification options and silently
  // rejects the call in strict mode — strip it and use only the safe subset.
  const show = self.registration.showNotification(data.title || 'Nexus', {
    body:     data.body || '',
    icon:     data.icon || '/icons/icon-192.png',
    data:     data.data || {},
    tag:      (data.data && data.data.url) || 'nexus',
    renotify: true,
  }).catch((err) => {
    console.error('[worker] showNotification failed, retrying minimal:', err)
    return self.registration.showNotification(data.title || 'Nexus', { body: data.body || '' })
  })

  event.waitUntil(
    show.then(() => {
      if (typeof navigator !== 'undefined' && navigator.setAppBadge) {
        navigator.setAppBadge().catch(() => {})
      }
    }).catch((err) => {
      console.error('[worker] notification display failed entirely:', err)
    })
  )
})

// Notification click — focus/navigate an existing PWA window, or open a new one.
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
