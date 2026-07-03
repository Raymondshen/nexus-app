'use client'

import Image from 'next/image'
import { avatarImageLoader } from '@/shared/supabase/imageLoader'

const BG: Record<'surface' | 'border' | 'primary', string> = {
  surface: 'var(--color-surface)',
  border:  'var(--color-border)',
  primary: 'var(--color-primary)',
}

const TEXT_COLOR: Record<'purple' | 'primary' | 'black' | 'white', string> = {
  purple:  'var(--color-purple)',
  primary: 'var(--color-primary)',
  black:   '#000',
  white:   '#fff',
}

function initialFontSize(size: number): number {
  if (size <= 16) return 4
  if (size <= 20) return 6
  if (size <= 36) return 8
  if (size <= 52) return 10
  return 12
}

export interface UserAvatarProps {
  username?:     string | null
  avatarUrl?:    string | null
  size?:         number
  shape?:        'circle' | 'square'
  bg?:           'surface' | 'border' | 'primary'
  /** CSS color for the fallback state when no avatarUrl (overrides bg for the inner div) */
  fallbackBg?:   string
  initialColor?: 'purple' | 'primary' | 'black' | 'white'
  priority?:     boolean
  className?:    string
  style?:        React.CSSProperties
}

export function UserAvatar({
  username,
  avatarUrl,
  size = 32,
  shape = 'circle',
  bg = 'surface',
  fallbackBg,
  initialColor = 'purple',
  priority = false,
  className = '',
  style,
}: UserAvatarProps) {
  const initial      = username?.[0]?.toUpperCase() ?? '?'
  const borderRadius = shape === 'circle' ? '50%' : undefined

  return (
    <div
      className={`relative flex-shrink-0 overflow-hidden${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size, background: BG[bg], borderRadius, ...style }}
    >
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={username ?? ''}
          fill
          sizes={`${size}px`}
          className="object-cover"
          priority={priority}
          loader={avatarImageLoader}
        />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center"
          style={fallbackBg ? { background: fallbackBg } : undefined}
        >
          <span
            className="font-pixel"
            style={{ fontSize: initialFontSize(size), color: TEXT_COLOR[initialColor] }}
          >
            {initial}
          </span>
        </div>
      )}
    </div>
  )
}
