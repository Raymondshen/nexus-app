// ─── Cache names ─────────────────────────────────────────────────────────────

// Supabase Storage chat images — CacheFirst
var NEXUS_IMAGE_CACHE  = 'nexus-images-v1'
var SUPABASE_IMAGES_RE = /\/storage\/v1\/object\/public\/(chat-images|backgrounds)\//

// Next.js static chunks, CSS, fonts — CacheFirst (content-addressed, immutable)
// next-pwa generates sw.js (workbox) but iOS Safari crashes on its multi-arg
// importScripts call, so sw-push.js is the only registered SW. The workbox
// runtimeCaching rules in next.config.ts never apply. We replicate the most
// impactful ones here using the vanilla Cache API.
var NEXUS_STATIC_CACHE = 'nexus-static-v2'

// Local static assets — character sprites, app icons, reaction Lottie JSON.
// Not content-hashed like /_next/static/, but effectively immutable in practice
// (a file is added once and rarely edited in place) — CacheFirst avoids
// re-fetching the same small files on every cold PWA launch. Bump the version
// suffix if a file under these paths is ever replaced in place.
var NEXUS_ASSETS_CACHE = 'nexus-assets-v1'
var LOCAL_ASSETS_RE    = /\/(sprites|icons|lottie|img)\//

// App-shell HTML — StaleWhileRevalidate
// Bounded to authenticated app paths; /login and /auth are excluded so
// unauthenticated users always get a fresh redirect from the server.
// Bump the version string when a deploy would make old HTML incompatible
// (the activate handler below purges previous versions automatically).
// /home is deliberately NOT in this list: home/page.tsx redirects every
// navigation there straight into the user's pinned squad chat (server-side,
// on every request — see that file's launch-redirect comment), and that
// redirect is the entire point of a PWA cold launch (manifest start_url is
// /home). Serving a stale cached copy here — which follows the redirect and
// caches whatever squad's HTML that resolved to at the time — would replay
// an old destination instead of hitting the server for the current one.
var NEXUS_PAGES_CACHE = 'nexus-pages-v3'
var NEXUS_PAGE_PATHS  = ['/chat/', '/vault/', '/friends', '/profile', '/dm/']

function isAppPage(pathname) {
  for (var i = 0; i < NEXUS_PAGE_PATHS.length; i++) {
    var p = NEXUS_PAGE_PATHS[i]
    if (pathname === p || pathname.startsWith(p)) return true
  }
  return false
}

// Absolute last-resort HTML — inlined so it depends on neither Cache Storage nor
// a live fetch succeeding. This is the fallback OF the fallback: offlineFallback()
// below normally serves the real /offline.html, but that file only ever reaches
// Cache Storage via the 'install' handler's own network fetch (cache.add), which
// can itself fail under the exact deploy-cutover network flakiness this whole
// chain exists to survive — with no retry, that leaves /offline.html permanently
// missing from cache until the SW next reinstalls. This inline copy is what
// keeps that scenario from falling through to the bare native "This page
// couldn't load" error.
var OFFLINE_FALLBACK_HTML = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">' +
  '<title>Nexus — Offline</title><style>body{background:#0a0612;color:#fff;' +
  'font-family:system-ui,-apple-system,sans-serif;min-height:100dvh;display:flex;' +
  'flex-direction:column;align-items:center;justify-content:center;padding:24px;' +
  'text-align:center;gap:16px}button{background:#fff;color:#0a0612;border:none;' +
  'border-radius:8px;padding:12px 24px;font-size:16px;font-weight:600}</style></head>' +
  '<body><h1>You are offline</h1><p>Check your connection and try again.</p>' +
  '<button onclick="location.reload()">Reload</button></body></html>'

// Never let a navigation fallback resolve to undefined (event.respondWith(undefined)
// is what produces the bare native error page). Try the precached real offline.html
// first, then a live fetch of it (covers "precache missed but the network's fine
// again now"), then the fully inline copy above, which cannot fail.
function offlineFallback() {
  return caches.match('/offline.html').then(function(cached) {
    if (cached) return cached
    return fetch('/offline.html').catch(function() {
      return new Response(OFFLINE_FALLBACK_HTML, {
        status:  200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    })
  })
}

// fetch() only REJECTS on a genuine network-level failure — a transient 502/503/504
// from the origin (old serverless instance draining, new one not warm yet — exactly
// what a Vercel deploy cutover produces for a brief window) resolves normally as a
// response object, so a bare `.catch()` never sees it and hands that bad gateway
// response straight to the browser untouched. Treat a 5xx the same as a thrown
// error for fallback purposes; a 4xx (401/404/etc) is a legitimate application
// response and must NOT be swapped for the offline page.
function isServerError(response) {
  return response.status >= 500 && response.status <= 599
}

// ─── Fetch handler ────────────────────────────────────────────────────────────

self.addEventListener('fetch', function(event) {
  var request = event.request
  var url     = request.url

  // ── StaleWhileRevalidate for app navigation ──────────────────────────────
  // On background-resume (Android kills + user taps icon), the SW serves the
  // cached HTML immediately so the app appears in <100ms. The network fetch
  // runs in parallel to update the cache for next time. Auth redirects (302)
  // are NOT cached (response.ok = false) so unauthenticated flows are unaffected.
  if (request.mode === 'navigate') {
    var path = new URL(url).pathname
    if (isAppPage(path)) {
      event.respondWith(
        caches.open(NEXUS_PAGES_CACHE).then(function(cache) {
          return cache.match(request).then(function(cached) {
            var networkFetch = fetch(request).then(function(response) {
              if (response.ok) cache.put(request, response.clone())
              // A 5xx during this response.ok check already skips caching it above —
              // still must not hand it back as-is when there's nothing better cached.
              if (isServerError(response)) return cached || offlineFallback()
              return response
            }).catch(function() {
              return cached || offlineFallback()
            })
            // Serve stale HTML immediately; network response updates cache in bg
            return cached || networkFetch
          })
        })
      )
      return
    }

    // Every other navigation (/home, /, /login, /onboarding/*, ...) is deliberately
    // NOT cached above — /home always needs a fresh server hit for its pinned-squad
    // launch redirect (see the comment above NEXUS_PAGE_PATHS), and /login/onboarding
    // must always get a live auth check. But leaving these completely unintercepted
    // means a transient network failure (e.g. the brief window right as a new Vercel
    // deploy cuts over, which is exactly when this got noticed — tends to happen
    // right after a commit+push) falls straight through to the OS's own native
    // "This page couldn't load" error screen instead of anything this app controls —
    // no retry, no offline.html, nothing. NetworkOnly-with-fallback here preserves
    // "always hit the network, never replay stale HTML for these paths" while still
    // catching that failure and handing back our own offline page instead of a bare
    // native error page. Also covers a resolved-but-5xx response (see isServerError's
    // own doc comment) — a plain .catch() alone doesn't see those, only a rejected
    // fetch() promise, so a deploy-cutover 502/503 was still slipping through
    // unfiltered even with this branch already in place.
    event.respondWith(
      fetch(request).then(function(response) {
        if (isServerError(response)) return offlineFallback()
        return response
      }).catch(function() {
        return offlineFallback()
      })
    )
    return
  }

  // ── CacheFirst for Next.js static assets (JS/CSS/fonts) ─────────────────
  // Only cache URLs that are provably content-addressed: their filename must
  // contain an 8+ hex-char build hash (e.g. framework-1a2b3c4d.js, abc123.css).
  // Production webpack builds always embed a hash; Turbopack dev chunks use
  // human-readable paths (HomeClient.tsx.js) that change on every hot-reload
  // and must never be served stale from cache.
  if (url.includes('/_next/static/') && /\/[0-9a-f]{8,}[.\-]/i.test(url)) {
    event.respondWith(
      caches.open(NEXUS_STATIC_CACHE).then(function(cache) {
        return cache.match(request).then(function(cached) {
          if (cached) return cached
          return fetch(request).then(function(response) {
            if (response.ok) cache.put(request, response.clone())
            return response
          })
        })
      })
    )
    return
  }

  // ── CacheFirst for local static assets (sprites/icons/lottie/img) ────────
  if (LOCAL_ASSETS_RE.test(new URL(url).pathname)) {
    event.respondWith(
      caches.open(NEXUS_ASSETS_CACHE).then(function(cache) {
        return cache.match(request).then(function(cached) {
          if (cached) return cached
          return fetch(request).then(function(response) {
            if (response.ok) cache.put(request, response.clone())
            return response
          })
        })
      })
    )
    return
  }

  // ── CacheFirst for Supabase Storage chat images ──────────────────────────
  if (!SUPABASE_IMAGES_RE.test(url)) return
  event.respondWith(
    caches.open(NEXUS_IMAGE_CACHE).then(function(cache) {
      return cache.match(request).then(function(cached) {
        if (cached) return cached
        return fetch(request).then(function(response) {
          if (response.ok) cache.put(request, response.clone())
          return response
        })
      })
    })
  )
})

// ─── Lifecycle ────────────────────────────────────────────────────────────────

// Minimal push-only service worker for Nexus.
// Intentionally has zero importScripts / workbox dependencies — the
// multi-argument importScripts call in next-pwa's generated sw.js silently
// kills installation on iOS Safari, so we bypass it entirely.

self.addEventListener('install', function(event) {
  // offlineFallback() prefers this precached copy over the inline HTML fallback —
  // it doesn't get into Cache Storage on its own. next-pwa's generated sw.js/
  // fallback-*.js DOES precache it via workbox's `fallbacks` config (next.config.ts's
  // pwaConfig), but that generated worker is never registered (see CLAUDE.md —
  // SWRegister only registers this hand-written file), so that precaching never
  // actually runs.
  //
  // This fetch runs at install time, which for an already-installed PWA is
  // triggered by a foreground SW update check (SWRegister's visibilitychange
  // handler) — i.e. it can land in the exact same deploy-cutover network
  // flakiness the offline fallback exists to survive. One retry after a short
  // delay covers a one-off blip; if both attempts fail, offlineFallback()'s own
  // inline-HTML fallback (see above) still prevents the bare native error page —
  // this retry is just to make that ugly last resort less often necessary.
  function precacheOfflinePage(attempt) {
    return caches.open(NEXUS_PAGES_CACHE).then(function(cache) {
      return cache.add('/offline.html')
    }).catch(function(err) {
      if (attempt < 1) {
        return new Promise(function(resolve) { setTimeout(resolve, 2000) })
          .then(function() { return precacheOfflinePage(attempt + 1) })
      }
      console.error('[sw-push] failed to precache offline.html:', err)
    })
  }

  event.waitUntil(precacheOfflinePage(0))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Purge stale page and static caches from previous SW versions.
      // When any version string is bumped, old cached HTML and stale
      // JS chunks are deleted so the next request fetches fresh assets.
      caches.keys().then(function(keys) {
        return Promise.all(keys.filter(function(k) {
          return (k.startsWith('nexus-pages-')  && k !== NEXUS_PAGES_CACHE) ||
                 (k.startsWith('nexus-static-') && k !== NEXUS_STATIC_CACHE) ||
                 (k.startsWith('nexus-assets-') && k !== NEXUS_ASSETS_CACHE)
        }).map(function(k) { return caches.delete(k) }))
      }),
    ])
  )
})

// ─── Push notifications ───────────────────────────────────────────────────────

// Set by ChatInput (via notifyActiveCrew in shared/utils/notifications.ts) whenever
// its chat screen is mounted AND the page is foregrounded/visible — cleared on
// backgrounding, unmount, or crew switch. Used below to skip showing a push banner
// for a message the recipient is already looking at live via Realtime. Module-scope
// state is lost if the SW is evicted and restarted, but that's an acceptable gap:
// the client re-announces on every visibility 'visible' transition, so the window
// where this is stale is small and fails open (shows the notification) rather than
// silently swallowing a real one.
var activeCrewId = null

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'nexus-active-crew') {
    activeCrewId = event.data.crewId || null
  }
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

  // Self-heal: a push event proves this subscription is still genuinely alive at
  // the browser/OS level, even if the app hasn't been opened in weeks — the one
  // moment a dormant PWA still runs code. Re-confirm it to the server (refresh
  // last_seen_at, re-sync keys if they drifted) via /api/push/heartbeat. Fires
  // regardless of whether the banner below ends up suppressed — liveness doesn't
  // depend on whether this particular message was shown.
  var heartbeatPromise = self.registration.pushManager.getSubscription().then(function(sub) {
    if (!sub) return
    var json   = sub.toJSON()
    var p256dh = json.keys && json.keys.p256dh
    var subAuth = json.keys && json.keys.auth
    if (!p256dh || !subAuth) return
    return fetch('/api/push/heartbeat', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint, p256dh: p256dh, auth: subAuth }),
    }).catch(function() {})
  }).catch(function() {})

  // Suppress the OS banner (and badge bump) when the recipient currently has this
  // exact crew's chat open and foregrounded — they're already seeing the message
  // live, a push on top is redundant/annoying. Only message/mention/reply pushes
  // carry crew_id; friend_request/recruit_arrived are never suppressed this way.
  if (notifData && notifData.crew_id && notifData.crew_id === activeCrewId) {
    event.waitUntil(Promise.all([logPromise, clientPromise, heartbeatPromise]))
    return
  }

  if (typeof navigator !== 'undefined' && navigator.setAppBadge) {
    navigator.setAppBadge().catch(function() {})
  }

  // iOS does not support `badge` in showNotification options and may reject calls
  // that include unknown options in strict mode. Use the minimal set that iOS
  // documents as supported for Web Push: title (1st arg), body, icon, data, tag.
  //
  // IMPORTANT: tag must be unique per notification. Reusing the same tag (e.g.
  // the crew URL) causes iOS to silently replace the existing notification in
  // the Notification Center without playing a sound or showing a new banner —
  // subsequent messages appear to never arrive. Appending the timestamp makes
  // each push distinct so iOS always triggers a new alert.
  var showPromise = self.registration.showNotification(title, {
    body,
    icon:  '/icons/icon-192.png',
    data:  notifData,
    tag:   ((notifData && notifData.url) || 'nexus') + '-' + ts,
  }).catch(function(err) {
    // Full options rejected — try absolute bare minimum
    console.error('[sw-push] showNotification failed, retrying minimal:', err)
    return self.registration.showNotification(title, { body }).catch(function(err2) {
      console.error('[sw-push] notification display failed entirely:', err2)
    })
  })

  event.waitUntil(Promise.all([logPromise, clientPromise, showPromise, heartbeatPromise]))
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
