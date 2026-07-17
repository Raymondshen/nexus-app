'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { NexusWordmark, NEXUS_WORDMARK_NATURAL_DURATION_MS } from './NexusWordmark'

// Session-scoped: the splash plays once per tab on initial mount, not on
// every return trip to /home (e.g. tapping back from a squad) — matches
// nexus_chat_from and other one-shot sessionStorage flags elsewhere in the
// app. This gate only covers the *mount* trigger; the background/foreground
// resume trigger below is separate and can replay the splash even after this
// has already fired once this session.
const SPLASH_SEEN_KEY = 'nexus_home_splash_shown'
const MIN_ANIM_MS = 500                             // shortest the wordmark ever plays, even on a near-instant load
const MAX_ANIM_MS = NEXUS_WORDMARK_NATURAL_DURATION_MS  // caps the pass at Figma's native cycle length so a slow load doesn't play out in slow motion
const SETTLE_MS = 500     // beat to let the finished pass register before fading
const FADE_DURATION_S = 0.7

// A hidden→visible flip shorter than this reads as a fleeting interruption
// (OS permission sheet, notification-shade peek, share-sheet return) rather
// than the user deliberately backgrounding the app and reopening it — only
// the latter replays the splash. iOS PWAs that get fully killed while
// backgrounded reload from scratch (sessionStorage clears — see CLAUDE.md),
// so they already replay the splash via the mount path above; this timer is
// what covers Android/desktop PWAs that merely suspend in the background and
// resume the same JS context on return.
const BACKGROUND_REPLAY_THRESHOLD_MS = 5000

// elapsedMs is how long the thing the wordmark is standing in for actually
// took: time since navigation start on first mount, or ~0 on a background
// resume (nothing to await there — content is already mounted). Clamping
// it into [MIN_ANIM_MS, MAX_ANIM_MS] is the "run the full animation on a
// fast load, stretch it to match a slow one" rule: a near-instant load still
// gets the guaranteed minimum pass, and a slow load never stretches past
// Figma's native cycle length.
function clampDurationMs(elapsedMs: number): number {
  return Math.min(MAX_ANIM_MS, Math.max(MIN_ANIM_MS, elapsedMs))
}

// Computed once via useState's lazy initializer, not an effect — NexusWordmark
// then mounts with its final duration on the very first render, so there's no
// follow-up prop change for Framer Motion to reconcile mid-flight (that was
// the earlier bug: durationS started at a placeholder and got corrected a
// tick later, which froze the animation instead of playing it). This is safe
// to diverge between server and client renders because it only affects
// animation *timing*, never the rendered DOM shape — unlike `visible` below,
// which does affect DOM shape and must stay hydration-safe via the effect.
function computeInitialDurationS(): number {
  if (typeof window === 'undefined') return MIN_ANIM_MS / 1000
  return clampDurationMs(performance.now()) / 1000
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
  const [durationS, setDurationS] = useState(computeInitialDurationS)
  // Bumped on a background-resume replay to force NexusWordmark and the
  // overlay to remount with fresh Framer Motion instances instead of
  // reconciling into a completed (or mid-fade) one — see the note on
  // `durationS` above about why props can't just change on a live instance.
  const [playToken, setPlayToken] = useState(0)
  const sessionCheckedRef = useRef(false)
  const hiddenAtRef = useRef<number | null>(null)

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

  // Replays the splash when the app is backgrounded and reopened (Android/
  // desktop PWA suspend-and-resume, which keeps this same JS context alive —
  // no remount, so the mount-time gate above never re-fires on its own).
  // Nothing is actually awaited on resume (content is already mounted), so
  // the "load" here is ~0ms — clampDurationMs floors that to MIN_ANIM_MS,
  // i.e. the guaranteed full natural-speed pass, same as a fast first load.
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = performance.now()
        return
      }
      if (document.visibilityState !== 'visible') return
      const hiddenAt = hiddenAtRef.current
      hiddenAtRef.current = null
      if (hiddenAt === null) return
      if (performance.now() - hiddenAt < BACKGROUND_REPLAY_THRESHOLD_MS) return

      setDurationS(clampDurationMs(0) / 1000)
      setFading(false)
      setVisible(true)
      setPlayToken((n) => n + 1)
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  return (
    <>
      {children}
      {visible && (
        <motion.div
          key={playToken}
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
