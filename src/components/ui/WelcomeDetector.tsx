'use client'

import { useEffect } from 'react'

export function WelcomeDetector({ crewId }: { crewId: string }) {
  useEffect(() => {
    localStorage.setItem('nexus_crew_created', '1')
    // Strip ?welcome=1 from the URL bar without triggering a Next.js navigation
    // (router.replace re-renders the server component, which can cause MessageList
    // to remount and reset historyLoaded — window.history.replaceState is a no-op
    // for React and avoids the skeleton flicker)
    window.history.replaceState(null, '', `/chat/${crewId}`)
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
