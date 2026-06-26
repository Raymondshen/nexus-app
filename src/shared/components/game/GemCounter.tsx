'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useChatStore } from '@/store/chatStore'
import { isGemGateOpen } from '@/shared/utils/gems'
import { GEM_DAILY_LIMIT } from '@/shared/constants/config'

export function GemIcon({ width = 16, height = 16 }: { width?: number; height?: number } = {}) {
  return (
    <svg width={width} height={height} viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="3" y="0" width="2" height="1" fill="#00e5ff" />
      <rect x="1" y="1" width="6" height="1" fill="#00e5ff" />
      <rect x="0" y="2" width="8" height="2" fill="#00e5ff" />
      <rect x="1" y="4" width="6" height="1" fill="#00e5ff" />
      <rect x="2" y="5" width="4" height="1" fill="#00e5ff" />
      <rect x="3" y="6" width="2" height="1" fill="#00e5ff" />
      <rect x="2" y="2" width="1" height="1" fill="#ffffff" />
    </svg>
  )
}

export function GemCounter() {
  const gemBalance = useChatStore((s) => s.gemBalance)
  const prevRef = useRef(gemBalance)
  const [showFloat,     setShowFloat]     = useState(false)
  const [claimedToday,  setClaimedToday]  = useState(false)
  const [showTip,       setShowTip]       = useState(false)

  useEffect(() => {
    isGemGateOpen().then((open) => setClaimedToday(!open))
  }, [])

  useEffect(() => {
    if (gemBalance > prevRef.current) {
      setShowFloat(true)
      setClaimedToday(true)
    }
    prevRef.current = gemBalance
  }, [gemBalance])

  function handleTap() {
    setShowTip(true)
    setTimeout(() => setShowTip(false), 2000)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleTap}
      aria-label={`Daily gem progress: ${claimedToday ? GEM_DAILY_LIMIT : 0} of ${GEM_DAILY_LIMIT}`}
      className="relative flex items-center justify-center border border-border overflow-hidden flex-shrink-0"
      style={{
        padding: '8px 10px',
        gap: 6,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        boxShadow: '0px 0px 20px 12px rgba(0,0,0,0.1)',
      }}
    >
      <GemIcon />
      <span className="font-pixel" style={{ fontSize: 'var(--text-mini)', color: '#00e5ff' }}>
        {gemBalance}
      </span>

      <AnimatePresence>
        {showFloat && (
          <motion.span
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: -16 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            onAnimationComplete={() => setShowFloat(false)}
            className="font-pixel absolute pointer-events-none"
            style={{ fontSize: 'var(--text-mini)', color: '#00e5ff', top: -4, right: 10 }}
          >
            +1
          </motion.span>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTip && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-1 z-50 whitespace-nowrap font-silkscreen text-[8px] text-primary bg-surface border border-border px-2 py-1"
          >
            {claimedToday ? `${GEM_DAILY_LIMIT}/${GEM_DAILY_LIMIT} DAILY GEMS` : `0/${GEM_DAILY_LIMIT} DAILY GEMS`}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
