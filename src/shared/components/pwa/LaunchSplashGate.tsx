'use client'

import { useState, useSyncExternalStore } from 'react'
import { motion } from 'framer-motion'
import { LaunchSplashContent } from './LaunchSplashContent'

const FADE_DURATION_S = 0.7
// Beat to let the fully-filled resting frame register before fading — same
// convention the old HomeLoadingGate's SETTLE_MS used.
const SETTLE_MS = 1000

// "Ready" as an external store (document.readyState + the `load` event) rather
// than a `useEffect` that calls `setState` in its body — the React-idiomatic
// way to sync from an external source (see the same reasoning in
// shared/utils/localStorageFlag.ts, which this mirrors). getServerSnapshot
// always returns false (no `document` during SSR), which also sidesteps a
// hydration mismatch.
function getReadySnapshot() {
  return typeof document === 'undefined' ? false : document.readyState === 'complete'
}
function subscribeReady(onStoreChange: () => void) {
  window.addEventListener('load', onStoreChange)
  return () => window.removeEventListener('load', onStoreChange)
}
function getServerReadySnapshot() {
  return false
}

// Mounted once in (app)/layout.tsx, alongside SWRegister and the other
// always-mounted app-wide widgets (GuestBanner, InstallPrompt, etc.) — see
// this file's own render tree in (app)/layout.tsx. Layouts persist across
// client-side navigation (Next.js never remounts a shared layout just because
// the page underneath it changed), so this component's own mount effect only
// ever fires on a genuine hard load: the very first launch into the app, or
// SWRegister's silent `window.location.reload()` after a new deploy's service
// worker takes control (see SWRegister's own doc comment for why that reload
// happens) — exactly the two triggers this was built for, with no extra
// sessionStorage gating needed. (Contrast the old HomeLoadingGate this
// replaces, which lived inside /home's own leaf page and so DID need a
// session flag to avoid re-showing on every plain revisit to /home — a
// persistent layout doesn't have that problem: it isn't remounted on ordinary
// navigation in the first place.)
//
// "Ready" = the browser's own `load` event — every subresource (images,
// fonts, the initial RSC payload) has arrived, not just this layout's own JS.
// Chosen over waiting on any specific page's own data-fetch (what
// HomeLoadingGate did, scoped to /home's server component) since this gate
// has to work uniformly for every route under (app), not just one page's own
// timing.
export function LaunchSplashGate() {
  const [visible, setVisible] = useState(true)
  const [fading,  setFading]  = useState(false)
  const finish = useSyncExternalStore(subscribeReady, getReadySnapshot, getServerReadySnapshot)

  if (!visible) return null

  return (
    <motion.div
      className="fixed inset-0 z-[200] bg-black flex items-center justify-center"
      style={{ pointerEvents: fading ? 'none' : 'auto' }}
      initial={{ opacity: 1 }}
      animate={{ opacity: fading ? 0 : 1 }}
      transition={{ duration: FADE_DURATION_S, ease: 'easeInOut' }}
      onAnimationComplete={() => { if (fading) setVisible(false) }}
    >
      <LaunchSplashContent finish={finish} onFinished={() => setTimeout(() => setFading(true), SETTLE_MS)} />
    </motion.div>
  )
}
