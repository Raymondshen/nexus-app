'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { subscribeToPush } from '@/lib/notifications'

type SubType = 'apns' | 'fcm' | 'unknown' | 'none'

interface MutedCrew {
  crew_id:   string
  crew_name: string
}

interface SubRow {
  endpoint_tail: string
  is_apns:       boolean
  created_at:    string
}

interface Status {
  swScript:     string
  swState:      string
  subType:      SubType
  endpoint:     string   // last 28 chars for display
  fullEndpoint: string   // full URL for DB comparison
  dbCount:      number
  inDB:         boolean | null
  permission:   string
  vapidOk:      boolean
  mutedCrews:   MutedCrew[]
  dbSubs:       SubRow[]    // all rows from DB (newest first)
  dbError:      string | null
  error?:       string
}

function formatAge(isoStr: string): string {
  const diffMs = Date.now() - new Date(isoStr).getTime()
  const mins   = Math.floor(diffMs / 60_000)
  if (mins < 2)    return 'just now'
  if (mins < 60)   return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs  < 24)   return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function PushDebugFAB() {
  const [showFab,        setShowFab]        = useState(false)
  const [open,           setOpen]           = useState(false)
  const [status,         setStatus]         = useState<Status | null>(null)
  const [checking,       setChecking]       = useState(false)
  const [resubLoading,   setResubLoading]   = useState(false)
  const [subLoading,     setSubLoading]     = useState(false)
  const [testLoading,    setTestLoading]    = useState(false)
  const [log,            setLog]            = useState<string[]>([])
  const [lastPush,       setLastPush]       = useState<number | null>(null)
  const [lastPushCached, setLastPushCached] = useState<number | null>(null)
  const logBuf    = useRef<string[]>([])
  const didCheck  = useRef(false)

  const pushLog = useCallback((msg: string) => {
    const entry = new Date().toLocaleTimeString('en', { hour12: false }) + ' ' + msg
    logBuf.current = [entry, ...logBuf.current].slice(0, 30)
    setLog([...logBuf.current])
  }, [])

  // Read push-diag flag from localStorage + react to dev-section toggle
  useEffect(() => {
    setShowFab(localStorage.getItem('nexus_push_diag') === '1')
    function onFlagChange(e: Event) {
      setShowFab((e as CustomEvent<{ on: boolean }>).detail.on)
    }
    window.addEventListener('nexus-push-diag-change', onFlagChange)
    return () => window.removeEventListener('nexus-push-diag-change', onFlagChange)
  }, [])

  // Read persisted last-push timestamp from Cache API (written by SW even when app is closed)
  useEffect(() => {
    if (!('caches' in window)) return
    caches.open('nexus-push-log')
      .then((cache) => cache.match('/push-log'))
      .then((res) => res?.json() as Promise<{ ts?: number } | undefined>)
      .then((data) => { if (data?.ts) setLastPushCached(data.ts) })
      .catch(() => {})
  }, [])

  // Listen for SW messages so the log updates in real-time.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    function onMsg(ev: MessageEvent) {
      if (ev.data?.type === 'nexus-push-received') {
        const ts = ev.data.ts as number
        setLastPush(ts)
        setLastPushCached(ts)
        pushLog(`✓ push fired — "${String(ev.data.title ?? '').slice(0, 40)}"`)
      }
      if (ev.data?.type === 'nexus-resubscribe') {
        pushLog('↺ resubscribe signal from SW')
      }
    }
    navigator.serviceWorker.addEventListener('message', onMsg)
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [pushLog])

  const checkStatus = useCallback(async () => {
    setChecking(true)
    try {
      let swScript     = 'none'
      let swState      = 'none'
      let subType: SubType = 'none'
      let fullEndpoint = ''

      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        if (regs.length > 0) {
          const active = regs[0].active
          if (active) {
            swState  = active.state
            const url = active.scriptURL
            swScript = url.includes('sw-push') ? 'sw-push.js'
                     : url.includes('/sw.js')   ? 'sw.js (next-pwa!)'
                     : url.split('/').pop() ?? url
          }
          try {
            const reg = await navigator.serviceWorker.ready
            const sub = await reg.pushManager.getSubscription()
            if (sub) {
              fullEndpoint = sub.endpoint
              subType      = fullEndpoint.includes('web.push.apple.com') ? 'apns'
                           : fullEndpoint.includes('fcm.googleapis.com')  ? 'fcm'
                           : 'unknown'
            }
          } catch { /* getSubscription can throw on some iOS versions */ }
        }
      }

      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      let dbCount  = -1
      let inDB: boolean | null = null
      let mutedCrews: MutedCrew[] = []
      let dbSubs:    SubRow[]    = []
      let dbError:   string | null = null

      if (session?.access_token) {
        try {
          const epParam = fullEndpoint ? `?ep=${encodeURIComponent(fullEndpoint)}` : ''
          const res  = await fetch(`/api/test/push${epParam}`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          })
          const data = await res.json() as {
            subs_in_db?:          number
            has_current_endpoint?: boolean | null
            muted_crews?:         MutedCrew[]
            endpoints?:           SubRow[]
            subs_error?:          string | null
          }
          dbCount    = data.subs_in_db ?? 0
          inDB       = data.has_current_endpoint ?? null
          mutedCrews = data.muted_crews ?? []
          dbSubs     = data.endpoints   ?? []
          dbError    = data.subs_error  ?? null
        } catch (e) { dbError = String(e).slice(0, 80) }
      }

      setStatus({
        swScript, swState, subType,
        endpoint:     fullEndpoint ? fullEndpoint.slice(-28) : '—',
        fullEndpoint,
        dbCount, inDB,
        permission:   'Notification' in window ? Notification.permission : 'unsupported',
        vapidOk:      !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        mutedCrews, dbSubs, dbError,
      })
    } catch (err) {
      setStatus({
        swScript: '—', swState: '—', subType: 'none', endpoint: '—', fullEndpoint: '',
        dbCount: -1, inDB: null, permission: '—', vapidOk: false,
        mutedCrews: [], dbSubs: [], dbError: null,
        error: String(err).slice(0, 120),
      })
    } finally {
      setChecking(false)
    }
  }, [])

  // Auto-check once after FAB becomes visible — fixes grey dot on first load.
  useEffect(() => {
    if (showFab && !didCheck.current) {
      didCheck.current = true
      checkStatus()
    }
  }, [showFab, checkStatus])

  // Re-check when panel opens if status hasn't been fetched yet.
  useEffect(() => {
    if (open && !status && !checking) checkStatus()
  }, [open, status, checking, checkStatus])

  // Re-check whenever PushRefresh (or FORCE RESUB) finishes subscribing.
  // This keeps the dot and panel accurate without polling.
  useEffect(() => {
    function onSubscribed() { checkStatus() }
    window.addEventListener('nexus-push-subscribed', onSubscribed)
    return () => window.removeEventListener('nexus-push-subscribed', onSubscribed)
  }, [checkStatus])

  async function handleForceResub() {
    setResubLoading(true)
    pushLog('→ force resub: wiping DB + browser sub…')
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { pushLog('✗ no session'); return }

      const { error: delErr, count } = await supabase
        .from('push_subscriptions')
        .delete({ count: 'exact' })
        .eq('user_id', session.user.id)

      if (delErr) pushLog(`  DB delete error: ${delErr.message}`)
      else pushLog(`  deleted ${count ?? '?'} DB row(s)`)

      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready
        const existing = await reg.pushManager.getSubscription()
        if (existing) {
          await existing.unsubscribe()
          pushLog('  browser sub unsubscribed')
        } else {
          pushLog('  no browser sub to unsubscribe')
        }
      }

      const sub = await subscribeToPush()
      if (sub) {
        pushLog(`✓ new endpoint saved: …${sub.endpoint.slice(-24)}`)
      } else {
        pushLog('✗ subscribeToPush returned null — check OS permission')
      }

      await checkStatus()
    } catch (err) {
      pushLog(`✗ ${String(err).slice(0, 80)}`)
    } finally {
      setResubLoading(false)
    }
  }

  // Verbose step-by-step subscribe — surfaces the exact error instead of swallowing it.
  async function handleSubscribe() {
    setSubLoading(true)
    pushLog('→ SUBSCRIBE: starting…')
    try {
      // Step 1: session
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { pushLog('✗ no session — cannot save to DB'); return }
      pushLog(`  session uid: ${session.user.id.slice(0, 8)}…`)

      // Step 2: service worker
      const regs = await navigator.serviceWorker.getRegistrations()
      pushLog(`  SW regs: ${regs.length} (scripts: ${regs.map(r => r.active?.scriptURL?.split('/').pop() ?? '?').join(', ')})`)
      if (regs.length === 0) {
        await navigator.serviceWorker.register('/sw-push.js', { scope: '/' })
        pushLog('  registered sw-push.js')
      }
      const reg = await navigator.serviceWorker.ready
      pushLog(`  SW ready: ${reg.active?.scriptURL?.split('/').pop() ?? '?'} state=${reg.active?.state}`)

      // Step 3: existing subscription
      let sub = await reg.pushManager.getSubscription()
      if (sub) {
        pushLog(`  existing sub: …${sub.endpoint.slice(-20)} type=${sub.endpoint.includes('apple.com') ? 'APNs' : 'FCM'}`)
      } else {
        pushLog('  no existing sub')
      }

      // Step 4: VAPID key
      const vapidKeyRaw = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKeyRaw) { pushLog('✗ NEXT_PUBLIC_VAPID_PUBLIC_KEY missing'); return }
      pushLog(`  VAPID key: …${vapidKeyRaw.slice(-10)}`)

      // Step 5: if no existing sub, create one; else try fresh if existing failed before
      if (!sub) {
        pushLog('  calling pushManager.subscribe()…')
        try {
          const padding = '='.repeat((4 - vapidKeyRaw.length % 4) % 4)
          const base64  = (vapidKeyRaw + padding).replace(/-/g, '+').replace(/_/g, '/')
          const raw     = window.atob(base64)
          const key     = new Uint8Array(raw.length)
          for (let i = 0; i < raw.length; i++) key[i] = raw.charCodeAt(i)
          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
          pushLog(`  new sub: …${sub.endpoint.slice(-20)}`)
        } catch (subErr) {
          pushLog(`✗ subscribe() threw: ${String(subErr).slice(0, 120)}`)
          return
        }
      }

      // Step 6: extract keys
      const json   = sub.toJSON()
      const p256dh = json.keys?.p256dh
      const auth   = json.keys?.auth
      if (!p256dh || !auth) { pushLog('✗ subscription has no keys (p256dh/auth)'); return }
      pushLog(`  keys ok: p256dh=…${p256dh.slice(-8)} auth=…${auth.slice(-8)}`)

      // Step 7: delete old row (idempotent)
      const { error: delErr } = await supabase
        .from('push_subscriptions')
        .delete()
        .match({ endpoint: sub.endpoint, user_id: session.user.id })
      if (delErr) pushLog(`  delete err (non-fatal): ${delErr.message}`)
      else pushLog('  old row deleted (or none existed)')

      // Step 8: insert
      const { error: insErr } = await supabase
        .from('push_subscriptions')
        .insert({ user_id: session.user.id, endpoint: sub.endpoint, p256dh, auth })
      if (insErr) {
        pushLog(`✗ INSERT FAILED: ${insErr.message} code=${insErr.code} hint=${insErr.hint ?? '—'}`)
        pushLog('  ^ this is why pushes are not working — fix this error first')
      } else {
        pushLog(`✓ saved to DB! endpoint=…${sub.endpoint.slice(-20)}`)
      }

      await checkStatus()
    } catch (err) {
      pushLog(`✗ unexpected: ${String(err).slice(0, 120)}`)
    } finally {
      setSubLoading(false)
    }
  }

  async function handleSendTest() {
    setTestLoading(true)
    pushLog('→ sending test notification…')
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { pushLog('✗ no session'); return }

      const res  = await fetch('/api/test/push', {
        method:  'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json() as {
        fn_status?: number
        fn_ok?:     boolean
        result?:    unknown
        error?:     string
      }

      // Route-level error (Vercel function crashed)
      if (data.error) {
        pushLog(`✗ route error: ${data.error}`)
        return
      }

      // Always log the edge function HTTP status — 401 here means send-notification
      // was redeployed without --no-verify-jwt and all push will be broken.
      pushLog(`→ fn HTTP ${data.fn_status ?? '?'} fn_ok=${data.fn_ok ?? '?'}`)

      const result = data.result as {
        error?:   string
        status?:  string
        type?:    string
        results?: { status: string; endpoint: string; user_id?: string }[]
      } | string | null

      if (typeof result === 'string') {
        // Raw text response — edge function returned non-JSON (e.g. auth error page)
        pushLog(`✗ fn raw: ${result.slice(0, 120)}`)
        return
      }

      if (result?.error) {
        pushLog(`✗ fn error: ${result.error}`)
        return
      }

      if (result?.status === 'no_subscriptions') {
        pushLog('✗ no subscriptions in DB — tap FORCE RESUB first')
      } else if (result?.results?.some(r => r.status === 'sent')) {
        pushLog('✓ fn sent — close PWA fully (swipe away) then wait ~5s')
      } else if (result?.results?.some(r => r.status === 'expired_deleted')) {
        pushLog('✗ endpoint expired (410) — tap FORCE RESUB')
      } else {
        const summary = result?.results?.map(r => r.status).join(', ')
          ?? JSON.stringify(result).slice(0, 100)
        pushLog(`? fn result: ${summary}`)
      }
    } catch (err) {
      pushLog(`✗ ${String(err).slice(0, 80)}`)
    } finally {
      setTestLoading(false)
    }
  }

  if (!showFab) return null

  const dot = status == null             ? '#71717a'
            : !status.inDB               ? '#ef4444'
            : status.subType === 'apns'  ? '#66bb6a'
            : status.dbCount  === 0      ? '#ef4444'
            : '#ffd700'

  return (
    <>
      {/* Floating pill — always visible in dev mode */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed right-3 z-[70] flex items-center gap-1.5 px-2.5 py-1.5 select-none"
        style={{
          bottom:       'calc(env(safe-area-inset-bottom, 0px) + 72px)',
          background:   'rgba(10,6,18,0.92)',
          border:       '1px solid rgba(168,85,247,0.5)',
          borderRadius: 4,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0, display: 'block' }} />
        <span className="font-pixel" style={{ fontSize: 7, color: '#a855f7', letterSpacing: 1 }}>
          {checking ? '…' : 'PUSH'}
        </span>
      </button>

      {/* Full panel */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[75]"
              style={{ background: 'rgba(0,0,0,0.5)' }}
              onClick={() => setOpen(false)}
            />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              className="fixed inset-x-0 bottom-0 z-[80] flex flex-col"
              style={{
                maxHeight:  '80vh',
                background: '#0a0612',
                borderTop:  '1px solid rgba(168,85,247,0.5)',
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
                <span className="font-pixel" style={{ fontSize: 9, color: '#a855f7' }}>PUSH DIAGNOSTICS</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={checkStatus}
                    disabled={checking}
                    className="font-pixel px-2 py-1.5 border border-border disabled:opacity-40"
                    style={{ fontSize: 7, color: '#ffd700' }}
                  >
                    {checking ? '…' : 'REFRESH'}
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    className="font-pixel px-2 py-1.5 border border-border text-tertiary"
                    style={{ fontSize: 7 }}
                  >
                    CLOSE
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto flex-1 px-4 py-3 space-y-4">

                {/* Status rows */}
                <div className="space-y-1.5">
                  {status ? (
                    <>
                      <StatusRow label="SW"        value={`${status.swScript} · ${status.swState}`}   ok={status.swScript === 'sw-push.js'} warn={status.swScript.includes('next-pwa')} />
                      <StatusRow label="Sub"       value={status.subType}                              ok={status.subType === 'apns'} warn={status.subType === 'fcm' || status.subType === 'unknown'} />
                      <StatusRow label="…endpoint" value={status.endpoint}                             ok={status.subType !== 'none'} mono />
                      <StatusRow label="In DB"     value={status.inDB === true ? 'YES ✓' : status.inDB === false ? 'NO ✗ — tap FORCE RESUB' : '?'}
                        ok={status.inDB === true} warn={status.inDB === null} />
                      <StatusRow label="DB rows"   value={`${status.dbCount < 0 ? '?' : status.dbCount} endpoint${status.dbCount !== 1 ? 's' : ''}`} ok={status.dbCount === 1} warn={status.dbCount > 1 || status.dbCount < 0} />
                      <StatusRow label="OS perm"   value={status.permission}                           ok={status.permission === 'granted'} />
                      <StatusRow label="VAPID"     value={status.vapidOk ? 'key in env' : 'MISSING!'}  ok={status.vapidOk} />

                      {/* Per-subscription age rows */}
                      {status.dbSubs.map((sub, i) => (
                        <StatusRow
                          key={i}
                          label={i === 0 ? 'Sub saved' : `Sub ${i + 1}`}
                          value={`${formatAge(sub.created_at)} · …${sub.endpoint_tail} · ${sub.is_apns ? 'APNs' : 'FCM'}`}
                          ok={sub.is_apns}
                          mono
                        />
                      ))}

                      {status.dbError && (
                        <StatusRow label="DB err" value={status.dbError} ok={false} />
                      )}

                      {status.mutedCrews.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          <span className="font-sans" style={{ fontSize: 10, color: '#ef4444' }}>
                            MSGS MUTED in {status.mutedCrews.length} crew{status.mutedCrews.length !== 1 ? 's' : ''} — tap bell in chat to fix:
                          </span>
                          {status.mutedCrews.map((c) => (
                            <p key={c.crew_id} className="font-sans pl-2" style={{ fontSize: 10, color: '#ffd700' }}>
                              · {c.crew_name}
                            </p>
                          ))}
                        </div>
                      )}

                      {(lastPushCached || lastPush) && (
                        <StatusRow
                          label="Last push"
                          value={new Date(lastPush ?? lastPushCached!).toLocaleTimeString()}
                          ok
                        />
                      )}

                      {status.error && (
                        <p className="font-sans break-all" style={{ fontSize: 10, color: '#ef4444' }}>{status.error}</p>
                      )}
                    </>
                  ) : (
                    <p className="font-sans text-tertiary" style={{ fontSize: 11 }}>
                      {checking ? 'Checking…' : 'Tap REFRESH to load status.'}
                    </p>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={handleForceResub}
                    disabled={resubLoading}
                    className="flex-1 h-9 font-pixel border disabled:opacity-40"
                    style={{ fontSize: 7, color: '#00e5ff', borderColor: 'rgba(0,229,255,0.35)', background: 'rgba(0,229,255,0.06)' }}
                  >
                    {resubLoading ? '…' : 'FORCE RESUB'}
                  </button>
                  <button
                    onClick={handleSendTest}
                    disabled={testLoading}
                    className="flex-1 h-9 font-pixel border disabled:opacity-40"
                    style={{ fontSize: 7, color: '#a855f7', borderColor: 'rgba(168,85,247,0.35)', background: 'rgba(168,85,247,0.06)' }}
                  >
                    {testLoading ? '…' : 'SEND TEST'}
                  </button>
                </div>

                {/* SUBSCRIBE button — verbose step-by-step, reveals the exact DB error */}
                <button
                  onClick={handleSubscribe}
                  disabled={subLoading}
                  className="w-full h-9 font-pixel border disabled:opacity-40"
                  style={{ fontSize: 7, color: '#ffd700', borderColor: 'rgba(255,215,0,0.35)', background: 'rgba(255,215,0,0.06)' }}
                >
                  {subLoading ? '…' : 'SUBSCRIBE (VERBOSE)'}
                </button>

                <p className="font-sans" style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                  FORCE RESUB wipes DB + browser sub then re-subscribes. SUBSCRIBE (VERBOSE) runs each step with full error logging — use this first when &quot;In DB: NO&quot; to see exactly where it fails. After SEND TEST, swipe the app away completely.
                </p>

                {/* If fn HTTP 401 was logged, show the likely fix */}
                {log.some(l => l.includes('fn HTTP 401')) && (
                  <div className="p-2" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)' }}>
                    <p className="font-pixel" style={{ fontSize: 7, color: '#ef4444' }}>EDGE FUNCTION AUTH ERROR</p>
                    <p className="font-sans mt-1" style={{ fontSize: 10, color: '#ffd700' }}>
                      send-notification was likely redeployed without --no-verify-jwt. Run:
                    </p>
                    <p className="font-sans mt-0.5 break-all" style={{ fontSize: 9, color: '#e4e4e7' }}>
                      supabase functions deploy send-notification --project-ref tlveyeisjbythssmocth --no-verify-jwt
                    </p>
                  </div>
                )}

                {/* Live log */}
                {log.length > 0 && (
                  <div>
                    <p className="font-pixel mb-1.5" style={{ fontSize: 7, color: '#71717a' }}>LOG</p>
                    <div className="space-y-0.5">
                      {log.map((entry, i) => (
                        <p key={i} className="font-sans break-all leading-snug" style={{ fontSize: 10, color: i === 0 ? '#e4e4e7' : '#71717a' }}>
                          {entry}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

function StatusRow({
  label, value, ok, warn, mono,
}: {
  label: string
  value: string
  ok?:   boolean
  warn?: boolean
  mono?: boolean
}) {
  const color = ok ? '#66bb6a' : warn ? '#ffd700' : '#ef4444'
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-sans flex-shrink-0" style={{ fontSize: 10, color: '#71717a', minWidth: 56 }}>{label}</span>
      <span className="font-sans" style={{ fontSize: mono ? 10 : 11, color, wordBreak: 'break-all' }}>
        {value}
      </span>
    </div>
  )
}
