'use client'

import Image from 'next/image'
import { useState } from 'react'

interface AvatarProps {
  username:   string
  avatarUrl?: string | null
  size?:      number
  className?: string
  style?:     React.CSSProperties
  priority?:  boolean
}

export function isSupabaseStorage(url: string): boolean {
  return url.includes('.supabase.co/storage/v1/object/public/')
}

/**
 * Swap the -256 (or -512) size suffix to -128 for display sizes ≤ 64 CSS px.
 * 128px covers 2× DPI for all small avatar slots; larger heroes keep the 256px source.
 * URLs that don't match the pattern (legacy single-file, Google OAuth) are returned unchanged.
 */
export function resolveAvatarUrl(url: string, displaySize: number): string {
  if (displaySize > 64) return url
  return url.replace(/-(256|512)\.(webp|jpg|png)$/, '-128.$2')
}

export function Avatar({ username, avatarUrl, size = 28, className = '', style, priority = false }: AvatarProps) {
  const initial = username[0]?.toUpperCase() ?? '?'
  const [imgError, setImgError] = useState(false)

  if (avatarUrl && !imgError) {
    return (
      <div
        className={`relative overflow-hidden flex-shrink-0 ${className}`}
        style={{ width: size, height: size, ...style }}
      >
        <Image
          src={resolveAvatarUrl(avatarUrl, size)}
          alt={username}
          fill
          sizes={`${size}px`}
          className="object-cover"
          priority={priority}
          unoptimized={isSupabaseStorage(avatarUrl)}
          onError={() => setImgError(true)}
        />
      </div>
    )
  }

  return (
    <div
      className={`flex-shrink-0 flex items-center justify-center ${className}`}
      style={{ width: size, height: size, ...style }}
    >
      {initial}
    </div>
  )
}
