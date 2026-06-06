import type { Metadata } from 'next'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = {
  title:       'Login',
  description: 'Enter the Nexus.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ flow?: string; step?: string; error?: string }>
}) {
  const { flow, step } = await searchParams
  return <LoginForm flow={flow} step={step} />
}
