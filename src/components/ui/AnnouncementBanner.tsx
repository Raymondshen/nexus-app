'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { PanInfo } from 'framer-motion'
import { Megaphone } from 'pixelarticons/react/Megaphone'
import { Close } from 'pixelarticons/react/Close'

export interface AnnouncementItem {
  id:   string
  text: string
}

const STORAGE_KEY = 'nexus_dismissed_banners'

function getDismissed(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[]) }
  catch { return new Set() }
}

const slideVariants = {
  enter:  (dir: number) => ({ x: dir > 0 ? 30 : -30, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:   (dir: number) => ({ x: dir < 0 ? 30 : -30, opacity: 0 }),
}

export function AnnouncementBanner({ announcements }: { announcements: AnnouncementItem[] }) {
  const [mounted,        setMounted] = useState(false)
  const [visible,        setVisible] = useState<AnnouncementItem[]>([])
  const [[idx, dir], setPage]        = useState<[number, number]>([0, 0])

  useEffect(() => {
    const dismissed = getDismissed()
    setVisible(announcements.filter(a => !dismissed.has(a.id)))
    setMounted(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted || visible.length === 0) return null

  const safeIdx = Math.min(idx, visible.length - 1)
  const current = visible[safeIdx]
  const showDots = visible.length > 1

  function go(newDir: number) {
    const next = safeIdx + newDir
    if (next < 0 || next >= visible.length) return
    setPage([next, newDir])
  }

  function dismiss() {
    const dismissed = getDismissed()
    dismissed.add(current.id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...dismissed]))
    setVisible(prev => {
      const next    = prev.filter(a => a.id !== current.id)
      const newIdx  = safeIdx >= next.length ? Math.max(0, next.length - 1) : safeIdx
      setPage([newIdx, -1])
      return next
    })
  }

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x < -40)     go(1)
    else if (info.offset.x > 40) go(-1)
  }

  return (
    <div
      className="w-full rounded-[8px] overflow-hidden flex-shrink-0"
      style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid var(--color-blue)' }}
    >
      <AnimatePresence initial={false} custom={dir} mode="wait">
        <motion.div
          key={current.id}
          custom={dir}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.16, ease: 'easeOut' }}
          drag={showDots ? 'x' : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          onDragEnd={handleDragEnd}
          className="flex items-center gap-4 px-4 pt-4"
          style={{ paddingBottom: showDots ? 8 : 16, cursor: showDots ? 'grab' : 'default' }}
        >
          {/* Megaphone icon — Figma 153:1777 */}
          <Megaphone
            style={{ width: 16, height: 16, color: 'var(--color-blue)', flexShrink: 0 }}
            aria-hidden="true"
          />

          {/* Label + text — Figma 146:1707 */}
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <p
              className="font-silkscreen leading-none text-secondary"
              style={{ fontSize: 'var(--text-mini)' }}
            >
              NEW UPDATES
            </p>
            <p
              className="font-body font-normal text-secondary leading-snug"
              style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}
            >
              {current.text}
            </p>
          </div>

          {/* Dismiss — Figma 153:1782 */}
          <button
            onClick={dismiss}
            className="flex-shrink-0 flex items-center justify-center active:opacity-70 transition-opacity"
            style={{ width: 16, height: 16 }}
            aria-label="Dismiss announcement"
          >
            <Close style={{ width: 16, height: 16, color: 'var(--color-secondary)' }} aria-hidden="true" />
          </button>
        </motion.div>
      </AnimatePresence>

      {/* Pagination dots — only when 2+ announcements remain — Figma 153:1754 */}
      {showDots && (
        <div className="flex items-center justify-center gap-1 pb-3">
          {visible.map((_, i) => (
            <motion.button
              key={i}
              onClick={() => setPage([i, i > safeIdx ? 1 : -1])}
              animate={{
                width:      i === safeIdx ? 12 : 4,
                background: i === safeIdx ? 'var(--color-blue)' : 'rgba(96,165,250,0.3)',
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="h-[4px] rounded-[2px] flex-shrink-0"
              aria-label={`Announcement ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
