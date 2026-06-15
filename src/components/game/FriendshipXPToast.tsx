'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { FRIENDSHIP_TOAST_Z_INDEX } from '@/lib/config'

const BOND_XP_PER_LEVEL = 100

interface FriendshipXPToastProps {
  visible:   boolean
  totalXP:   number
  xpAwarded: number
}

export function FriendshipXPToast({ visible, totalXP, xpAwarded }: FriendshipXPToastProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  const level    = Math.floor(totalXP / BOND_XP_PER_LEVEL) + 1
  const xpInLevel = totalXP % BOND_XP_PER_LEVEL
  const progress  = (xpInLevel / BOND_XP_PER_LEVEL) * 100

  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          key="friendship-toast"
          initial={{ y: -120, opacity: 0 }}
          animate={{ y: 0,    opacity: 1 }}
          exit={{    y: -120, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          style={{
            position:       'fixed',
            top:            'calc(env(safe-area-inset-top, 0px) + 16px)',
            left:           16,
            right:          16,
            zIndex:         FRIENDSHIP_TOAST_Z_INDEX,
            background:     'rgba(10, 6, 18, 0.95)',
            border:         '1px solid var(--color-purple)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            padding:        '10px 14px',
            display:        'flex',
            flexDirection:  'column',
            gap:            'var(--space-3)',
            maxWidth:       448,
            marginLeft:     'auto',
            marginRight:    'auto',
          }}
        >
          {/* Header row */}
          <div className="flex items-center" style={{ gap: 'var(--space-3)' }}>
            <span
              className="font-silkscreen leading-none text-purple"
              style={{ fontSize: 'var(--text-mini)' }}
            >
              BOND XP
            </span>
            <span
              className="font-silkscreen leading-none"
              style={{ fontSize: 'var(--text-mini)', color: 'var(--color-xp)' }}
            >
              +{xpAwarded} XP
            </span>
          </div>

          {/* Level + progress */}
          <div className="flex flex-col w-full" style={{ gap: 'var(--space-3)' }}>
            <div className="flex items-center w-full font-silkscreen" style={{ gap: 'var(--space-2)' }}>
              <p className="flex-1 min-w-0 leading-[0] text-[0px]">
                <span className="text-[length:var(--text-mini)] leading-none text-secondary">
                  Bond Lv.{level}
                </span>
                <span className="text-[length:var(--text-mini)] leading-none text-tertiary">
                  {` · ${xpInLevel} / ${BOND_XP_PER_LEVEL} XP`}
                </span>
              </p>
            </div>

            <div className="bg-surface h-1 overflow-hidden w-full relative">
              <motion.div
                className="absolute left-0 top-0 h-full bg-purple"
                animate={{ width: `${progress}%` }}
                transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
