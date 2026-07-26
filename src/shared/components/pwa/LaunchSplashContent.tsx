'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { motion, useMotionValue, useReducedMotion, animate, type AnimationPlaybackControls } from 'framer-motion'

// Figma 544:2721 "home - screen" (2026-07 redesign) — a live date row (705:18051,
// Silkscreen xxs tertiary, "Thursday July 28") + the ghost (642:8315 "launch 1",
// spec'd 48×48) + "NEXUS" wordmark (705:17321, DM Sans Black, --text-display 32px,
// -0.64px tracking, uppercase), stacked with an 8px gap. This replaced an earlier
// treatment (Press Start 2P wordmark at 40px/4px-tracking, a 128px oversized ghost,
// and a stroke+fill dual-text-layer trick) that reproduced an OLDER Figma keyframe
// timeline animating the wordmark's color from a transparent/outline state to solid.
// The current node has no motion data at all (`get_motion_context` returns an empty
// node list, recursively) — the canvas is a fully static resting frame now, so the
// stroke layer has no spec to reproduce and was dropped.
//
// The looping "still loading" → "ready" opacity fade below is NOT part of that static
// spec — Figma's canvas can't show a real loading state — but it's a deliberate,
// previously-requested-more-than-once product behavior (see LaunchSplashGate's
// SETTLE_MS/FADE_DURATION_S comments) kept on top of the new visuals rather than
// dropped just because the design file itself is now static. It still only applies to
// the ghost + wordmark (the two elements that materialized together in the old
// design) — the date row is new, unrelated to that timeline, and just renders once
// available.
const LOOP_S         = 2.404
const FILL_FRACTION  = 0.2496
const LOOP_EASE: [number, number, number, number] = [0.5, 0, 0.5, 1]
const FINISH_S       = 0.2

// Frame-cycling ghost sprite (public/sprites/ghost/launch/launch_0001.webp…0009.webp,
// 1-indexed) — same interval-based frame-swap pattern ChatRoomBrowseSheet's
// SleepingGhost uses for its own 9-frame loop.
const GHOST_FRAME_COUNT = 9
const GHOST_FRAME_MS    = 130
const GHOST_PX          = 48

// Live date row — computed client-side only via useSyncExternalStore with a
// never-notifying subscribe and a `null` server snapshot (same convention
// PageFloatButton's own "today's date" label uses) so the splash never has to guess
// the device's timezone/locale during SSR and never risks a hydration mismatch.
// Full weekday + full month + day number, no comma — matches the design's
// "Thursday July 28" placeholder shape (a fixed manual abbreviation table like
// PageFloatButton's MONTH_ABBR/DAY_ABBR isn't needed here since these are full
// names, not stylized 3-letter codes).
function subscribeNever() { return () => {} }
function getDateSnapshot() {
  const now     = new Date()
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' })
  const month   = now.toLocaleDateString('en-US', { month: 'long' })
  return `${weekday} ${month} ${now.getDate()}`
}
function getServerDateSnapshot() {
  return null
}

export function LaunchSplashContent({
  finish,
  onFinished,
}: {
  /** Flips true once the real app is ready — see LaunchSplashGate. */
  finish:      boolean
  /** Fires once the 0.2s finish-the-fade transition completes. */
  onFinished?: () => void
}) {
  const dateLabel = useSyncExternalStore(subscribeNever, getDateSnapshot, getServerDateSnapshot)

  // useReducedMotion() returns `null` on the very first render (unresolved) and only
  // settles to a real boolean shortly after mount, via its own internal matchMedia
  // effect. Coerced to a stable boolean here because the loop/finish effects below
  // depend on this value: without the coercion, `null -> false` (the common case — no
  // reduced-motion preference) still counts as a dependency *change* to React, so
  // those effects fire a second time right after mount, restarting the `fill`
  // animation from wherever it was mid-flight. On a fast/warm load (exactly what a
  // resumed iOS PWA relaunch looks like — service worker already serving from cache)
  // that second run collides with the in-progress fade and visibly pops/flickers.
  // Collapsing `null`/`false` to the same boolean makes that transition a no-op,
  // while a genuine `null -> true` (an actual reduced-motion user) still changes
  // value and fires as intended.
  const reduceMotion = !!useReducedMotion()
  // Safe to diverge between server and client renders — same reasoning the old
  // HomeLoadingGate's computeDurationS() used: this only affects animation
  // *timing*, never the rendered DOM shape.
  const fill = useMotionValue(reduceMotion ? 1 : 0)
  const controlsRef = useRef<AnimationPlaybackControls | null>(null)
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    if (reduceMotion) return
    // Preload every walk-cycle frame before starting the cycle — these are
    // tiny (~250B each) but on a cold Cache Storage (first-ever launch, or an
    // iOS storage-pressure eviction) an un-primed fetch mid-cycle can show a
    // blank frame for a beat, reading as a flicker in the sprite itself.
    for (let i = 1; i <= GHOST_FRAME_COUNT; i++) {
      const img = new window.Image()
      img.src = `/sprites/ghost/launch/launch_${String(i).padStart(4, '0')}.webp`
    }
    const id = setInterval(() => setFrame((f) => (f + 1) % GHOST_FRAME_COUNT), GHOST_FRAME_MS)
    return () => clearInterval(id)
  }, [reduceMotion])

  // Looping breathe while still loading.
  useEffect(() => {
    if (reduceMotion || finish) return
    controlsRef.current = animate(fill, [0, 1, 1], {
      duration: LOOP_S,
      times:    [0, FILL_FRACTION, 1],
      ease:     LOOP_EASE,
      repeat:   Infinity,
    })
    return () => controlsRef.current?.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion, finish])

  // Ready — stop the loop wherever it currently is and finish the last stretch
  // to fully filled over a fixed 0.2s (animate() starts from fill's current
  // live value automatically, not from 0).
  useEffect(() => {
    if (reduceMotion || !finish) return
    controlsRef.current?.stop()
    const controls = animate(fill, 1, { duration: FINISH_S, ease: 'easeOut', onComplete: onFinished })
    controlsRef.current = controls
    return () => controls.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion, finish])

  // Reduced motion renders the resting (fully filled) frame directly and never
  // runs the finish animation above — signal "done" immediately so
  // LaunchSplashGate isn't stuck waiting on onFinished. `fill.set(1)` is
  // required here, not just the `useMotionValue(reduceMotion ? 1 : 0)`
  // initializer above: `reduceMotion` is still `null` (unresolved) on the very
  // first render, before Framer Motion's own layout effect corrects it, so
  // that initializer already locked `fill` at 0 by the time this effect can
  // even see `reduceMotion === true` — without this, a reduced-motion user
  // would never see the ghost/text at all (stuck fully transparent) for
  // however long the splash stays mounted.
  useEffect(() => {
    if (!reduceMotion) return
    fill.set(1)
    onFinished?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion])

  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{
        gap:           'var(--x3)',
        paddingLeft:   'var(--x5)',
        paddingRight:  'var(--x5)',
        paddingTop:    'var(--x15)',
        paddingBottom: 'var(--x15)',
      }}
    >
      {/* Always rendered (never conditionally omitted) so the flex `gap` to the ghost
          below and this row's own box height are reserved from the very first paint —
          `getServerDateSnapshot` returns `null` until the client corrects it post-
          hydration, and an empty `<p>` collapses to 0px height in every browser (no
          "strut" without at least one inline box), so conditionally mounting this
          element on that transition would visibly shift the whole centered group
          downward the instant the real date pops in. `minHeight` covers the 0px-empty
          case; --xxs/leading-none already produces that same height once text lands. */}
      <p
        className="font-silkscreen leading-none text-center"
        style={{ fontSize: 'var(--xxs)', color: 'var(--color-tertiary)', minHeight: 'var(--xxs)' }}
      >
        {dateLabel}
      </p>
      <motion.div className="relative flex-shrink-0" style={{ width: GHOST_PX, height: GHOST_PX, opacity: fill }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/sprites/ghost/launch/launch_${String(frame + 1).padStart(4, '0')}.webp`}
          alt=""
          style={{ width: GHOST_PX, height: GHOST_PX, objectFit: 'contain', imageRendering: 'pixelated' }}
          aria-hidden="true"
        />
      </motion.div>
      <motion.p
        className="font-body font-black uppercase leading-none text-center"
        style={{
          margin:                0,
          fontSize:              'var(--text-display)',
          letterSpacing:         '-0.64px',
          whiteSpace:            'nowrap',
          color:                 'var(--color-primary)',
          fontVariationSettings: '"opsz" 14',
          opacity:               fill,
        }}
      >
        NEXUS
      </motion.p>
    </div>
  )
}
