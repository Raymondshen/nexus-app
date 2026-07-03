'use client'

import Image from 'next/image'
import { avatarImageLoader } from '@/shared/supabase/imageLoader'

export interface GroupAvatarProps {
  imageUrl?:  string | null
  name?:      string | null
  size?:      number
  priority?:  boolean
  className?: string
  style?:     React.CSSProperties
}

// Single component for all crew/squad profile-image rendering. Mirrors UserAvatar's
// loader (resize + quality-compress via the Supabase render API) but falls back to the
// pixel ghost icon instead of an initial letter — matching the home squad-row preview.
export function GroupAvatar({
  imageUrl,
  name,
  size = 48,
  priority = false,
  className = '',
  style,
}: GroupAvatarProps) {
  return (
    <div
      className={`relative flex-shrink-0 overflow-hidden flex items-center justify-center${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size, ...style }}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={name ?? ''}
          fill
          sizes={`${size}px`}
          className="object-cover"
          priority={priority}
          loader={avatarImageLoader}
        />
      ) : (
        <img src="/icons/ghost-fallback.svg" alt="" className="w-full h-full" style={{ imageRendering: 'pixelated' }} />
      )}
    </div>
  )
}
