import type { Metadata } from 'next'
import { LoginForm } from '@/features/auth/screens/LoginForm'

export const metadata: Metadata = {
  title:       'Login',
  description: 'Enter the Nexus.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ flow?: string; step?: string; error?: string; code?: string }>
}) {
  const { flow, step, error, code } = await searchParams
  return <LoginForm flow={flow} step={step} urlError={error} code={code} />
}
