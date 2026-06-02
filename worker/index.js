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

  event.waitUntil(
    self.registration.showNotification(data.title || 'Nexus', {
      body:     data.body  || '',
      icon:     data.icon  || '/icons/icon-192.png',
      badge:    data.badge || '/icons/icon-192.png',
      data:     data.data  || {},
      // tag collapses duplicate alerts for the same URL instead of stacking them
      tag:      (data.data && data.data.url) || 'nexus',
      renotify: true,
    })
  )
})

// Notification click — focus an existing tab or open a new one.
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
          if (win.url === targetUrl && 'focus' in win) {
            return win.focus()
          }
        }
        return clients.openWindow(targetUrl)
      })
  )
})
