'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/shared/components/ui/Button'
import { SpaceBackground } from '@/shared/components/ui/SpaceBackground'
import { joinCrewAction } from './actions'

export default function JoinCrewPage() {
  const [state, action, isPending] = useActionState(joinCrewAction, null)
  const [code, setCode] = useState('')

  function handleCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
  }

  return (
    <div className="min-h-screen bg-[#0a0612] flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      <SpaceBackground />

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
            <h2 className="font-pixel text-[11px] text-white mb-2">JOIN A CREW</h2>
            <p className="font-pixel text-[8px] text-[#6b4f8f] leading-relaxed">
              Enter the invite code your crew leader shared
            </p>
          </div>

          {state?.error && (
            <div className="bg-[#ff4444]/10 border border-[#ff4444]/50 px-3 py-2 mb-4">
              <p className="font-pixel text-[9px] text-[#ff4444] leading-relaxed">{state.error}</p>
            </div>
          )}

          <form action={action} className="flex flex-col gap-5">
            <div className="flex flex-col gap-[6px]">
              <label className="font-pixel text-[9px] text-[#bf5fff] tracking-widest uppercase">
                INVITE CODE
              </label>
              {/* visible controlled input for UX, hidden input carries the value to the server action */}
              <input
                value={code}
                onChange={handleCodeChange}
                placeholder="A3X9KP"
                autoComplete="off"
                autoFocus
                className="w-full bg-[#080514] border-2 px-3 py-3 text-white text-lg font-pixel tracking-[0.5em] text-center placeholder:text-[#3a2555] placeholder:tracking-[0.2em] transition-all duration-150 focus:outline-none border-[#2a1545] focus:border-[#bf5fff] focus:shadow-[0_0_0_1px_rgba(191,95,255,0.3)]"
              />
              <input type="hidden" name="inviteCode" value={code} />
              <p className="font-pixel text-[7px] text-[#3d2660]">
                {code.length}/6 characters
              </p>
            </div>

            <Button
              type="submit"
              variant="primary"
              loading={isPending}
              disabled={code.length !== 6}
              className="w-full"
            >
              ENTER THE WAR
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
