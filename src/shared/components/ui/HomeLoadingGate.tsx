'use client'

import { useLayoutEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { NexusWordmark } from './NexusWordmark'

// Session-scoped: the splash plays once per tab, not on every return trip to
// /home (e.g. tapping back from a squad) — matches nexus_chat_from and other
// one-shot sessionStorage flags elsewhere in the app.
const SPLASH_SEEN_KEY = 'nexus_home_splash_shown'
const MIN_DISPLAY_MS = 900
const FADE_DURATION_S = 0.7

// Wraps HomeClient's content with the NEXUS splash from Figma 541:2106.
// By the time HomeClient mounts, the server component (`home/page.tsx`) has
// already awaited crews + message previews, so "loaded" is just "mounted" —
// this only holds the splash up for a minimum branded duration before fading.
// `home/loading.tsx` renders the same wordmark as the Suspense fallback while
// the server request is in flight, so the handoff into this gate is a no-op
// visual swap (both screens are pixel-identical), and the fade-out here is
// what's actually visible to the user.
export function HomeLoadingGate({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(true)
  const [fading, setFading] = useState(false)

  useLayoutEffect(() => {
    if (sessionStorage.getItem(SPLASH_SEEN_KEY)) {
      setVisible(false)
      return
    }
    sessionStorage.setItem(SPLASH_SEEN_KEY, '1')
    const t = setTimeout(() => setFading(true), MIN_DISPLAY_MS)
    return () => clearTimeout(t)
  }, [])

  return (
    <>
      {children}
      {visible && (
        <motion.div
          className="fixed inset-0 z-[200] bg-black flex items-center justify-center"
          style={{ pointerEvents: fading ? 'none' : 'auto' }}
          initial={{ opacity: 1 }}
          animate={{ opacity: fading ? 0 : 1 }}
          transition={{ duration: FADE_DURATION_S, ease: 'easeInOut' }}
          onAnimationComplete={() => { if (fading) setVisible(false) }}
        >
          <NexusWordmark />
        </motion.div>
      )}
    </>
  )
}
