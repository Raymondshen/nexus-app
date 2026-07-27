'use client'

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/shared/supabase/client'
import { makeLocalStorageFlagStore, getServerFlagSnapshotFalse } from '@/shared/utils/localStorageFlag'

// Dev feature flag — read via useSyncExternalStore (see makeLocalStorageFlagStore's
// own doc comment for why an effect-body setState isn't the React-idiomatic way to
// sync from an external store like localStorage).
const PUSH_DIAG_STORE = makeLocalStorageFlagStore('nexus_push_diag', 'nexus-push-diag-change')

type SubType = 'apns' | 'fcm' | 'unknown' | 'none'

interface Status {
  subType: SubType
  dbCount: number
  inDB:    boolean | null
}

// Always-visible floating pill (dev mode only) — an ambient glance at the
// current device's own push status without leaving whatever screen you're on.
// Tapping it opens the full multi-user diagnostics page (Developer Settings →
// Manage Notification Subscription) rather than a self-contained panel — that
// page now owns every action this FAB used to do inline (force resub, DB row
// inspection, issue detection), fed by real server-side data for every user,
// not just this session's own browser state. Keeping this component down to
// "compute the dot color, navigate on tap" avoids duplicating that page's logic
// in two places.
export function PushDebugFAB() {
  const router  = useRouter()
  const showFab = useSyncExternalStore(PUSH_DIAG_STORE.subscribe, PUSH_DIAG_STORE.getSnapshot, getServerFlagSnapshotFalse)
  const [status,   setStatus]   = useState<Status | null>(null)
  const [checking, setChecking] = useState(false)
  const didCheck = useRef(false)

  const checkStatus = useCallback(async () => {
    setChecking(true)
    try {
      let subType: SubType = 'none'
      let fullEndpoint = ''

      if ('serviceWorker' in navigator) {
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

      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      let dbCount = -1
      let inDB: boolean | null = null

      if (session?.access_token) {
        try {
          const epParam = fullEndpoint ? `?ep=${encodeURIComponent(fullEndpoint)}` : ''
          const res  = await fetch(`/api/test/push${epParam}`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          })
          const data = await res.json() as { subs_in_db?: number; has_current_endpoint?: boolean | null }
          dbCount = data.subs_in_db ?? 0
          inDB    = data.has_current_endpoint ?? null
        } catch { /* leave dbCount/inDB at their unknown defaults */ }
      }

      setStatus({ subType, dbCount, inDB })
    } catch {
      setStatus({ subType: 'none', dbCount: -1, inDB: null })
    } finally {
      setChecking(false)
    }
  }, [])

  // Auto-check once after the FAB becomes visible — fixes grey dot on first load.
  useEffect(() => {
    if (showFab && !didCheck.current) {
      didCheck.current = true
      checkStatus()
    }
  }, [showFab, checkStatus])

  // Re-check whenever PushRefresh (or the diagnostics page's force resub) finishes
  // subscribing, so the dot stays accurate without polling.
  useEffect(() => {
    function onSubscribed() { checkStatus() }
    window.addEventListener('nexus-push-subscribed', onSubscribed)
    return () => window.removeEventListener('nexus-push-subscribed', onSubscribed)
  }, [checkStatus])

  if (!showFab) return null

  const dot = status == null             ? 'var(--color-muted)'
            : !status.inDB               ? '#ef4444'
            : status.subType === 'apns'  ? '#66bb6a'
            : status.dbCount  === 0      ? '#ef4444'
            : '#ffd700'

  return (
    <button
      onClick={() => router.push('/profile/developer/push-diagnostics')}
      className="fixed right-3 z-[70] flex items-center gap-1.5 px-2.5 py-1.5 select-none"
      style={{
        bottom:       'calc(env(safe-area-inset-bottom, 0px) + 72px)',
        background:   'rgba(10,6,18,0.92)',
        border:       '1px solid rgba(168,85,247,0.5)',
        borderRadius: 4,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0, display: 'block' }} />
      <span className="font-pixel" style={{ fontSize: 7, color: 'var(--color-purple)', letterSpacing: 1 }}>
        {checking ? '…' : 'PUSH'}
      </span>
    </button>
  )
}
