'use client'

import { useEffect } from 'react'
import { useSpriteFrameLoop } from '@/shared/hooks/useSpriteFrameLoop'
import {
  GHOST_LAUNCH_FRAME_COUNT,
  GHOST_LAUNCH_FRAME_MS,
  ghostLaunchFrameSrc,
  preloadGhostLaunchFrames,
} from '@/shared/constants/ghostLaunchSprite'

// The "launch 1" ghost (Figma 774:19681 "launch 1" / 774:20394, same node used
// at both 64px sites below) — extracted out of LoginForm's own LandingGhost
// once ChatroomEmptyScreen became a second 64px consumer of the exact same
// sprite/crop, rather than hand-rolling a third near-identical copy (see
// CLAUDE.md's Gotchas entry on this exact class of drift). Not launch-critical
// (unlike LaunchSplashContent's own copy, which stays bespoke — see
// useSpriteFrameLoop's doc comment), so this goes through the shared
// useSpriteFrameLoop hook, plus its own one-time frame preload so the first
// cycle through all 9 frames on a cold cache doesn't flash a blank frame.
//
// The 56x56 sprite frames carry a lot of baked-in transparent padding around
// the actual ghost — measured directly off each frame's alpha channel (union
// bounding box across all 9 frames): content sits roughly in x:[16,38]
// y:[15,38] of the 56x56 canvas. These crop values are re-derived from that
// real bounding box (padded evenly around it) rather than the raw Figma
// export's own (imprecise) crop numbers, so the fill is pixel-accurate for
// the actual file on disk at any square display size.
const GHOST_CROP_SCALE = '175%'
const GHOST_CROP_LEFT  = '-34.38%'
const GHOST_CROP_TOP   = '-32.81%'

export function GhostLaunchSprite({ size = 64 }: { size?: number }) {
  const frame = useSpriteFrameLoop(GHOST_LAUNCH_FRAME_COUNT, GHOST_LAUNCH_FRAME_MS)

  useEffect(() => {
    preloadGhostLaunchFrames()
  }, [])

  return (
    <div
      className="absolute top-1/2 left-1/2 overflow-hidden pointer-events-none"
      style={{ width: size, height: size, transform: 'translate(-50%, -50%)' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ghostLaunchFrameSrc(frame)}
        alt=""
        aria-hidden="true"
        style={{
          position:       'absolute',
          left:           GHOST_CROP_LEFT,
          top:            GHOST_CROP_TOP,
          width:          GHOST_CROP_SCALE,
          height:         GHOST_CROP_SCALE,
          maxWidth:       'none',
          imageRendering: 'pixelated',
        }}
      />
    </div>
  )
}
