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
    }).then(() => {
      // Increment the home-screen icon badge so the user sees unread activity
      // even without opening the notification tray. Badge API is supported on
      // iOS 16.4+ PWAs and Chrome/Edge desktop. Optional-chain guards older envs.
      self.navigator.setAppBadge?.()
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

          // Already on the right page — just bring it forward.
          if (win.url === targetUrl) return win.focus()

          // Background window at a different URL (e.g. /home while notification
          // links to /chat/xyz). navigate() steers the existing PWA window to the
          // target instead of opening a Safari tab. Available iOS Safari 17.4+;
          // falls through to openWindow() on older versions.
          if (typeof win.navigate === 'function') {
            return win.navigate(targetUrl)
              .then((w) => (w ?? win).focus())
              .catch(() => clients.openWindow(targetUrl))
          }
        }
        return clients.openWindow(targetUrl)
      })
      .then(() => {
        // Clear the badge once the user has acknowledged the notification.
        self.navigator.clearAppBadge?.()
      })
  )
})
