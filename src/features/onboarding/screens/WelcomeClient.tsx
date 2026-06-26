'use client'

import { useState, useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { joinCrewFromWelcomeAction } from '@/app/(app)/onboarding/welcome/actions'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'

export default function WelcomeClient({
  crewId,
  inviterUsername,
  validInviteCode,
}: {
  crewId:           string | null
  inviterUsername:  string | null
  validInviteCode:  string | null
}) {
  const router  = useRouter()
  const isInvited = Boolean(inviterUsername)

  const heading = isInvited ? "You're in the Nexus." : 'The Nexus is yours.'
  const subtext  = isInvited
    ? `${inviterUsername} recruited you. Now find your crew.`
    : 'Build your crew. Start the fight.'

  const [showJoin,  setShowJoin]  = useState(false)
  const [crewCode,  setCrewCode]  = useState('')
  const [joinState, joinAction, joinPending] = useActionState(joinCrewFromWelcomeAction, null)

  function handleCrewCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    setCrewCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
  }

  return (
    <div className="min-h-screen bg-[#0a0612] flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Scanlines */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(0,0,0,0.10) 2px, rgba(0,0,0,0.10) 4px)',
        }}
      />
      {/* Ambient glow */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% 50%, rgba(191,95,255,0.06) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 w-full max-w-[390px] flex flex-col items-center gap-8">

        {/* Logo */}
        <h1
          className="font-pixel text-3xl text-[#bf5fff] tracking-wider"
          style={{ textShadow: '0 0 30px rgba(191,95,255,0.9), 0 0 60px rgba(191,95,255,0.4)' }}
        >
          NEXUS
        </h1>

        {/* Heading + subtext */}
        <div className="text-center flex flex-col gap-3">
          <motion.h2
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="font-pixel text-[16px] text-white leading-relaxed"
          >
            {heading}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="font-pixel text-[8px] text-[#6b4f8f] leading-relaxed"
          >
            {subtext}
          </motion.p>
        </div>

        {/* If user already has a crew (arrived from class selection) */}
        {crewId ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.25 }}
            className="w-full flex flex-col gap-4"
          >
            <button
              onClick={() => router.push(`/chat/${crewId}?welcome=1`)}
              className="w-full flex flex-col items-center gap-1 bg-[#bf5fff] text-[#0a0612] px-4 py-4 shadow-[3px_3px_0px_#7b2fa8] active:shadow-none active:translate-y-[2px] transition-transform"
            >
              <span className="font-pixel text-[11px] tracking-wider">⚔ ENTER THE NEXUS</span>
            </button>
          </motion.div>
        ) : (
          /* No crew yet — show CTAs */
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.25 }}
            className="w-full flex flex-col gap-4"
          >

            {/* Enter Crew Code */}
            {showJoin ? (
              <div
                className="w-full bg-[#0f0820] border-2 border-[#bf5fff]/40 p-5 flex flex-col gap-4"
                style={{ boxShadow: '0 0 40px rgba(191,95,255,0.12)' }}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => { setShowJoin(false); setCrewCode('') }}
                    className="text-[#6b4f8f] hover:text-[#bf5fff] transition-colors"
                  >
                    <ChevronLeft style={{ width: 16, height: 16 }} aria-hidden="true" />
                  </button>
                  <span className="font-pixel text-[10px] text-white">ENTER CREW CODE</span>
                </div>

                {joinState?.error && (
                  <div className="bg-[#ff4444]/10 border border-[#ff4444]/50 px-3 py-2">
                    <p className="font-pixel text-[9px] text-[#ff4444] leading-relaxed">{joinState.error}</p>
                  </div>
                )}

                <form action={joinAction} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-[6px]">
                    <input
                      value={crewCode}
                      onChange={handleCrewCodeChange}
                      placeholder="A3X9KP"
                      autoComplete="off"
                      autoFocus
                      className="w-full bg-[#080514] border-2 px-3 py-3 text-white font-pixel text-[16px] tracking-[0.5em] text-center placeholder:text-[#3a2555] placeholder:tracking-[0.2em] focus:outline-none border-[#2a1545] focus:border-[#bf5fff]"
                    />
                    <input type="hidden" name="crewCode"   value={crewCode} />
                    {validInviteCode && (
                      <input type="hidden" name="inviteCode" value={validInviteCode} />
                    )}
                    <p className="font-pixel text-[7px] text-[#3d2660]">{crewCode.length}/6 characters</p>
                  </div>
                  <button
                    type="submit"
                    disabled={crewCode.length !== 6 || joinPending}
                    className="w-full flex flex-col items-center gap-1 bg-[#bf5fff] text-[#0a0612] px-4 py-4 shadow-[3px_3px_0px_#7b2fa8] active:shadow-none active:translate-y-[2px] transition-transform disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
                  >
                    <span className="font-pixel text-[11px] tracking-wider">
                      {joinPending ? '...' : 'JOIN CREW'}
                    </span>
                  </button>
                </form>
              </div>
            ) : (
              <button
                onClick={() => setShowJoin(true)}
                className="w-full flex flex-col items-center gap-1 bg-[#bf5fff] text-[#0a0612] px-4 py-4 shadow-[3px_3px_0px_#7b2fa8] active:shadow-none active:translate-y-[2px] transition-transform"
              >
                <span className="font-pixel text-[11px] tracking-wider">🔗 ENTER CREW CODE</span>
                <span className="font-pixel text-[7px] opacity-70">Join an existing crew</span>
              </button>
            )}

            {/* Start Your Own Crew */}
            {!showJoin && (
              <a
                href="/onboarding/create"
                className="w-full flex flex-col items-center gap-1 bg-transparent text-[#bf5fff] border-2 border-[#bf5fff] hover:bg-[#bf5fff]/10 transition-colors px-4 py-4 shadow-[3px_3px_0px_#7b2fa8] active:shadow-none active:translate-y-[2px]"
              >
                <span className="font-pixel text-[11px] tracking-wider">⚔ START YOUR OWN CREW</span>
                <span className="font-pixel text-[7px] opacity-60">Create a new war party</span>
              </a>
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}
