import type { ReactNode } from 'react'

const PARTICLES = [
  { left: '8%',  top: '15%', delay: '0s',    size: 3, opacity: 0.40 },
  { left: '88%', top: '12%', delay: '0.8s',  size: 2, opacity: 0.30 },
  { left: '72%', top: '68%', delay: '1.4s',  size: 4, opacity: 0.25 },
  { left: '18%', top: '78%', delay: '0.3s',  size: 2, opacity: 0.35 },
  { left: '55%', top: '8%',  delay: '1.9s',  size: 3, opacity: 0.30 },
  { left: '92%', top: '48%', delay: '0.6s',  size: 2, opacity: 0.40 },
  { left: '35%', top: '88%', delay: '1.1s',  size: 3, opacity: 0.25 },
  { left: '65%', top: '30%', delay: '2.2s',  size: 2, opacity: 0.35 },
  { left: '12%', top: '45%', delay: '1.6s',  size: 4, opacity: 0.20 },
  { left: '80%', top: '82%', delay: '0.5s',  size: 2, opacity: 0.30 },
]

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[#0a0612] flex flex-col items-center justify-center overflow-hidden px-4 py-12">

      {/* Scanline overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-10"
        style={{
          background:
            'repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(0,0,0,0.12) 2px, rgba(0,0,0,0.12) 4px)',
        }}
      />

      {/* Purple ambient glow */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% 50%, rgba(191,95,255,0.07) 0%, transparent 70%)',
        }}
      />

      {/* Floating pixel particles */}
      {PARTICLES.map((p, i) => (
        <div
          key={i}
          className="pointer-events-none fixed z-0"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            backgroundColor: '#bf5fff',
            opacity: p.opacity,
            animation: `float 4s ease-in-out infinite`,
            animationDelay: p.delay,
          }}
        />
      ))}

      {/* Content */}
      <div className="relative z-20 w-full max-w-[390px]">

        {/* Nexus logo */}
        <div className="text-center mb-8">
          <h1
            className="font-pixel text-3xl text-[#bf5fff] tracking-wider mb-3"
            style={{
              textShadow: '0 0 30px rgba(191,95,255,0.9), 0 0 60px rgba(191,95,255,0.4)',
            }}
          >
            NEXUS
          </h1>
          <p className="font-pixel text-[8px] text-[#00e5ff] tracking-[0.4em]">
            YOUR CREW. YOUR WAR.
          </p>
        </div>

        {/* Auth card */}
        <div
          className="bg-[#0f0820] border-2 border-[#bf5fff]/40 p-6"
          style={{
            boxShadow:
              '0 0 40px rgba(191,95,255,0.12), 0 0 80px rgba(191,95,255,0.06), inset 0 1px 0 rgba(191,95,255,0.08)',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
