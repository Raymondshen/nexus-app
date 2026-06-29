'use client'

import Image from 'next/image'
import { useState } from 'react'
import { avatarImageLoader } from '@/shared/supabase/imageLoader'

interface AvatarProps {
  username:   string
  avatarUrl?: string | null
  size?:      number
  className?: string
  style?:     React.CSSProperties
  priority?:  boolean
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
          src={avatarUrl}
          alt={username}
          fill
          sizes={`${size}px`}
          className="object-cover"
          priority={priority}
          loader={avatarImageLoader}
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
