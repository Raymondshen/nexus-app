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

  var ts = Date.now()

  // Record push receipt immediately — before showNotification so diagnostics
  // update even when iOS suppresses the banner (foreground) or rejects options.
  var logPromise = caches.open('nexus-push-log').then(function(cache) {
    return cache.put('/push-log', new Response(JSON.stringify({ ts: ts, title: title }), {
      headers: { 'Content-Type': 'application/json' }
    }))
  }).catch(function() {})

  var clientPromise = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(openClients) {
    openClients.forEach(function(c) { c.postMessage({ type: 'nexus-push-received', ts: ts, title: title }) })
  })

  if (typeof navigator !== 'undefined' && navigator.setAppBadge) {
    navigator.setAppBadge().catch(function() {})
  }

  // iOS does not support `badge` in showNotification options and may reject calls
  // that include unknown options in strict mode. Use the minimal set that iOS
  // documents as supported for Web Push: title (1st arg), body, icon, data, tag.
  var showPromise = self.registration.showNotification(title, {
    body,
    icon:  '/icons/icon-192.png',
    data:  notifData,
    tag:   (notifData && notifData.url) || 'nexus',
  }).catch(function(err) {
    // Full options rejected — try absolute bare minimum
    console.error('[sw-push] showNotification failed, retrying minimal:', err)
    return self.registration.showNotification(title, { body }).catch(function(err2) {
      console.error('[sw-push] notification display failed entirely:', err2)
    })
  })

  event.waitUntil(Promise.all([logPromise, clientPromise, showPromise]))
})

// APNs device tokens rotate periodically on iOS. Persist the new endpoint to
// the DB immediately (app may be closed when this fires).
self.addEventListener('pushsubscriptionchange', function(event) {
  var oldEndpoint = event.oldSubscription && event.oldSubscription.endpoint

  event.waitUntil(
    Promise.resolve(event.newSubscription || self.registration.pushManager.getSubscription())
      .then(function(newSub) {
        var notifyClients = self.clients
          .matchAll({ type: 'window', includeUncontrolled: true })
          .then(function(cs) { cs.forEach(function(c) { c.postMessage({ type: 'nexus-resubscribe' }) }) })

        if (!newSub) return notifyClients

        var json   = newSub.toJSON()
        var p256dh = json.keys && json.keys.p256dh
        var auth   = json.keys && json.keys.auth
        if (!p256dh || !auth) return notifyClients

        return Promise.all([
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
