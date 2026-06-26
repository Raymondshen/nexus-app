'use client'

import { useRef, useState, useLayoutEffect } from 'react'
import { motion } from 'framer-motion'

interface TickerBannerProps {
  text: string
  icon: React.ReactNode
  quoted?: boolean
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

export function TickerBanner({ text, icon, quoted }: TickerBannerProps) {
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
  const displayText = quoted ? `"${text}"` : text

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
              {icon}
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
