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

// APNs device tokens rotate periodically on iOS. When the subscription endpoint
// changes we need to persist the new endpoint to the DB immediately — we cannot
// rely on open clients because the app may be fully closed.
self.addEventListener('pushsubscriptionchange', (event) => {
  const oldEndpoint = event.oldSubscription && event.oldSubscription.endpoint

  event.waitUntil(
    // iOS provides event.newSubscription when it auto-renews the APNs token.
    // Fall back to getSubscription() in case the browser already updated it.
    Promise.resolve(event.newSubscription || self.registration.pushManager.getSubscription())
      .then((newSub) => {
        const notifyClients = self.clients
          .matchAll({ type: 'window', includeUncontrolled: true })
          .then((cs) => cs.forEach((c) => c.postMessage({ type: 'nexus-resubscribe' })))

        if (!newSub) return notifyClients

        const json   = newSub.toJSON()
        const p256dh = json.keys && json.keys.p256dh
        const auth   = json.keys && json.keys.auth
        if (!p256dh || !auth) return notifyClients

        return Promise.all([
          // Persist new endpoint directly — works even when no window is open.
          fetch('/api/push/resubscribe', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldEndpoint: oldEndpoint, newEndpoint: newSub.endpoint, p256dh: p256dh, auth: auth }),
          }).catch(function() {}),
          notifyClients,
        ])
      })
      .catch(function() {
        return self.clients
          .matchAll({ type: 'window', includeUncontrolled: true })
          .then(function(cs) { cs.forEach(function(c) { c.postMessage({ type: 'nexus-resubscribe' }) }) })
      })
  )
})
