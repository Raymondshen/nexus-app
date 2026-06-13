'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Keeps the Supabase session alive on Android PWA where the browser throttles
// background JS timers (breaking the built-in auto-refresh).
// Strategy:
//  - stopAutoRefresh when the app goes to background (timer would be unreliable)
//  - startAutoRefresh + immediate getSession() when it comes back to foreground
//    (getSession() exchanges the refresh token if the access token has expired)
//  - redirect to /login on SIGNED_OUT (refresh token gone or revoked)
export function SessionRefresher() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    async function handleVisible() {
      supabase.auth.startAutoRefresh()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) router.replace('/login')
    }

    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        handleVisible()
      } else {
        supabase.auth.stopAutoRefresh()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.replace('/login')
    })

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      subscription.unsubscribe()
    }
  }, [router])

  return null
}
