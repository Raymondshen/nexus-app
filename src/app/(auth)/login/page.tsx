'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { loginAction } from './actions'

export default function LoginPage() {
  const [state, action, isPending] = useActionState(loginAction, null)

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="font-pixel text-sm text-white mb-2">ENTER THE NEXUS</h2>
        <p className="font-pixel text-[9px] text-[#6b4f8f]">Welcome back, warrior</p>
      </div>

      {state?.error && (
        <div className="bg-[#ff4444]/10 border border-[#ff4444]/50 px-3 py-2">
          <p className="font-pixel text-[9px] text-[#ff4444] leading-relaxed">{state.error}</p>
        </div>
      )}

      <form action={action} className="flex flex-col gap-4">
        <Input
          name="email"
          type="email"
          label="EMAIL"
          placeholder="warrior@nexus.gg"
          required
          autoComplete="email"
        />
        <Input
          name="password"
          type="password"
          label="PASSWORD"
          placeholder="••••••••"
          required
          autoComplete="current-password"
        />

        <Button
          type="submit"
          variant="primary"
          loading={isPending}
          className="w-full mt-2"
        >
          SIGN IN
        </Button>
      </form>

      <div className="border-t border-[#2a1545] pt-4 text-center">
        <p className="font-pixel text-[9px] text-[#6b4f8f]">
          New recruit?{' '}
          <Link href="/signup" className="text-[#bf5fff] hover:text-[#d080ff] underline underline-offset-2">
            CREATE ACCOUNT
          </Link>
        </p>
      </div>
    </div>
  )
}
