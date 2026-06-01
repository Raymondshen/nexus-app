import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // If already in a crew, go straight to chat
  const { data: membership } = await supabase
    .from('crew_members')
    .select('crew_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (membership) {
    redirect(`/chat/${membership.crew_id}`)
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
        <div className="text-center">
          <h1
            className="font-pixel text-3xl text-[#bf5fff] tracking-wider mb-3"
            style={{ textShadow: '0 0 30px rgba(191,95,255,0.9), 0 0 60px rgba(191,95,255,0.4)' }}
          >
            NEXUS
          </h1>
          <p className="font-pixel text-[8px] text-[#00e5ff] tracking-[0.4em]">
            YOUR CREW. YOUR WAR.
          </p>
        </div>

        <div
          className="w-full bg-[#0f0820] border-2 border-[#bf5fff]/40 p-6 flex flex-col gap-4"
          style={{
            boxShadow:
              '0 0 40px rgba(191,95,255,0.12), inset 0 1px 0 rgba(191,95,255,0.08)',
          }}
        >
          <div className="text-center mb-2">
            <h2 className="font-pixel text-[11px] text-white mb-2">ASSEMBLE YOUR CREW</h2>
            <p className="font-pixel text-[8px] text-[#6b4f8f] leading-relaxed">
              Create a new crew or join one with an invite code
            </p>
          </div>

          <Link
            href="/onboarding/create"
            className="w-full flex flex-col items-center gap-1 bg-[#bf5fff] text-[#0a0612] hover:bg-[#d080ff] transition-colors px-4 py-4 shadow-[3px_3px_0px_#7b2fa8] active:shadow-none active:translate-y-[2px]"
          >
            <span className="font-pixel text-[11px] tracking-wider">⚔ CREATE CREW</span>
            <span className="font-pixel text-[7px] opacity-70">Start a new war</span>
          </Link>

          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-[#2a1545]" />
            <span className="font-pixel text-[8px] text-[#3d2660]">── OR ──</span>
            <div className="flex-1 border-t border-[#2a1545]" />
          </div>

          <Link
            href="/onboarding/join"
            className="w-full flex flex-col items-center gap-1 bg-transparent text-[#bf5fff] border-2 border-[#bf5fff] hover:bg-[#bf5fff]/10 transition-colors px-4 py-4 shadow-[3px_3px_0px_#7b2fa8] active:shadow-none active:translate-y-[2px]"
          >
            <span className="font-pixel text-[11px] tracking-wider">🔗 JOIN WITH CODE</span>
            <span className="font-pixel text-[7px] opacity-60">Enter a 6-digit invite code</span>
          </Link>
        </div>

      </div>
    </div>
  )
}
