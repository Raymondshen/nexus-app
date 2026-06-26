'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { GemIcon } from '@/shared/components/game/GemCounter'
import { GEM_TOAST_Z_INDEX } from '@/shared/constants/config'

interface GemToastProps {
  visible: boolean
  stacked?: boolean
}

// Enter: grow from Figma "behind" scale (331/361 ≈ 0.917) + slide up into position
// Stacked: sit behind FriendshipXPToast — scaled down, shifted slightly so bottom peeks
// Exit:  slide up + fade out
const ENTER: Parameters<typeof motion.div>[0]['animate'] = {
  opacity: 1,
  scale:   1,
  y:       0,
  transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
}
const STACKED: Parameters<typeof motion.div>[0]['animate'] = {
  opacity: 1,
  scale:   0.94,
  y:       4,
  transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
}
const EXIT: Parameters<typeof motion.div>[0]['exit'] = {
  opacity: 0,
  y:       -20,
  transition: { duration: 0.25, ease: 'easeIn' },
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
          initial={{ opacity: 0, scale: 0.917, y: 12 }}
          animate={stacked ? STACKED : ENTER}
          exit={EXIT}
          style={{
            position:             'fixed',
            top:                  'calc(env(safe-area-inset-top, 0px) + 68px)',
            left:                 16,
            right:                16,
            maxWidth:             448,
            marginLeft:           'auto',
            marginRight:          'auto',
            zIndex:               GEM_TOAST_Z_INDEX,
            transformOrigin:      'top center',
            display:              'flex',
            alignItems:           'center',
            gap:                  'var(--x5)',
            padding:              'var(--x5)',
            // Extra height when stacked so the card bottom peeks ~11px below FriendshipXPToast
            minHeight:            stacked ? 80 : 68,
            overflow:             'hidden',
            background:           'rgba(17, 17, 17, 0.9)',
            backdropFilter:       'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            borderRadius:         'var(--x3)',
            boxShadow:            '0px 0px 20px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div style={{ flexShrink: 0 }}>
            <GemIcon />
          </div>

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
