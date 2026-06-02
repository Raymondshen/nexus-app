'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { signInWithGoogle, signInAsGuest } from '@/lib/supabase/auth'
import { createClient } from '@/lib/supabase/client'

export function LoginForm() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [guestLoading, setGuestLoading] = useState(false)

  async function handleGoogle() {
    setError(null)
    setGoogleLoading(true)
    try {
      await signInWithGoogle()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect to Google.')
      setGoogleLoading(false)
    }
  }

  async function handleGuest(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = username.trim().replace(/<[^>]*>/g, '').slice(0, 20)
    if (trimmed.length < 3) {
      setError('Warrior name must be at least 3 characters.')
      return
    }
    setError(null)
    setGuestLoading(true)
    try {
      // Check if username is already taken (case-insensitive)
      const supabase = createClient()
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', trimmed)
        .maybeSingle()

      if (existing) {
        setError('That warrior name is already taken. Choose another.')
        setGuestLoading(false)
        return
      }

      await signInAsGuest(trimmed)
      router.push('/onboarding')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start guest session.')
      setGuestLoading(false)
    }
  }

  const busy = googleLoading || guestLoading

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="font-pixel text-sm text-white mb-2">ENTER THE NEXUS</h2>
        <p className="font-pixel text-[9px] text-[#6b4f8f]">Choose your path, warrior</p>
      </div>

      {error && (
        <div className="bg-[#ff4444]/10 border border-[#ff4444]/50 px-3 py-2">
          <p className="font-pixel text-[9px] text-[#ff4444] leading-relaxed">{error}</p>
        </div>
      )}

      {/* Google OAuth */}
      <button
        onClick={handleGoogle}
        disabled={busy}
        className="w-full flex items-center justify-center gap-3 bg-[#1a1a2e] hover:bg-[#252540] border border-[#3a3a5c] text-white font-pixel text-[11px] tracking-wider px-4 py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[3px_3px_0px_#0d0d1a] active:shadow-none active:translate-y-[2px]"
      >
        {googleLoading ? (
          <span className="flex gap-1">
            <span className="inline-block w-1 h-1 bg-white animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="inline-block w-1 h-1 bg-white animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="inline-block w-1 h-1 bg-white animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            CONTINUE WITH GOOGLE
          </>
        )}
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-[#2a1545]" />
        <span className="font-pixel text-[9px] text-[#3d2660]">── OR ──</span>
        <div className="flex-1 border-t border-[#2a1545]" />
      </div>

      {/* Guest mode */}
      <form onSubmit={handleGuest} className="flex flex-col gap-4">
        <Input
          name="username"
          type="text"
          label="WARRIOR NAME"
          placeholder="ShadowBlade99"
          value={username}
          onChange={e => setUsername(e.target.value.replace(/<[^>]*>/g, '').slice(0, 20))}
          required
          minLength={3}
          maxLength={20}
          autoComplete="off"
        />

        <Button
          type="submit"
          variant="secondary"
          loading={guestLoading}
          disabled={busy}
          className="w-full"
        >
          JOIN THE NEXUS
        </Button>

        <p className="font-pixel text-[8px] text-[#3d2660] text-center leading-relaxed">
          Guest progress is saved on this device only
        </p>
      </form>
    </div>
  )
}
