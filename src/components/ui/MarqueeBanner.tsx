'use client'

import { useRef, useState, useLayoutEffect } from 'react'
import { motion } from 'framer-motion'

export interface MarqueeItem {
  text: string
  suffix?: string
}

interface MarqueeBannerProps {
  // Single-item mode (backwards compat — ProfileStatusTicker)
  text?: string
  suffix?: string
  // Multi-item mode
  items?: MarqueeItem[]
  icon: React.ReactNode
  onClick?: () => void
  quoted?: boolean
}

export function MarqueeBanner({ text, suffix, items, icon, onClick, quoted }: MarqueeBannerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const groupRef     = useRef<HTMLSpanElement>(null)
  const [numCopies, setNumCopies] = useState(4)
  const [animPx,    setAnimPx]    = useState(0)
  const [duration,  setDuration]  = useState(20)

  // Normalise to items array — single text prop → one-element array
  const effectiveItems: MarqueeItem[] = items ?? (text != null ? [{ text, suffix }] : [])
  const cacheKey = effectiveItems.map((i) => i.text + (i.suffix ?? '')).join('|')

  useLayoutEffect(() => {
    const container = containerRef.current
    const group     = groupRef.current
    if (!container || !group) return
    const cw = container.clientWidth
    const gw = group.offsetWidth
    if (gw <= 0) return
    // Enough copies so content never runs out during the scroll cycle
    const n = Math.max(3, Math.ceil(cw / gw) + 2)
    setNumCopies(n)
    setAnimPx(gw)
    // ~30 px/s; minimum 12 s so slow content doesn't zip
    setDuration(Math.max(12, gw / 30))
  }, [cacheKey])

  // Render one complete "group" = all items side by side with • separators
  function renderGroup(idx: number, ref?: React.Ref<HTMLSpanElement>) {
    return (
      <span
        key={idx}
        ref={ref}
        className="inline-flex items-center flex-shrink-0 whitespace-nowrap"
        style={{ paddingRight: 24 }}
      >
        {effectiveItems.map((item, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            {i > 0 && (
              <span
                className="font-silkscreen text-tertiary leading-none"
                style={{ fontSize: 'var(--text-xxs)', opacity: 0.35, paddingLeft: 10, paddingRight: 10 }}
              >
                •
              </span>
            )}
            {icon}
            <span className="font-silkscreen text-tertiary leading-none" style={{ fontSize: 'var(--text-xxs)' }}>
              {quoted ? `"${item.text}"` : item.text}
            </span>
            {item.suffix && (
              <span
                className="font-silkscreen leading-none"
                style={{ fontSize: 'var(--text-xxs)', color: 'var(--color-blue)', opacity: 0.7 }}
              >
                {item.suffix}
              </span>
            )}
          </span>
        ))}
      </span>
    )
  }

  const inner = (
    <motion.div
      key={cacheKey}
      className="flex"
      initial={{ x: 0 }}
      animate={{ x: animPx > 0 ? [0, -animPx] : 0 }}
      transition={{ duration, repeat: Infinity, ease: 'linear', repeatType: 'loop' }}
    >
      {Array.from({ length: numCopies }, (_, i) =>
        renderGroup(i, i === 0 ? groupRef : undefined)
      )}
    </motion.div>
  )

  if (onClick) {
    return (
      <div
        ref={containerRef}
        className="overflow-hidden border-t border-b border-border bg-black w-full"
        style={{ paddingTop: 12, paddingBottom: 12 }}
      >
        <button onClick={onClick} aria-label="Go to pinned message" className="block w-full overflow-hidden text-left">
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
