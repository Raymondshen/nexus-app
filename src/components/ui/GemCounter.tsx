'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useChatStore } from '@/store/chatStore'

export function GemIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true">
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
  const [showFloat, setShowFloat] = useState(false)

  useEffect(() => {
    if (gemBalance > prevRef.current) setShowFloat(true)
    prevRef.current = gemBalance
  }, [gemBalance])

  return (
    <div
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
    </div>
  )
}
