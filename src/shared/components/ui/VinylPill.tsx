'use client'

import { useState, useLayoutEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { avatarImageLoader } from '@/shared/supabase/imageLoader'

interface VinylPillProps {
  imageUrl: string | null
  title:    string | null
  /**
   * Stretch to the row's full cross-axis height instead of hugging content height —
   * Figma 377:5409's "vinyl track" is self-stretch so it matches the adjacent username
   * pill's height exactly. MessageBubble's header row (a flex row) wants this; UserCard's
   * column layout (Figma 356:3503) wants the default flex-start so the pill hugs left
   * instead of stretching to the card's full width.
   */
  stretch?: boolean
}

// Shared by MessageBubble's header row and SquadDetailsSheet's member cards —
// same pill exactly, just different call-site contexts.
export function VinylPill({ imageUrl, title, stretch = false }: VinylPillProps) {
  const measureRef = useRef<HTMLSpanElement>(null)
  const [textWidth, setTextWidth] = useState(0)
  const TITLE_W = 32

  useLayoutEffect(() => {
    if (!measureRef.current || !title) return
    setTextWidth(measureRef.current.scrollWidth)
  }, [title])

  const needsTicker = textWidth > TITLE_W
  const tickerDur   = Math.max(3, (textWidth / TITLE_W) * 2.5)

  return (
    <div
      style={{
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
      }}
    >
      {/* 12×12 spinning vinyl disc */}
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

      {/* Scrolling title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {title && (
          <>
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
          </>
        )}
      </div>
    </div>
  )
}
