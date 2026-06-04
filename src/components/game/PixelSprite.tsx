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
// nativePx = the sprite sheet's actual pixel dimensions (determines integer scale)
const CLASS_TO_SPRITE: Partial<Record<AvatarClass | 'necromancer', { folder: string; nativePx: number }>> = {
  necromancer: { folder: 'necromancer', nativePx: 24 },
  mage:        { folder: 'mage',        nativePx: 28 },
  warrior:     { folder: 'warrior',     nativePx: 28 },
  rogue:       { folder: 'rogue',       nativePx: 28 },
  healer:      { folder: 'healer',      nativePx: 28 },
  archer:      { folder: 'archer',      nativePx: 32 },
  // berserker:   { folder: 'berserker', nativePx: 24 },
  // sage:        { folder: 'sage',      nativePx: 24 },
  // ghost:       { folder: 'ghost',     nativePx: 24 },
  // hype_man:    { folder: 'hype_man',  nativePx: 24 },
  // the_voice:   { folder: 'the_voice', nativePx: 24 },
  // meme_lord:   { folder: 'meme_lord', nativePx: 24 },
}

export function spriteIdFor(avatarClass: AvatarClass | string | null | undefined): string | null {
  if (!avatarClass) return null
  return CLASS_TO_SPRITE[avatarClass as AvatarClass]?.folder ?? null
}

export function spriteInfoFor(avatarClass: AvatarClass | string | null | undefined): { id: string; nativePx: number } | null {
  if (!avatarClass) return null
  const entry = CLASS_TO_SPRITE[avatarClass as AvatarClass]
  if (!entry) return null
  return { id: entry.folder, nativePx: entry.nativePx }
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
  spriteId:  string
  nativePx?: number       // native sprite size; use spriteInfoFor() to get the correct value
  direction?: SpriteDirection
  scale?: number          // display size = nativePx × scale (default 4)
  animate?: boolean       // direction cycling + pixel-bob
  className?: string
}

export function PixelSprite({
  spriteId,
  nativePx = 24,
  direction: pinned,
  scale = 4,
  animate = false,
  className = '',
}: PixelSpriteProps) {
  useGlobalStyle(BOB_STYLE)

  const displayPx = nativePx * scale

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
