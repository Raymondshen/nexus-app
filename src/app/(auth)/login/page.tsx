import type { Metadata } from 'next'
import { LoginForm } from '@/features/auth/screens/LoginForm'

export const metadata: Metadata = {
  title:       'Login',
  description: 'Enter the Nexus.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ newAccount?: string; inviteError?: string; code?: string }>
}) {
  const { newAccount, inviteError, code } = await searchParams
  return (
    <LoginForm
      newAccount={newAccount}
      staleInviteCode={inviteError === '1' ? code : undefined}
      sharedInviteCode={inviteError !== '1' ? code : undefined}
    />
  )
}
