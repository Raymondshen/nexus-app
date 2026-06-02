'use client'

import Image from 'next/image'

interface AvatarProps {
  username:   string
  avatarUrl?: string | null
  size?:      number
  className?: string
  style?:     React.CSSProperties
}

/**
 * Shows a Google/Supabase profile picture via next/image (cached by Vercel CDN).
 * Falls back to a styled initials box using the caller's className + style.
 */
export function Avatar({ username, avatarUrl, size = 28, className = '', style }: AvatarProps) {
  const initial = username[0]?.toUpperCase() ?? '?'

  if (avatarUrl) {
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
