'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useMotionValue, useReducedMotion, animate, type AnimationPlaybackControls } from 'framer-motion'

// Figma 544:2721 "home - screen" — the ghost (node 642:8315 "launch 1", spec'd
// 80×80, rendered at 128×128 here per explicit request to size the sprite up
// beyond the literal Figma frame) + "NEXUS" wordmark, both fading from a
// transparent/outline state to fully filled. Figma's own keyframe timeline for
// the text (get_motion_context):
// `color` goes rgba(250,250,250,0) → #FAFAFA over 24.96% of a 2.404s duration,
// then holds solid for the remainder before an abrupt cut back to transparent
// on repeat (Figma's own preview loops this forever). Reproduced here as a
// single `fill` motion value (0..1) driving both the text's fill-layer opacity
// (stacked over a permanent stroke-only outline layer — opacity achieves the
// same "outline visible, solid fades in on top" look without needing literal
// color-string interpolation) and the ghost's own opacity, so both materialize
// in lockstep.
//
// Unlike Figma's endless preview, this doesn't just loop forever: it loops
// ONLY while `finish` is false (the real app is still loading), then smoothly
// completes the LAST fade-in from wherever `fill` currently sits — not from
// scratch — over a fixed 0.2s once `finish` flips true (see LaunchSplashGate,
// which derives `finish` from the browser's own `load` event). Framer
// Motion's imperative `animate()` always starts from a motion value's CURRENT
// live number, so no manual progress-capture is needed: stopping the looping
// animation and starting a new one targeting 1 over 0.2s is what "picks up
// where the last fade-in left off."
const LOOP_S         = 2.404
const FILL_FRACTION  = 0.2496
const LOOP_EASE: [number, number, number, number] = [0.5, 0, 0.5, 1]
const FINISH_S       = 0.2

// Frame-cycling ghost sprite (public/sprites/ghost/launch/launch_0001.webp…0009.webp,
// 1-indexed) — same interval-based frame-swap pattern ChatRoomBrowseSheet's
// SleepingGhost uses for its own 9-frame loop.
const GHOST_FRAME_COUNT = 9
const GHOST_FRAME_MS    = 130

const wordmarkStyle: React.CSSProperties = {
  margin:         0,
  fontFamily:     'var(--font-pixel)',
  fontSize:       40,
  lineHeight:     1,
  letterSpacing:  '4px',
  textAlign:      'center',
  whiteSpace:     'nowrap',
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
  // useReducedMotion() returns `null` on the very first render (unresolved)
  // and only settles to a real boolean shortly after mount, via its own
  // internal matchMedia effect. Coerced to a stable boolean here because the
  // loop/finish effects below depend on this value: without the coercion,
  // `null -> false` (the common case — no reduced-motion preference) still
  // counts as a dependency *change* to React, so those effects fire a second
  // time right after mount, restarting the `fill` animation from wherever it
  // was mid-flight. On a fast/warm load (exactly what a resumed iOS PWA
  // relaunch looks like — service worker already serving from cache) that
  // second run collides with the in-progress fade and visibly pops/flickers.
  // Collapsing `null`/`false` to the same boolean makes that transition a
  // no-op, while a genuine `null -> true` (an actual reduced-motion user)
  // still changes value and fires as intended.
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
    <div className="flex flex-col items-center justify-center" style={{ gap: 'var(--x5)' }}>
      <motion.div className="relative flex-shrink-0" style={{ width: 128, height: 128, opacity: fill }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/sprites/ghost/launch/launch_${String(frame + 1).padStart(4, '0')}.webp`}
          alt=""
          style={{ width: 128, height: 128, objectFit: 'contain', imageRendering: 'pixelated' }}
          aria-hidden="true"
        />
      </motion.div>
      <div className="relative" aria-label="NEXUS">
        {/* Outline layer — always visible, never fades (matches Figma's
            WebkitTextStrokeColor: #FFF starting state, which persists
            underneath the fill the whole time). */}
        <p aria-hidden="true" style={{ ...wordmarkStyle, color: 'transparent', WebkitTextStroke: '1px #FAFAFA' }}>
          NEXUS
        </p>
        {/* Fill layer — opacity-driven by `fill`, stacked exactly on top. */}
        <motion.p
          aria-hidden="true"
          style={{ ...wordmarkStyle, position: 'absolute', inset: 0, color: '#FAFAFA', opacity: fill }}
        >
          NEXUS
        </motion.p>
      </div>
    </div>
  )
}
