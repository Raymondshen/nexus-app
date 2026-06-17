'use client'

import { useRef, useState, useLayoutEffect } from 'react'
import { motion } from 'framer-motion'

interface MarqueeBannerProps {
  text: string
  suffix?: string
  icon: React.ReactNode
  onClick?: () => void
  quoted?: boolean
}

export function MarqueeBanner({ text, suffix, icon, onClick, quoted }: MarqueeBannerProps) {
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
  }, [text, suffix])

  const duration = Math.max(21, text.length * 0.28 + 15)

  const inner = (
    <motion.div
      key={text + (suffix ?? '')}
      className="flex"
      initial={{ x: 0 }}
      animate={{ x: animPx > 0 ? [0, -animPx] : 0 }}
      transition={{ duration, repeat: Infinity, ease: 'linear', repeatType: 'loop' }}
    >
      {Array.from({ length: numCopies }, (_, i) => (
        <span
          key={i}
          ref={i === 0 ? itemRef : undefined}
          className="inline-flex items-center gap-1 pr-6 flex-shrink-0 whitespace-nowrap"
        >
          {icon}
          <span className="font-silkscreen text-tertiary leading-none" style={{ fontSize: 'var(--text-xxs)' }}>
            {quoted ? `“${text}”` : text}
          </span>
          {suffix && (
            <span
              className="font-silkscreen leading-none"
              style={{ fontSize: 'var(--text-xxs)', color: 'var(--color-blue)', opacity: 0.7 }}
            >
              {suffix}
            </span>
          )}
        </span>
      ))}
    </motion.div>
  )

  if (onClick) {
    return (
      <div ref={containerRef} className="overflow-hidden border-t border-b border-border bg-black w-full" style={{ paddingTop: 12, paddingBottom: 12 }}>
        <button
          onClick={onClick}
          aria-label="Go to pinned message"
          className="block w-full overflow-hidden text-left"
        >
          {inner}
        </button>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="overflow-hidden border-t border-b border-border bg-black w-full"
      style={{ paddingTop: 12, paddingBottom: 12 }}
    >
      {inner}
    </div>
  )
}
