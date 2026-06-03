'use client'

import { useState, useEffect, useRef } from 'react'
import type { AvatarClass } from '@/types'

export type SpriteDirection =
  | 'south' | 'south-east' | 'east' | 'north-east'
  | 'north' | 'north-west' | 'west' | 'south-west'

const WALK_CYCLE: SpriteDirection[] = [
  'south', 'south-east', 'east', 'north-east',
  'north', 'north-west', 'west', 'south-west',
]

// Add an entry here as sprite folders are dropped into public/sprites/{key}/
const CLASS_TO_SPRITE: Partial<Record<AvatarClass | 'necromancer', string>> = {
  necromancer: 'necromancer',
  // berserker:   'berserker',
  // sage:        'sage',
  // ghost:       'ghost',
  // hype_man:    'hype_man',
  // the_voice:   'the_voice',
  // meme_lord:   'meme_lord',
}

export function spriteIdFor(avatarClass: AvatarClass | string | null | undefined): string | null {
  if (!avatarClass) return null
  return CLASS_TO_SPRITE[avatarClass as AvatarClass] ?? null
}

// Inject the pixel-bob keyframe once per document
const BOB_STYLE = `@keyframes pixel-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}`
function useGlobalStyle(css: string) {
  useEffect(() => {
    if (document.getElementById('pixel-bob-style')) return
    const el = document.createElement('style')
    el.id  = 'pixel-bob-style'
    el.textContent = css
    document.head.appendChild(el)
  }, [css])
}

interface PixelSpriteProps {
  spriteId: string
  direction?: SpriteDirection
  scale?: number      // display size = 24 × scale (default 4 → 96 px)
  animate?: boolean   // direction cycling + pixel-bob
  className?: string
}

export function PixelSprite({
  spriteId,
  direction: pinned,
  scale = 4,
  animate = false,
  className = '',
}: PixelSpriteProps) {
  useGlobalStyle(BOB_STYLE)

  const NATIVE_PX = 24
  const displayPx = NATIVE_PX * scale

  const [dirIdx, setDirIdx] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!animate || pinned) return
    intervalRef.current = setInterval(
      () => setDirIdx(i => (i + 1) % WALK_CYCLE.length),
      180,
    )
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [animate, pinned])

  const direction = pinned ?? (animate ? WALK_CYCLE[dirIdx] : 'south')

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/sprites/${spriteId}/${direction}.png`}
      alt={`${spriteId} ${direction}`}
      width={displayPx}
      height={displayPx}
      className={className}
      style={{
        imageRendering: 'pixelated',
        width:  displayPx,
        height: displayPx,
        flexShrink: 0,
        animation: animate ? 'pixel-bob 0.45s ease-in-out infinite' : 'none',
        display: 'block',
      }}
    />
  )
}
