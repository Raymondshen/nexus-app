'use client'

import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

// Shared frame-index cycling for the app's several small looping pixel-sprite
// animations (WaveGhost/SleepingGhost in ChatRoomBrowseSheet.tsx, PeekGhost in
// ChatRoomPeekLayer.tsx) — each renders a DIFFERENT sprite sheet with its own crop
// math, frame count, and filename pattern (0- vs 1-indexed, .png vs .webp), so this
// only extracts the one part that was already byte-for-byte identical across all of
// them: a `setInterval`-driven frame index that increments and wraps every
// `intervalMs`. Returns the raw 0-based index — callers format their own asset path
// from it (1-indexed assets just do `frame + 1`).
//
// Also fixes a real gap none of those call sites had before: `prefers-reduced-motion`
// wasn't checked at all, so a reduced-motion user got the same continuous animation as
// everyone else. This hook stays pinned to frame 0 for that user instead, same
// resting-frame behavior `LaunchSplashContent`'s own sprite already had (that one
// isn't migrated to this hook — its frame effect also runs a one-time asset-preload
// loop alongside the interval, and it sits on the launch-critical path, so it keeps
// its bespoke implementation rather than being touched incidentally here).
export function useSpriteFrameLoop(frameCount: number, intervalMs: number): number {
  const reduceMotion = !!useReducedMotion()
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    if (reduceMotion) return
    const id = setInterval(() => setFrame((f) => (f + 1) % frameCount), intervalMs)
    return () => clearInterval(id)
  }, [reduceMotion, frameCount, intervalMs])

  return frame
}
