'use client'

import type { CSSProperties } from 'react'

// Same floating-pixel-particle backdrop as the invite/reserve auth flow
// (`src/app/(auth)/layout.tsx`) and the join/create crew onboarding pages —
// scanline overlay + purple ambient glow + drifting pixel particles that
// gently fade in and out (`space-pulse` keyframe in globals.css) as they
// bob. Extracted here so any full-page surface that wants the same "spacey"
// onboarding backdrop (e.g. the Squad Updates page) doesn't hand-roll a
// fourth copy.
interface Particle {
  left:     string
  top:      string
  delay:    string
  duration: string
  size:     number
  opacity:  number
}

// `duration` varies per particle (3.8s–6.6s) so the field doesn't pulse in
// lockstep — only the stagger from `delay` would otherwise be visible, since
// every particle would still peak/fade at the same rate.
const SPACE_PARTICLES: Particle[] = [
  { left: '8%',  top: '15%', delay: '0s',   duration: '4.6s', size: 3, opacity: 0.40 },
  { left: '88%', top: '12%', delay: '0.8s', duration: '5.4s', size: 2, opacity: 0.30 },
  { left: '72%', top: '68%', delay: '1.4s', duration: '3.8s', size: 4, opacity: 0.25 },
  { left: '18%', top: '78%', delay: '0.3s', duration: '6.2s', size: 2, opacity: 0.35 },
  { left: '55%', top: '8%',  delay: '1.9s', duration: '5.0s', size: 3, opacity: 0.30 },
  { left: '92%', top: '48%', delay: '0.6s', duration: '4.2s', size: 2, opacity: 0.40 },
  { left: '35%', top: '88%', delay: '1.1s', duration: '5.8s', size: 3, opacity: 0.25 },
  { left: '65%', top: '30%', delay: '2.2s', duration: '4.4s', size: 2, opacity: 0.35 },
  { left: '12%', top: '45%', delay: '1.6s', duration: '6.6s', size: 4, opacity: 0.20 },
  { left: '80%', top: '82%', delay: '0.5s', duration: '5.6s', size: 2, opacity: 0.30 },
  { left: '45%', top: '55%', delay: '1.3s', duration: '5.2s', size: 3, opacity: 0.30 },
  { left: '28%', top: '35%', delay: '0.9s', duration: '4.0s', size: 2, opacity: 0.35 },
  { left: '95%', top: '70%', delay: '2.0s', duration: '6.0s', size: 3, opacity: 0.25 },
  { left: '5%',  top: '92%', delay: '0.4s', duration: '5.6s', size: 2, opacity: 0.30 },
  { left: '60%', top: '95%', delay: '1.7s', duration: '4.4s', size: 4, opacity: 0.20 },
  { left: '48%', top: '25%', delay: '0.2s', duration: '6.4s', size: 2, opacity: 0.40 },
]

// Denser, brighter field for full-bleed page backgrounds. The set above was
// tuned to sit *behind* a solid onboarding card (small accent, not the main
// event) — used edge-to-edge as a page's entire backdrop it reads as flat
// black. Roughly 2x the particles, bigger, and notably more opaque.
const DENSE_SPACE_PARTICLES: Particle[] = [
  { left: '5%',  top: '9%',  delay: '0s',    duration: '4.8s', size: 5, opacity: 0.65 },
  { left: '22%', top: '22%', delay: '0.5s',  duration: '5.6s', size: 3, opacity: 0.50 },
  { left: '40%', top: '6%',  delay: '1.1s',  duration: '3.8s', size: 4, opacity: 0.55 },
  { left: '58%', top: '18%', delay: '0.2s',  duration: '6.4s', size: 3, opacity: 0.45 },
  { left: '78%', top: '10%', delay: '1.6s',  duration: '4.4s', size: 5, opacity: 0.60 },
  { left: '92%', top: '28%', delay: '0.8s',  duration: '5.2s', size: 3, opacity: 0.45 },
  { left: '10%', top: '38%', delay: '2.0s',  duration: '4.0s', size: 4, opacity: 0.50 },
  { left: '30%', top: '48%', delay: '0.3s',  duration: '6.0s', size: 3, opacity: 0.55 },
  { left: '50%', top: '35%', delay: '1.4s',  duration: '4.6s', size: 5, opacity: 0.65 },
  { left: '68%', top: '46%', delay: '0.6s',  duration: '5.8s', size: 3, opacity: 0.45 },
  { left: '85%', top: '55%', delay: '1.9s',  duration: '3.9s', size: 4, opacity: 0.55 },
  { left: '15%', top: '62%', delay: '1.2s',  duration: '5.0s', size: 3, opacity: 0.50 },
  { left: '35%', top: '72%', delay: '0.1s',  duration: '6.6s', size: 5, opacity: 0.60 },
  { left: '52%', top: '65%', delay: '2.3s',  duration: '4.2s', size: 3, opacity: 0.45 },
  { left: '72%', top: '74%', delay: '0.7s',  duration: '5.4s', size: 4, opacity: 0.55 },
  { left: '90%', top: '82%', delay: '1.5s',  duration: '4.0s', size: 3, opacity: 0.50 },
  { left: '6%',  top: '86%', delay: '0.4s',  duration: '6.2s', size: 4, opacity: 0.60 },
  { left: '25%', top: '92%', delay: '1.8s',  duration: '4.8s', size: 3, opacity: 0.45 },
  { left: '45%', top: '88%', delay: '1.0s',  duration: '5.6s', size: 5, opacity: 0.55 },
  { left: '62%', top: '92%', delay: '0.9s',  duration: '3.8s', size: 3, opacity: 0.50 },
  { left: '80%', top: '4%',  delay: '2.1s',  duration: '5.0s', size: 3, opacity: 0.45 },
  { left: '95%', top: '65%', delay: '1.3s',  duration: '6.4s', size: 4, opacity: 0.55 },
  { left: '3%',  top: '55%', delay: '0.6s',  duration: '4.4s', size: 3, opacity: 0.50 },
  { left: '48%', top: '2%',  delay: '1.7s',  duration: '5.8s', size: 4, opacity: 0.55 },
  { left: '15%', top: '15%', delay: '1.0s',  duration: '5.0s', size: 4, opacity: 0.50 },
  { left: '65%', top: '58%', delay: '0.3s',  duration: '4.6s', size: 3, opacity: 0.55 },
  { left: '38%', top: '82%', delay: '1.5s',  duration: '6.0s', size: 5, opacity: 0.60 },
  { left: '8%',  top: '48%', delay: '2.2s',  duration: '3.9s', size: 3, opacity: 0.45 },
  { left: '55%', top: '92%', delay: '0.6s',  duration: '5.4s', size: 4, opacity: 0.55 },
  { left: '75%', top: '35%', delay: '1.8s',  duration: '4.2s', size: 3, opacity: 0.50 },
  { left: '28%', top: '58%', delay: '0.1s',  duration: '6.2s', size: 5, opacity: 0.65 },
  { left: '88%', top: '90%', delay: '1.1s',  duration: '4.8s', size: 3, opacity: 0.45 },
  { left: '2%',  top: '72%', delay: '2.0s',  duration: '5.8s', size: 4, opacity: 0.55 },
  { left: '42%', top: '12%', delay: '0.8s',  duration: '4.0s', size: 3, opacity: 0.50 },
]

interface SpaceBackgroundProps {
  /**
   * Denser + brighter particle field for surfaces where this backdrop IS the
   * page background (no solid card sitting on top of it to carry the visual
   * weight). Default false keeps the original subtle onboarding-card accent.
   */
  dense?: boolean
}

export function SpaceBackground({ dense = false }: SpaceBackgroundProps = {}) {
  const particles = dense ? DENSE_SPACE_PARTICLES : SPACE_PARTICLES
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          background:
            'repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(0,0,0,0.12) 2px, rgba(0,0,0,0.12) 4px)',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 80% 50% at 50% 50%, rgba(191,95,255,${dense ? 0.14 : 0.07}) 0%, transparent 70%)`,
        }}
      />
      {particles.map((p, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            backgroundColor: '#bf5fff',
            animation: `space-pulse ${p.duration} ease-in-out infinite`,
            animationDelay: p.delay,
            '--space-particle-opacity': p.opacity,
          } as CSSProperties}
        />
      ))}
    </div>
  )
}
