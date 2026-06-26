'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { createCrewAction } from './actions'

export default function CreateCrewPage() {
  const [state, action, isPending] = useActionState(createCrewAction, null)

  return (
    <div className="min-h-screen bg-[#0a0612] flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(0,0,0,0.10) 2px, rgba(0,0,0,0.10) 4px)',
        }}
      />

      <div className="relative z-10 w-full max-w-[390px]">
        <div className="text-center mb-8">
          <h1
            className="font-pixel text-3xl text-[#bf5fff] tracking-wider mb-3"
            style={{ textShadow: '0 0 30px rgba(191,95,255,0.9), 0 0 60px rgba(191,95,255,0.4)' }}
          >
            NEXUS
          </h1>
        </div>

        <div
          className="bg-[#0f0820] border-2 border-[#bf5fff]/40 p-6"
          style={{ boxShadow: '0 0 40px rgba(191,95,255,0.12), inset 0 1px 0 rgba(191,95,255,0.08)' }}
        >
          <div className="text-center mb-6">
            <h2 className="font-pixel text-[11px] text-white mb-2">CREATE A CREW</h2>
            <p className="font-pixel text-[8px] text-[#6b4f8f] leading-relaxed">
              Name your war party
            </p>
          </div>

          {state?.error && (
            <div className="bg-[#ff4444]/10 border border-[#ff4444]/50 px-3 py-2 mb-4">
              <p className="font-pixel text-[9px] text-[#ff4444] leading-relaxed">{state.error}</p>
            </div>
          )}

          <form action={action} className="flex flex-col gap-5">
            <Input
              name="crewName"
              type="text"
              label="CREW NAME"
              placeholder="The Void Slayers"
              required
              minLength={2}
              maxLength={32}
              autoComplete="off"
              autoFocus
            />

            <p className="font-pixel text-[7px] text-[#3d2660] leading-relaxed -mt-2">
              A 6-character invite code will be generated automatically.
            </p>

            <Button type="submit" variant="primary" loading={isPending} className="w-full">
              FORGE THE CREW
            </Button>
          </form>

          <div className="border-t border-[#2a1545] pt-4 mt-4 text-center">
            <Link
              href="/onboarding"
              className="font-pixel text-[8px] text-[#6b4f8f] hover:text-[#bf5fff] transition-colors"
            >
              ← BACK
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
