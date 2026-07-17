'use client'

import { useState, useLayoutEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { Link } from 'pixelarticons/react/Link'
import { avatarImageLoader } from '@/shared/supabase/imageLoader'

export type LinkPillType = 'vinyl' | 'instagram' | 'x' | 'reddit' | 'linkedin' | 'custom'

const SOCIAL_ICON_SRC: Partial<Record<LinkPillType, string>> = {
  instagram: '/icons/social-instagram.svg',
  x:         '/icons/social-x.svg',
  reddit:    '/icons/social-reddit.svg',
  linkedin:  '/icons/social-linkedin.svg',
}

interface LinkPillProps {
  type:      LinkPillType
  /** vinyl only — the pinned track's cover art */
  imageUrl?: string | null
  /** vinyl only — track title; scrolls if it overflows the 32px label box */
  title?:    string | null
  /** social/custom only — wraps the pill in a new-tab link when set; omit for a non-interactive preview pill */
  href?:     string | null
  /** social/custom only — handle/hostname shown in the 32px label box, ellipsis-truncated (no ticker) */
  label?:    string | null
  /**
   * Stretch to the row's full cross-axis height instead of hugging content height —
   * Figma 377:5409's "vinyl track" is self-stretch so it matches the adjacent username
   * pill's height exactly. MessageBubble's header row (a flex row) wants this; UserCard's
   * column layout (Figma 356:3503) wants the default flex-start so the pill hugs left
   * instead of stretching to the card's full width.
   */
  stretch?:  boolean
}

const TITLE_W = 32

// Shared pill shell (Figma 105:533's "ButtonPill") for two unrelated use cases that
// happen to share identical geometry: MessageBubble's header row + SquadDetailsSheet's
// member cards (the pinned "vinyl" track), and the profile hero's social-link row
// (Instagram/X/Reddit/LinkedIn/Custom Site). Only the icon + label content differ.
export function LinkPill({ type, imageUrl = null, title = null, href = null, label = null, stretch = false }: LinkPillProps) {
  const isVinyl = type === 'vinyl'

  const measureRef = useRef<HTMLSpanElement>(null)
  const [textWidth, setTextWidth] = useState(0)

  useLayoutEffect(() => {
    if (!isVinyl || !measureRef.current || !title) return
    setTextWidth(measureRef.current.scrollWidth)
  }, [isVinyl, title])

  const needsTicker = isVinyl && textWidth > TITLE_W
  const tickerDur   = Math.max(3, (textWidth / TITLE_W) * 2.5)

  const pillStyle: CSSProperties = {
    display:       'inline-flex',
    alignItems:    'center',
    gap:           4,
    background:    'var(--color-surface-sheet)',
    borderRadius:  56,
    padding:       4,
    flexShrink:    0,
    alignSelf:     stretch ? 'stretch' : 'flex-start',
    width:         'fit-content',
    position:      'relative',
  }

  const icon = isVinyl ? (
    // 12×12 spinning vinyl disc
    <div
      className="animate-vinyl"
      style={{ width: 12, height: 12, borderRadius: 6.4, overflow: 'hidden', position: 'relative', flexShrink: 0 }}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          aria-hidden
          fill
          sizes="12px"
          className="object-cover"
          loader={avatarImageLoader}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: 'var(--color-surface)' }} />
      )}
      {/* Center hole */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 0.914, height: 0.914, borderRadius: '50%', background: 'black', border: '0.114px solid var(--color-border)', flexShrink: 0 }} />
      </div>
    </div>
  ) : type === 'custom' ? (
    <Link style={{ width: 12, height: 12, color: 'var(--color-muted)' }} aria-hidden="true" />
  ) : (
    // 12×12 circular platform badge (pixelarticons has no brand marks, so this is a
    // static asset — see public/icons/social-*.svg)
    <div style={{ width: 12, height: 12, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={SOCIAL_ICON_SRC[type]} alt="" aria-hidden style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  )

  const labelNode = isVinyl ? (
    title && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {/* Off-viewport span used only for measuring rendered text width */}
        <span
          ref={measureRef}
          aria-hidden
          className="font-silkscreen"
          style={{
            fontSize:      8,
            whiteSpace:    'nowrap',
            letterSpacing: '0.1px',
            position:      'fixed',
            left:          -9999,
            top:           0,
            visibility:    'hidden',
            pointerEvents: 'none',
            zIndex:        -1,
          }}
        >
          {title}
        </span>

        {/* 32px wide clipping container */}
        <div style={{ width: TITLE_W, overflow: 'hidden', flexShrink: 0 }}>
          {needsTicker ? (
            <motion.div
              className="flex"
              animate={{ x: [0, -(textWidth + 16)] }}
              transition={{ duration: tickerDur, repeat: Infinity, ease: 'linear', repeatType: 'loop' }}
            >
              <span className="font-silkscreen leading-none" style={{ fontSize: 8, color: 'var(--color-muted)', whiteSpace: 'nowrap', letterSpacing: '0.1px', flexShrink: 0 }}>
                {title}
              </span>
              <span className="font-silkscreen leading-none" style={{ fontSize: 8, color: 'var(--color-tertiary)', whiteSpace: 'nowrap', letterSpacing: '0.1px', paddingLeft: 16, flexShrink: 0 }}>
                {title}
              </span>
            </motion.div>
          ) : (
            <span className="font-silkscreen leading-none" style={{ fontSize: 8, color: 'var(--color-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', letterSpacing: '0.1px' }}>
              {title}
            </span>
          )}
        </div>
      </div>
    )
  ) : (
    label && (
      <span
        className="font-silkscreen leading-none"
        style={{ fontSize: 8, color: 'var(--color-blue)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', width: TITLE_W, letterSpacing: '0.1px' }}
      >
        {label}
      </span>
    )
  )

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={pillStyle}>
        {icon}
        {labelNode}
      </a>
    )
  }

  return (
    <div style={pillStyle}>
      {icon}
      {labelNode}
    </div>
  )
}
