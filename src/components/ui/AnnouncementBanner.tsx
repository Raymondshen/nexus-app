'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { PanInfo } from 'framer-motion'
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
  enter: (dir: number) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:  (dir: number) => ({ x: dir < 0 ? 40 : -40, opacity: 0 }),
}

export function AnnouncementBanner({ announcements }: { announcements: AnnouncementItem[] }) {
  const [mounted,           setMounted]  = useState(false)
  const [visible,           setVisible]  = useState<AnnouncementItem[]>([])
  const [[idx, dir], setPage] = useState<[number, number]>([0, 0])

  useEffect(() => {
    const dismissed = getDismissed()
    setVisible(announcements.filter(a => !dismissed.has(a.id)))
    setMounted(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted || visible.length === 0) return null

  const safeIdx = Math.min(idx, visible.length - 1)
  const current = visible[safeIdx]

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
      const next = prev.filter(a => a.id !== current.id)
      const newIdx = safeIdx >= next.length ? Math.max(0, next.length - 1) : safeIdx
      setPage([newIdx, -1])
      return next
    })
  }

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x < -40)      go(1)
    else if (info.offset.x > 40)  go(-1)
  }

  return (
    <div
      className="flex-shrink-0 border-b overflow-hidden"
      style={{ borderColor: 'rgba(168,85,247,0.2)', background: 'rgba(168,85,247,0.06)' }}
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
          drag={visible.length > 1 ? 'x' : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          onDragEnd={handleDragEnd}
          className="flex items-start gap-3 px-4 pt-3"
          style={{ paddingBottom: visible.length > 1 ? 8 : 12, cursor: visible.length > 1 ? 'grab' : 'default' }}
        >
          <div className="flex-1 min-w-0 flex flex-col gap-[6px]">
            <p className="font-silkscreen text-[8px] leading-none tracking-[0.2px]" style={{ color: '#a855f7' }}>
              ANNOUNCEMENT
            </p>
            <p className="font-body text-[14px] text-primary leading-snug" style={{ fontVariationSettings: '"opsz" 14' }}>
              {current.text}
            </p>
          </div>
          <button
            onClick={dismiss}
            className="flex-shrink-0 flex items-center justify-center text-muted active:text-primary transition-colors mt-[2px]"
            style={{ width: 20, height: 20 }}
            aria-label="Dismiss announcement"
          >
            <Close style={{ width: 14, height: 14 }} aria-hidden="true" />
          </button>
        </motion.div>
      </AnimatePresence>

      {/* Pagination dots — only shown when multiple announcements remain */}
      {visible.length > 1 && (
        <div className="flex items-center justify-center gap-[6px] pb-[8px]">
          {visible.map((_, i) => (
            <motion.button
              key={i}
              onClick={() => setPage([i, i > safeIdx ? 1 : -1])}
              animate={{ width: i === safeIdx ? 12 : 4, background: i === safeIdx ? '#a855f7' : 'rgba(255,255,255,0.2)' }}
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
