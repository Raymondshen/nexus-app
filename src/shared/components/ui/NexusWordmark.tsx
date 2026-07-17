'use client'

import { useEffect, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { Transition } from 'framer-motion'
import { clsx } from 'clsx'

// Figma 544:2720 "home - screen" — stacked NEXUS wordmark flicker effect.
// Three identical "NEXUS" rows sit stacked (flex-col, gap 8px) and never
// move; only their opacity crossfades in a staggered sequence (top outline
// flashes in/out → bottom outline flashes in/out, overlapping its fade →
// middle solid fill fades in then flickers off/on three more times before
// settling back to invisible), giving a scanning-CRT flicker instead of a
// converging slide.
//
// Keyframe times/values/eases below are the exact values from Figma's
// `get_motion_context` export for nodes 544:2722/2723/2724 (native cycle
// 2404ms, `repeat: Infinity` in the source file). This component plays that
// exact per-cycle shape as a SINGLE pass rescaled to `durationS` (never
// repeats) — the infinite loop is a Figma-prototype convenience, not
// something a real splash screen can honor, since the app needs to end the
// pass and hand off to real content once loading is actually done. See
// HomeLoadingGate for how `durationS` is derived from real load time.
//
// Because the native cycle loops seamlessly, ALL three rows are back at
// opacity 0 at t=1 (the loop point) — the pass ends on invisible, not on a
// held "solid middle" frame. That's fine here: the backdrop is pure black,
// so an invisible wordmark and an untouched black backdrop are visually
// identical: the on-screen effect is the flicker cleanly winking out right
// before HomeLoadingGate's fade-to-content beat, not a jump-cut.
const wordmarkTextStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-pixel)',
  fontSize: 40,
  lineHeight: 1,
  letterSpacing: '0.2px',
  textAlign: 'center',
  whiteSpace: 'nowrap',
  WebkitTextStroke: '1px var(--color-primary)',
}

// Native per-cycle duration in Figma (ms) — reused by HomeLoadingGate as the
// ceiling a slow load can stretch a single pass to.
export const NEXUS_WORDMARK_NATURAL_DURATION_MS = 2404

const EASE_STD = [0.5, 0, 0.5, 1] as const

// Module-level constants (not recreated per render) so Framer Motion always
// sees the same `animate` target array reference across re-renders.
const TOP_OPACITY_KEYFRAMES    = [0, 1, 0, 0]
const MIDDLE_OPACITY_KEYFRAMES = [0, 0, 1, 0, 1, 0, 1, 0]
const BOTTOM_OPACITY_KEYFRAMES = [0, 0, 1, 0, 0]
const HIDDEN  = { opacity: 0 }
const VISIBLE = { opacity: 1 }

function topRowTransition(durationS: number): Transition {
  return {
    duration: durationS,
    times: [0, 0.1664, 0.3328, 1],
    ease: [EASE_STD, EASE_STD, 'linear'],
  }
}

function middleRowTransition(durationS: number): Transition {
  return {
    duration: durationS,
    times: [0, 0.3328, 0.4999, 0.5819, 0.666, 0.7504, 0.8327, 1],
    ease: ['linear', EASE_STD, EASE_STD, EASE_STD, EASE_STD, EASE_STD, EASE_STD],
  }
}

function bottomRowTransition(durationS: number): Transition {
  return {
    duration: durationS,
    times: [0, 0.1664, 0.3328, 0.4999, 1],
    ease: ['linear', EASE_STD, EASE_STD, 'linear'],
  }
}

export function NexusWordmark({
  className,
  durationS = NEXUS_WORDMARK_NATURAL_DURATION_MS / 1000,
  onComplete,
}: {
  className?: string
  /** Total length of the single flicker pass, in seconds. */
  durationS?: number
  /** Fires once the pass finishes (all rows back at opacity 0). */
  onComplete?: () => void
}) {
  const reduceMotion = useReducedMotion()

  // Stable object references across re-renders (e.g. HomeClient re-rendering
  // for unrelated reasons while this is playing) so Framer Motion never sees
  // a new `transition` for the same in-progress animation.
  const topTransition    = useMemo(() => topRowTransition(durationS), [durationS])
  const middleTransition = useMemo(() => middleRowTransition(durationS), [durationS])
  const bottomTransition = useMemo(() => bottomRowTransition(durationS), [durationS])

  // Reduced motion renders a held, readable frame (solid middle row) instead
  // of the flicker, and never runs framer-motion's onAnimationComplete —
  // signal "done" immediately so a caller (e.g. HomeLoadingGate) isn't stuck
  // waiting on it.
  useEffect(() => {
    if (reduceMotion) onComplete?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion])

  return (
    <div
      className={clsx('flex flex-col items-center justify-center overflow-hidden', className)}
      style={{ gap: 'var(--x3)' }}
    >
      <motion.p
        style={{ ...wordmarkTextStyle, color: 'transparent' }}
        initial={HIDDEN}
        animate={reduceMotion ? HIDDEN : { opacity: TOP_OPACITY_KEYFRAMES }}
        transition={reduceMotion ? undefined : topTransition}
      >
        NEXUS
      </motion.p>
      <motion.p
        style={{ ...wordmarkTextStyle, color: 'var(--color-primary)' }}
        initial={HIDDEN}
        animate={reduceMotion ? VISIBLE : { opacity: MIDDLE_OPACITY_KEYFRAMES }}
        transition={reduceMotion ? undefined : middleTransition}
        onAnimationComplete={reduceMotion ? undefined : onComplete}
      >
        NEXUS
      </motion.p>
      <motion.p
        style={{ ...wordmarkTextStyle, color: 'transparent' }}
        initial={HIDDEN}
        animate={reduceMotion ? HIDDEN : { opacity: BOTTOM_OPACITY_KEYFRAMES }}
        transition={reduceMotion ? undefined : bottomTransition}
      >
        NEXUS
      </motion.p>
    </div>
  )
}
