import type { Metadata } from 'next'
import { LoginForm } from '@/features/auth/screens/LoginForm'

export const metadata: Metadata = {
  title:       'Login',
  description: 'Enter the Nexus.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ newAccount?: string }>
}) {
  const { newAccount } = await searchParams
  return <LoginForm newAccount={newAccount} />
}
