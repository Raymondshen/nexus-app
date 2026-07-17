'use client'

import { useEffect, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { Transition } from 'framer-motion'
import { clsx } from 'clsx'

// Figma 544:2720 "home - screen" — stacked NEXUS wordmark flicker effect.
// Three identical "NEXUS" rows sit stacked (flex-col, gap 8px) and never
// move; only their opacity crossfades in a staggered sequence (top outline
// → middle solid fill → bottom outline → settle on solid middle), giving a
// scanning flicker instead of the previous version's converging slide.
// Keyframe shape (times/ease) preserved verbatim from Figma's motion export,
// which loops every 0.8s — but this component still plays it as a single
// pass rescaled to `durationS` (never repeats), same contract as before, so
// HomeLoadingGate's "scale to real load time, fire onComplete once" logic
// needs no changes.
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

// Module-level constants (not recreated per render) so Framer Motion always
// sees the same `animate` target array reference across re-renders.
const TOP_OPACITY_KEYFRAMES    = [0, 1, 0, 0]
const MIDDLE_OPACITY_KEYFRAMES = [0, 0, 1, 1]
const BOTTOM_OPACITY_KEYFRAMES = [0, 0, 1, 0, 0]
const HIDDEN  = { opacity: 0 }
const VISIBLE = { opacity: 1 }

function topRowTransition(durationS: number): Transition {
  return {
    duration: durationS,
    times: [0, 0.25, 0.4999, 1],
    ease: [[0.5, 0, 0.5, 1], [0.5, 0, 0.5, 1], 'linear'],
  }
}

function middleRowTransition(durationS: number): Transition {
  return {
    duration: durationS,
    times: [0, 0.4999, 0.7499, 1],
    ease: ['linear', [0.5, 0, 0.5, 1], 'linear'],
  }
}

function bottomRowTransition(durationS: number): Transition {
  return {
    duration: durationS,
    times: [0, 0.25, 0.4999, 0.7499, 1],
    ease: ['linear', [0.5, 0, 0.5, 1], [0.5, 0, 0.5, 1], 'linear'],
  }
}

export function NexusWordmark({
  className,
  durationS = 0.8,
  onComplete,
}: {
  className?: string
  /** Total length of the single flicker pass, in seconds. */
  durationS?: number
  /** Fires once the pass finishes and the wordmark is holding its solid resting frame. */
  onComplete?: () => void
}) {
  const reduceMotion = useReducedMotion()

  // Stable object references across re-renders (e.g. HomeClient re-rendering
  // for unrelated reasons while this is playing) so Framer Motion never sees
  // a new `transition` for the same in-progress animation.
  const topTransition    = useMemo(() => topRowTransition(durationS), [durationS])
  const middleTransition = useMemo(() => middleRowTransition(durationS), [durationS])
  const bottomTransition = useMemo(() => bottomRowTransition(durationS), [durationS])

  // Reduced motion renders the resting frame directly and never runs
  // framer-motion's onAnimationComplete — signal "done" immediately so a
  // caller (e.g. HomeLoadingGate) isn't stuck waiting on it.
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
