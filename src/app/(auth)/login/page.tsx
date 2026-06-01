import type { Metadata } from 'next'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = {
  title:       'Login',
  description: 'Enter the Nexus.',
}

export default function LoginPage() {
  return <LoginForm />
}
