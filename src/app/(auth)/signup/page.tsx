'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { signupAction } from './actions'

export default function SignupPage() {
  const [state, action, isPending] = useActionState(signupAction, null)

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="font-pixel text-sm text-white mb-2">JOIN THE WAR</h2>
        <p className="font-pixel text-[9px] text-[#6b4f8f]">Choose your identity</p>
      </div>

      {state?.error && (
        <div className="bg-[#ff4444]/10 border border-[#ff4444]/50 px-3 py-2">
          <p className="font-pixel text-[9px] text-[#ff4444] leading-relaxed">{state.error}</p>
        </div>
      )}

      <form action={action} className="flex flex-col gap-4">
        <Input
          name="username"
          type="text"
          label="WARRIOR NAME"
          placeholder="ShadowBlade99"
          required
          minLength={3}
          maxLength={20}
          autoComplete="username"
        />
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
          minLength={6}
          autoComplete="new-password"
        />

        <Button
          type="submit"
          variant="primary"
          loading={isPending}
          className="w-full mt-2"
        >
          CREATE ACCOUNT
        </Button>
      </form>

      <div className="border-t border-[#2a1545] pt-4 text-center">
        <p className="font-pixel text-[9px] text-[#6b4f8f]">
          Already fighting?{' '}
          <Link href="/login" className="text-[#bf5fff] hover:text-[#d080ff] underline underline-offset-2">
            SIGN IN
          </Link>
        </p>
      </div>
    </div>
  )
}
