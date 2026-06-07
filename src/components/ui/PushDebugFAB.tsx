'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { subscribeToPush } from '@/lib/notifications'

type SubType = 'apns' | 'fcm' | 'unknown' | 'none'

interface Status {
  swScript:    string
  swState:     string
  subType:     SubType
  endpoint:    string   // last 28 chars for display
  fullEndpoint: string  // full URL for DB comparison
  dbCount:     number
  inDB:        boolean | null  // null = could not check
  permission:  string
  vapidOk:     boolean
  error?:      string
}

export function PushDebugFAB() {
  const [devMode,      setDevMode]      = useState(false)
  const [open,         setOpen]         = useState(false)
  const [status,       setStatus]       = useState<Status | null>(null)
  const [checking,     setChecking]     = useState(false)
  const [resubLoading, setResubLoading] = useState(false)
  const [testLoading,  setTestLoading]  = useState(false)
  const [log,          setLog]          = useState<string[]>([])
  const [lastPush,     setLastPush]     = useState<number | null>(null)
  const logBuf = useRef<string[]>([])

  const pushLog = useCallback((msg: string) => {
    const entry = new Date().toLocaleTimeString('en', { hour12: false }) + ' ' + msg
    logBuf.current = [entry, ...logBuf.current].slice(0, 30)
    setLog([...logBuf.current])
  }, [])

  useEffect(() => {
    setDevMode(localStorage.getItem('nexus_dev_mode') === '1')
  }, [])

  // Listen for SW messages so the log updates in real-time.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    function onMsg(ev: MessageEvent) {
      if (ev.data?.type === 'nexus-push-received') {
        setLastPush(ev.data.ts as number)
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
                     : url.includes('/sw.js')   ? 'sw.js (next-pwa)'
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
      let dbCount = -1
      let inDB: boolean | null = null
      if (session?.access_token) {
        try {
          // Pass the current endpoint so the API can cross-check it against DB rows.
          const epParam = fullEndpoint ? `?ep=${encodeURIComponent(fullEndpoint)}` : ''
          const res  = await fetch(`/api/test/push${epParam}`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          })
          const data = await res.json() as { subs_in_db?: number; has_current_endpoint?: boolean | null }
          dbCount = data.subs_in_db ?? 0
          inDB    = data.has_current_endpoint ?? null
        } catch { /* network failure */ }
      }

      setStatus({
        swScript,
        swState,
        subType,
        endpoint:     fullEndpoint ? fullEndpoint.slice(-28) : '—',
        fullEndpoint,
        dbCount,
        inDB,
        permission:   'Notification' in window ? Notification.permission : 'unsupported',
        vapidOk:      !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      })
    } catch (err) {
      setStatus({
        swScript: '—', swState: '—', subType: 'none', endpoint: '—', fullEndpoint: '',
        dbCount: -1, inDB: null, permission: '—', vapidOk: false,
        error: String(err).slice(0, 120),
      })
    } finally {
      setChecking(false)
    }
  }, [])

  // Auto-check when panel opens for the first time.
  useEffect(() => {
    if (open && !status && !checking) checkStatus()
  }, [open, status, checking, checkStatus])

  async function handleForceResub() {
    setResubLoading(true)
    pushLog('→ force resub: wiping DB + browser sub…')
    try {
      // Step 1: delete ALL push_subscriptions for this user in the DB so stale
      // endpoints from previous devices/sessions don't accumulate.
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { pushLog('✗ no session'); return }

      const { error: delErr, count } = await supabase
        .from('push_subscriptions')
        .delete({ count: 'exact' })
        .eq('user_id', session.user.id)

      if (delErr) pushLog(`  DB delete error: ${delErr.message}`)
      else pushLog(`  deleted ${count ?? '?'} DB row(s)`)

      // Step 2: unsubscribe the browser-side push subscription.
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

      // Step 3: create a fresh subscription and save it to DB.
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
        result?: { results?: { status: string; endpoint: string }[]; status?: string }
        error?: string
      }
      if (data.error) { pushLog(`✗ route: ${data.error}`); return }
      const results = data.result?.results ?? []
      if (data.result?.status === 'no_subscriptions') {
        pushLog('✗ no subscriptions in DB — tap FORCE RESUB first')
      } else if (results.some(r => r.status === 'sent')) {
        pushLog('✓ sent — check notification tray (close app first on iOS)')
      } else {
        const summary = results.map(r => r.status).join(', ') || JSON.stringify(data.result).slice(0, 80)
        pushLog(`? ${summary}`)
      }
    } catch (err) {
      pushLog(`✗ ${String(err).slice(0, 80)}`)
    } finally {
      setTestLoading(false)
    }
  }

  if (!devMode) return null

  const dot = status == null          ? '#71717a'
            : status.subType === 'apns' ? '#66bb6a'
            : status.dbCount  === 0     ? '#ef4444'
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
        <span className="font-pixel" style={{ fontSize: 7, color: '#a855f7', letterSpacing: 1 }}>PUSH</span>
      </button>

      {/* Full panel */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
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
                maxHeight:  '72vh',
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
                      <StatusRow label="SW"       value={`${status.swScript} · ${status.swState}`}   ok={status.swScript !== 'none'} />
                      <StatusRow label="Sub"      value={status.subType}                              ok={status.subType === 'apns'} warn={status.subType === 'fcm' || status.subType === 'unknown'} />
                      <StatusRow label="…endpoint" value={status.endpoint}                            ok={status.subType !== 'none'} mono />
                      <StatusRow label="In DB"    value={status.inDB === true ? 'YES ✓' : status.inDB === false ? 'NO ✗ — tap FORCE RESUB' : '?'}
                        ok={status.inDB === true} warn={status.inDB === null} />
                      <StatusRow label="DB rows"  value={`${status.dbCount < 0 ? '?' : status.dbCount} endpoint${status.dbCount !== 1 ? 's' : ''}`} ok={status.dbCount === 1} warn={status.dbCount > 1 || status.dbCount < 0} />
                      <StatusRow label="OS perm"  value={status.permission}                           ok={status.permission === 'granted'} />
                      <StatusRow label="VAPID"    value={status.vapidOk ? 'configured' : 'MISSING!'} ok={status.vapidOk} />
                      {lastPush && (
                        <StatusRow label="Last push" value={new Date(lastPush).toLocaleTimeString()} ok />
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

                <p className="font-sans" style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
                  FORCE RESUB wipes all DB rows for your account, unsubscribes, then creates one clean endpoint. Use when &quot;In DB: NO&quot; or &quot;DB rows: 5&quot;. After SEND TEST, fully close the app (swipe away) to see the banner on iOS.
                </p>

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
      <span className={mono ? 'font-sans' : 'font-sans'} style={{ fontSize: mono ? 10 : 11, color, wordBreak: 'break-all' }}>
        {value}
      </span>
    </div>
  )
}
