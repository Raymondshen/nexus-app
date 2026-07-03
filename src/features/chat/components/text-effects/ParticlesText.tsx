'use client'

import { motion } from 'framer-motion'

// Deterministic pseudo-random in [0, 1) — avoids Math.random() during render,
// which would cause SSR/client hydration mismatches for this 'use client' component.
function seededRandom(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

const PARTICLES_PER_CHAR = 3

// Each character assembles from a small burst of drifting particles, settles,
// then loops — same staggered infinite-loop shape as BouncyText/ShowUpText.
// Everything animates via transform/opacity only (no filter/box-shadow/layout
// properties, no per-frame inline-style mutation), so Framer Motion can hand
// the animation to the compositor and it stays smooth on iOS/Android PWA.
export function ParticlesText({ text }: { text: string }) {
  return (
    <span style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
      {Array.from(text).map((ch, i) => (
        <span key={i} style={{ position: 'relative', display: 'inline-block' }}>
          {ch !== ' ' &&
            Array.from({ length: PARTICLES_PER_CHAR }).map((_, p) => {
              const seed = i * 7 + p + 1
              const angle = seededRandom(seed) * Math.PI * 2
              const dist = 8 + seededRandom(seed + 1) * 6
              const dx = Math.cos(angle) * dist
              const dy = Math.sin(angle) * dist
              return (
                <motion.span
                  key={p}
                  initial={{ opacity: 0, x: dx, y: dy }}
                  animate={{
                    opacity: [0, 1, 0],
                    x: 0,
                    y: 0,
                    transition: {
                      delay: i * 0.1 + p * 0.05,
                      duration: 0.6,
                      repeat: Infinity,
                      repeatDelay: 2,
                      ease: 'easeOut',
                    },
                  }}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: 3,
                    height: 3,
                    marginTop: -1.5,
                    marginLeft: -1.5,
                    borderRadius: '50%',
                    background: 'currentColor',
                    pointerEvents: 'none',
                    willChange: 'transform, opacity',
                  }}
                />
              )
            })}
          <motion.span
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{
              opacity: [0, 1, 1],
              scale: [0.4, 1.15, 1],
              transition: {
                delay: i * 0.1,
                duration: 0.6,
                repeat: Infinity,
                repeatDelay: 2,
                ease: 'easeOut',
              },
            }}
            className="inline-block"
            style={{ willChange: 'transform, opacity' }}
          >
            {ch}
          </motion.span>
        </span>
      ))}
    </span>
  )
}
