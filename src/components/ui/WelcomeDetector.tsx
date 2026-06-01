'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function WelcomeDetector({ crewId }: { crewId: string }) {
  const router = useRouter()

  useEffect(() => {
    localStorage.setItem('nexus_crew_created', '1')
    // Strip the ?welcome=1 param without a hard reload
    router.replace(`/chat/${crewId}`)
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
