'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { signInWithGoogle } from '@/lib/supabase/auth'

export function GuestBanner() {
  const [isGuest, setIsGuest] = useState(false)
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const guestUsername = localStorage.getItem('guest_username')
    if (!guestUsername) return

    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) {
        // Upgraded to real account — clear guest data
        localStorage.removeItem('guest_username')
        localStorage.removeItem('guest_data')
      } else {
        setIsGuest(true)
        setUsername(guestUsername)
      }
    })
  }, [])

  if (!isGuest) return null

  async function handleSaveProgress() {
    setLoading(true)
    try {
      await signInWithGoogle()
    } catch {
      setLoading(false)
    }
  }

  return (
    <div className="bg-[#1a0d2e] border-b border-[#2a1545] px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="font-pixel text-[8px] bg-[#6b4f8f]/60 text-[#bf5fff] border border-[#6b4f8f] px-2 py-0.5">
          GUEST
        </span>
        <span className="font-pixel text-[9px] text-[#6b4f8f]">{username}</span>
      </div>
      <button
        onClick={handleSaveProgress}
        disabled={loading}
        className="font-pixel text-[8px] text-[#bf5fff] hover:text-[#d080ff] border border-[#bf5fff]/50 hover:border-[#bf5fff] px-2 py-1 transition-colors disabled:opacity-50"
      >
        {loading ? '...' : 'SAVE PROGRESS'}
      </button>
    </div>
  )
}
