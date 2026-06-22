'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useChatStore } from '@/store/chatStore'

export function XPGainFloat() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const xpFloats       = useChatStore((s) => s.xpFloats)
  const dismissXPFloat = useChatStore((s) => s.dismissXPFloat)

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {xpFloats.map((f) => (
        <motion.div
          key={f.id}
          className="pointer-events-none fixed z-[9998]"
          style={{
            right:  20,
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
          }}
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: [0, 1, 1, 0], y: [0, -8, -24, -40] }}
          transition={{ duration: 1.2, ease: 'easeOut', times: [0, 0.15, 0.65, 1] }}
          onAnimationComplete={() => dismissXPFloat(f.id)}
        >
          <span
            className="font-silkscreen leading-none"
            style={{ fontSize: 10, color: '#ffd700', textShadow: '0 0 8px rgba(255,215,0,0.7)' }}
          >
            +{f.amount}XP
          </span>
        </motion.div>
      ))}
    </AnimatePresence>,
    document.body
  )
}
