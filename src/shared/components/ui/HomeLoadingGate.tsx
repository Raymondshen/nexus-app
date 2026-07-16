'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { NexusWordmark } from './NexusWordmark'

// Session-scoped: the splash plays once per tab, not on every return trip to
// /home (e.g. tapping back from a squad) — matches nexus_chat_from and other
// one-shot sessionStorage flags elsewhere in the app.
const SPLASH_SEEN_KEY = 'nexus_home_splash_shown'
const MIN_ANIM_MS = 500   // shortest the wordmark ever plays, even on a near-instant mount
const MAX_ANIM_MS = 2400  // caps the pass so a slow load doesn't play out in slow motion
const SETTLE_MS = 500     // beat to let the converged frame register before fading
const FADE_DURATION_S = 0.7

// Computed once via useState's lazy initializer, not an effect — NexusWordmark
// then mounts with its final duration on the very first render, so there's no
// follow-up prop change for Framer Motion to reconcile mid-flight (that was
// the earlier bug: durationS started at a placeholder and got corrected a
// tick later, which froze the animation instead of playing it). This is safe
// to diverge between server and client renders because it only affects
// animation *timing*, never the rendered DOM shape — unlike `visible` below,
// which does affect DOM shape and must stay hydration-safe via the effect.
function computeDurationS(): number {
  if (typeof window === 'undefined') return MIN_ANIM_MS / 1000
  const elapsedMs = Math.min(MAX_ANIM_MS, Math.max(MIN_ANIM_MS, performance.now()))
  return elapsedMs / 1000
}

// Wraps HomeClient's content with the NEXUS splash from Figma 544:2720.
// By the time HomeClient mounts, the server component (`home/page.tsx`) has
// already awaited crews + message previews — `performance.now()` at that
// point is how long that actually took since navigation start, so the
// wordmark plays a single pass scaled to the real load time instead of
// looping a canned clip while an arbitrary timer runs out.
// `home/loading.tsx` renders the same wordmark as the Suspense fallback while
// the server request is in flight, so the handoff into this gate is a no-op
// visual swap (both screens are pixel-identical), and the fade-out here is
// what's actually visible to the user.
export function HomeLoadingGate({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(true)
  const [fading, setFading] = useState(false)
  const [durationS] = useState(computeDurationS)
  const sessionCheckedRef = useRef(false)

  // React 18 Strict Mode (on by default for `next dev`) double-invokes this
  // effect on mount — synthetic mount → cleanup → mount again, same instance.
  // Without this ref guard, the first invocation's sessionStorage.setItem is
  // visible to the second invocation's getItem, so it immediately reads back
  // "already seen" and calls setVisible(false) before the first paint — the
  // splash never gets a chance to render in dev. The ref survives the
  // synthetic remount (unlike sessionStorage, whose read/write isn't
  // idempotent across the two calls); production builds don't double-invoke,
  // so this only ever mattered in dev, but the guard is correct either way.
  useLayoutEffect(() => {
    if (sessionCheckedRef.current) return
    sessionCheckedRef.current = true

    if (sessionStorage.getItem(SPLASH_SEEN_KEY)) {
      setVisible(false)
      return
    }
    sessionStorage.setItem(SPLASH_SEEN_KEY, '1')
  }, [])

  return (
    <>
      {children}
      {visible && (
        <motion.div
          className="fixed inset-0 z-[200] bg-black flex items-center justify-center"
          style={{ pointerEvents: fading ? 'none' : 'auto' }}
          initial={{ opacity: 1 }}
          animate={{ opacity: fading ? 0 : 1 }}
          transition={{ duration: FADE_DURATION_S, ease: 'easeInOut' }}
          onAnimationComplete={() => { if (fading) setVisible(false) }}
        >
          <NexusWordmark
            durationS={durationS}
            onComplete={() => setTimeout(() => setFading(true), SETTLE_MS)}
          />
        </motion.div>
      )}
    </>
  )
}
