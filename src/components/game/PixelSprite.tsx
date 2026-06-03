'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import type { AvatarClass } from '@/types'

export type SpriteDirection =
  | 'south' | 'south-east' | 'east' | 'north-east'
  | 'north' | 'north-west' | 'west' | 'south-west'

// Clockwise walk cycle starting south (facing player)
const WALK_CYCLE: SpriteDirection[] = [
  'south', 'south-east', 'east', 'north-east',
  'north', 'north-west', 'west', 'south-west',
]

// Map each avatar class to its sprite folder name under /public/sprites/
// Add an entry here as sprites are dropped into the project.
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

interface PixelSpriteProps {
  spriteId: string
  direction?: SpriteDirection  // pin to one direction; omit to let animate cycle
  scale?: number               // display size = 24 × scale (default 4 → 96 px)
  animate?: boolean            // bob up/down + cycle all 8 directions
  className?: string
}

export function PixelSprite({
  spriteId,
  direction: pinned,
  scale = 4,
  animate = false,
  className = '',
}: PixelSpriteProps) {
  const NATIVE_PX = 24
  const displayPx = NATIVE_PX * scale

  const [dirIdx, setDirIdx] = useState(0)
  const direction = pinned ?? (animate ? WALK_CYCLE[dirIdx] : 'south')

  useEffect(() => {
    if (!animate || pinned) return
    const id = setInterval(() => setDirIdx(i => (i + 1) % WALK_CYCLE.length), 180)
    return () => clearInterval(id)
  }, [animate, pinned])

  return (
    <motion.div
      className={`relative flex-shrink-0 ${className}`}
      style={{ width: displayPx, height: displayPx }}
      animate={animate ? { y: [0, -3, 0] } : { y: 0 }}
      transition={animate ? { duration: 0.45, repeat: Infinity, ease: 'easeInOut' } : {}}
    >
      <Image
        src={`/sprites/${spriteId}/${direction}.png`}
        alt={`${spriteId} facing ${direction}`}
        width={displayPx}
        height={displayPx}
        unoptimized
        style={{ imageRendering: 'pixelated', width: displayPx, height: displayPx }}
      />
    </motion.div>
  )
}
