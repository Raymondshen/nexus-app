import type { ReactNode } from 'react'
import { SpaceBackground } from '@/shared/components/ui/SpaceBackground'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[#0a0612] flex flex-col items-center justify-center overflow-hidden px-4 py-12">

      <SpaceBackground />

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
