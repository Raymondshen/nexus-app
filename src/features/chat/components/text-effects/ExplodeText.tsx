'use client'

import { motion } from 'framer-motion'

// Deterministic pseudo-random in [0, 1) — avoids Math.random() during render,
// which would cause SSR/client hydration mismatches for this 'use client' component.
function seededRandom(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

// Each character shrinks, jitters, then bursts outward on its own deterministic
// trajectory before resetting for the next loop — same staggered infinite-loop
// shape as BouncyText/ParticlesText. Adapted from a standalone imperative
// (useAnimationControls + requestAnimationFrame) reference component into a
// single declarative keyframe animation per character: the recursive rAF loop
// has no unmount guard in the original, which would keep scheduling frames
// after a message bubble is virtualized out of the chat list. A declarative
// `animate` prop lets Framer Motion own the lifecycle — it's cancelled
// automatically on unmount, no manual cleanup required. Only transform
// (x/y/scale/rotate) and opacity are animated (no letterSpacing/filter), so
// every frame stays on the compositor instead of the main thread on iOS Safari.
export function ExplodeText({ text }: { text: string }) {
  const characters = Array.from(text)
  const total = characters.length

  return (
    <span style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
      {characters.map((ch, i) => {
        const seed = i * 7 + 1
        const dir = seededRandom(seed) > 0.5 ? 1 : -1
        const dx = (6 + seededRandom(seed + 1) * 14) * dir
        const dy = -(6 + seededRandom(seed + 2) * 10)
        const rot = (seededRandom(seed + 3) - 0.5) * 140
        const jitterX = (seededRandom(seed + 4) - 0.5) * 6
        const jitterY = (seededRandom(seed + 5) - 0.5) * 6

        return (
          <motion.span
            key={i}
            initial={{ opacity: 1, scale: 1, x: 0, y: 0, rotate: 0 }}
            animate={{
              scale: [1, 0.85, 1.15, 1.4],
              x: [0, jitterX, dx * 0.6, dx],
              y: [0, jitterY, dy * 0.6, dy],
              rotate: [0, 0, rot * 0.5, rot],
              opacity: [1, 1, 0.7, 0],
              transition: {
                delay: i * (total > 1 ? 0.6 / total : 0),
                duration: 0.9,
                times: [0, 0.25, 0.6, 1],
                repeat: Infinity,
                repeatDelay: 1.4,
                ease: 'easeInOut',
              },
            }}
            className="inline-block"
            style={{ willChange: 'transform, opacity' }}
          >
            {ch === ' ' ? ' ' : ch}
          </motion.span>
        )
      })}
    </span>
  )
}
