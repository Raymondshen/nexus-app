'use client'

import { motion, useReducedMotion } from 'framer-motion'
import type { Transition } from 'framer-motion'
import { clsx } from 'clsx'

// Figma 541:2106 "home - screen" — stacked NEXUS wordmark glitch loop.
// Timing/easing preserved verbatim from Figma's motion export (duration 0.8s,
// repeat: Infinity). The Figma source animates the frame's row-gap from 8px to
// -40px, but CSS `gap` cannot go negative — reproduced here as translateY on
// the outer two rows instead (their motion is mathematically equivalent: the
// middle row's center never moves, and each outer row shifts by exactly
// |Δgap| toward it), keeping the same times/ease/duration.
const LOOP_DURATION_S = 0.8
const ROW_SHIFT_PX = 48 // |finalGap(-40) - initialGap(8)|

const OUTER_ROW_TRANSITION: Transition = {
  duration: LOOP_DURATION_S,
  times: [0, 0.4999, 1],
  ease: [[0.5, 0, 0.5, 1], 'linear'],
  repeat: Infinity,
}

const MIDDLE_ROW_TRANSITION: Transition = {
  duration: LOOP_DURATION_S,
  times: [0, 0.4411, 0.4412, 0.4787],
  ease: ['linear', 'linear', [0.5, 0, 0.5, 1]],
  repeat: Infinity,
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

export function NexusWordmark({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion()

  return (
    <div
      className={clsx('flex flex-col items-center justify-center overflow-hidden', className)}
      style={{ gap: 'var(--x3)' }}
    >
      <motion.p
        style={{ ...wordmarkTextStyle, color: 'transparent' }}
        initial={{ y: 0 }}
        animate={reduceMotion ? { y: 0 } : { y: [0, ROW_SHIFT_PX, ROW_SHIFT_PX] }}
        transition={reduceMotion ? undefined : OUTER_ROW_TRANSITION}
      >
        NEXUS
      </motion.p>
      <motion.p
        style={wordmarkTextStyle}
        initial={{ color: 'rgba(250, 250, 250, 0)' }}
        animate={reduceMotion ? { color: '#FAFAFA' } : {
          color: [
            'rgba(250, 250, 250, 0)',
            'rgba(250, 250, 250, 0)',
            'rgba(250, 250, 250, 0)',
            '#FAFAFA',
          ],
        }}
        transition={reduceMotion ? undefined : MIDDLE_ROW_TRANSITION}
      >
        NEXUS
      </motion.p>
      <motion.p
        style={{ ...wordmarkTextStyle, color: 'transparent' }}
        initial={{ y: 0 }}
        animate={reduceMotion ? { y: 0 } : { y: [0, -ROW_SHIFT_PX, -ROW_SHIFT_PX] }}
        transition={reduceMotion ? undefined : OUTER_ROW_TRANSITION}
      >
        NEXUS
      </motion.p>
    </div>
  )
}
