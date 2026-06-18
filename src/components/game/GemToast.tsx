'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { GemIcon } from '@/components/ui/GemCounter'
import { GEM_TOAST_Z_INDEX } from '@/lib/config'

interface GemToastProps {
  visible: boolean
  stacked?: boolean
}

export function GemToast({ visible, stacked }: GemToastProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          key="gem-toast"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0,   transition: { duration: 0.2, ease: 'easeOut' } }}
          exit={{    opacity: 0, y: -8,   transition: { duration: 0.3, ease: 'easeIn'  } }}
          style={{
            position:             'fixed',
            top:                  stacked
              ? 'calc(env(safe-area-inset-top, 0px) + 144px)'
              : 'calc(env(safe-area-inset-top, 0px) + 68px)',
            left:                 16,
            right:                16,
            maxWidth:             448,
            marginLeft:           'auto',
            marginRight:          'auto',
            zIndex:               GEM_TOAST_Z_INDEX,
            display:              'flex',
            alignItems:           'center',
            gap:                  'var(--x5)',
            padding:              'var(--x5)',
            minHeight:            68,
            overflow:             'hidden',
            background:           'rgba(17, 17, 17, 0.9)',
            backdropFilter:       'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            borderRadius:         'var(--x3)',
            boxShadow:            '0px 0px 20px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
          {/* Gem icon */}
          <div style={{ flexShrink: 0 }}>
            <GemIcon />
          </div>

          {/* Message */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--x2)', flex: 1, minWidth: 0 }}>
            <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-secondary)' }}>
              Daily Gems
            </p>
            <p
              className="font-body font-normal leading-none truncate"
              style={{ fontSize: 12, color: 'var(--color-secondary)', fontVariationSettings: '"opsz" 14' }}
            >
              +1 Daily Gem received
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
