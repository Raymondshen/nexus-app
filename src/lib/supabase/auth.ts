import { createClient } from '@/lib/supabase/client'
import type { GuestUser } from '@/types'

export async function signInWithGoogle(): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  })
  if (error) throw error
}

export async function signInAsGuest(username: string): Promise<GuestUser> {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signInAnonymously({
    options: { data: { username } },
  })
  if (error) throw error

  const guestUser: GuestUser = {
    id: data.user?.id ?? crypto.randomUUID(),
    username,
    isGuest: true,
    createdAt: new Date().toISOString(),
  }

  localStorage.setItem('guest_username', username)
  localStorage.setItem('guest_data', JSON.stringify(guestUser))

  return guestUser
}

export async function signOut(): Promise<void> {
  localStorage.removeItem('guest_username')
  localStorage.removeItem('guest_data')
  const supabase = createClient()
  await supabase.auth.signOut()
}

export async function getUser() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export function isGuest(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem('guest_username') !== null
}
