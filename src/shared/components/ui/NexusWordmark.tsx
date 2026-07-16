'use client'

import { useEffect, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { Transition } from 'framer-motion'
import { clsx } from 'clsx'

// Figma 541:2106 "home - screen" — stacked NEXUS wordmark converge effect.
// Keyframe shape (times/ease) preserved verbatim from Figma's motion export;
// `durationS` rescales the whole pass to fit real elapsed load time instead
// of Figma's fixed 0.8s loop — see HomeLoadingGate, which measures actual
// load time and never repeats the clip.
//
// The Figma source animates the frame's row-gap from 8px to -40px, but CSS
// `gap` can't go negative — reproduced here as translateY on the outer two
// rows instead (their motion is mathematically equivalent: the middle row's
// center never moves, each outer row shifts by exactly |Δgap| toward it).
const ROW_SHIFT_PX = 48 // |finalGap(-40) - initialGap(8)|

// Module-level constants (not recreated per render) so Framer Motion always
// sees the same `animate` target array reference across re-renders.
const OUTER_DOWN_KEYFRAMES = [0, ROW_SHIFT_PX, ROW_SHIFT_PX]
const OUTER_UP_KEYFRAMES = [0, -ROW_SHIFT_PX, -ROW_SHIFT_PX]
const MIDDLE_COLOR_KEYFRAMES = [
  'rgba(250, 250, 250, 0)',
  'rgba(250, 250, 250, 0)',
  'rgba(250, 250, 250, 0)',
  '#FAFAFA',
]
const REST_Y = { y: 0 }
const SOLID_COLOR = { color: '#FAFAFA' }

function outerRowTransition(durationS: number): Transition {
  return {
    duration: durationS,
    times: [0, 0.4999, 1],
    ease: [[0.5, 0, 0.5, 1], 'linear'],
  }
}

function middleRowTransition(durationS: number): Transition {
  return {
    duration: durationS,
    times: [0, 0.4411, 0.4412, 0.4787],
    ease: ['linear', 'linear', [0.5, 0, 0.5, 1]],
  }
}

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

export function NexusWordmark({
  className,
  durationS = 0.8,
  onComplete,
}: {
  className?: string
  /** Total length of the single convergence pass, in seconds. */
  durationS?: number
  /** Fires once the pass finishes and the wordmark is holding its converged/solid frame. */
  onComplete?: () => void
}) {
  const reduceMotion = useReducedMotion()

  // Stable object references across re-renders (e.g. HomeClient re-rendering
  // for unrelated reasons while this is playing) so Framer Motion never sees
  // a new `transition` for the same in-progress animation.
  const outerTransition = useMemo(() => outerRowTransition(durationS), [durationS])
  const middleTransition = useMemo(() => middleRowTransition(durationS), [durationS])

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
        initial={REST_Y}
        animate={reduceMotion ? REST_Y : { y: OUTER_DOWN_KEYFRAMES }}
        transition={reduceMotion ? undefined : outerTransition}
      >
        NEXUS
      </motion.p>
      <motion.p
        style={wordmarkTextStyle}
        initial={{ color: 'rgba(250, 250, 250, 0)' }}
        animate={reduceMotion ? SOLID_COLOR : { color: MIDDLE_COLOR_KEYFRAMES }}
        transition={reduceMotion ? undefined : middleTransition}
        onAnimationComplete={reduceMotion ? undefined : onComplete}
      >
        NEXUS
      </motion.p>
      <motion.p
        style={{ ...wordmarkTextStyle, color: 'transparent' }}
        initial={REST_Y}
        animate={reduceMotion ? REST_Y : { y: OUTER_UP_KEYFRAMES }}
        transition={reduceMotion ? undefined : outerTransition}
      >
        NEXUS
      </motion.p>
    </div>
  )
}
