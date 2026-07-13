'use client'

import { useRef, useState, useLayoutEffect } from 'react'
import { motion } from 'framer-motion'

interface TickerBannerProps {
  text: string
}

function Dot() {
  return (
    <span
      style={{
        display:     'inline-block',
        flexShrink:  0,
        width:       2,
        height:      2,
        background:  '#d9d9d9',
        border:      '1px solid var(--color-border-hover)',
        marginLeft:  8,
        marginRight: 8,
      }}
    />
  )
}

// Figma 189:1767 (Status ticker) — pixel-art quote glyph, not a pixelarticons icon.
// Always paired with the quoted text, so it's baked into the ticker itself rather
// than left for every caller to pass (and inevitably mismatch shape/color).
function QuoteIcon() {
  return (
    <svg width={8} height={8} viewBox="0 0 8 8" aria-hidden="true">
      <path
        d="M4 7.33333H2.66667V6.66667H3.33333V5.33333H2.66667V6.66667H2V5.33333H1.33333V4.66667H2.66667V2.66667H1.33333V2H5.33333V2.66667H3.33333V4.66667H5.33333V5.33333H4V7.33333ZM7.33333 6.66667H6V6H6.66667V1.33333H6V0.666667H7.33333V6.66667ZM6 6H5.33333V5.33333H6V6ZM1.33333 4.66667H0.666667V2.66667H1.33333V4.66667ZM6 2H5.33333V1.33333H6V2Z"
        fill="var(--color-secondary)"
      />
    </svg>
  )
}

// Figma 189:1767 — shared status/mood ticker. The sole place that renders this
// pattern; don't hand-roll a second marquee for a status string elsewhere.
export function TickerBanner({ text }: TickerBannerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRef      = useRef<HTMLSpanElement>(null)
  const [numCopies, setNumCopies] = useState(6)
  const [animPx,    setAnimPx]    = useState(0)

  useLayoutEffect(() => {
    const container = containerRef.current
    const item      = itemRef.current
    if (!container || !item) return
    const cw = container.clientWidth
    const iw = item.offsetWidth
    if (iw <= 0) return
    const halfNeeded = Math.ceil(cw / iw) + 1
    const n          = Math.max(4, halfNeeded % 2 === 0 ? halfNeeded * 2 : (halfNeeded + 1) * 2)
    setNumCopies(n)
    setAnimPx(iw * (n / 2))
  }, [text])

  const duration    = Math.max(21, text.length * 0.28 + 15)
  const displayText = `“${text}”`

  return (
    <div
      ref={containerRef}
      className="overflow-hidden border-t border-b border-border px-2"
      style={{ paddingTop: 12, paddingBottom: 12 }}
    >
      <motion.div
        key={text}
        className="flex"
        initial={{ x: 0 }}
        animate={{ x: animPx > 0 ? [0, -animPx] : 0 }}
        transition={{ duration, repeat: Infinity, ease: 'linear', repeatType: 'loop' }}
      >
        {Array.from({ length: numCopies }, (_, i) => (
          <span
            key={i}
            ref={i === 0 ? itemRef : undefined}
            className="inline-flex items-center flex-shrink-0 whitespace-nowrap"
          >
            <span className="inline-flex items-center" style={{ gap: 4 }}>
              <QuoteIcon />
              <span
                className="font-silkscreen leading-none"
                style={{ fontSize: 'var(--text-xxs)', color: 'var(--color-secondary)' }}
              >
                {displayText}
              </span>
            </span>
            <Dot />
          </span>
        ))}
      </motion.div>
    </div>
  )
}
