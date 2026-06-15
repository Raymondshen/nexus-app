'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { FRIENDSHIP_TOAST_Z_INDEX } from '@/lib/config'

const BOND_XP_PER_LEVEL = 100

interface FriendshipXPToastProps {
  visible:     boolean
  xpAwarded:   number
  totalXP:     number
  partnerName: string
}

export function FriendshipXPToast({ visible, xpAwarded, totalXP, partnerName }: FriendshipXPToastProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  const initial    = partnerName[0]?.toUpperCase() ?? '?'
  const level      = Math.floor(totalXP / BOND_XP_PER_LEVEL) + 1
  const xpInLevel  = totalXP % BOND_XP_PER_LEVEL
  const progressPct = (xpInLevel / BOND_XP_PER_LEVEL) * 100

  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          key="friendship-toast"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.2, ease: 'easeOut' } }}
          exit={{    opacity: 0, transition: { duration: 0.4, ease: 'easeIn'  } }}
          style={{
            position:    'fixed',
            bottom:      'calc(env(safe-area-inset-bottom, 0px) + 130px)',
            left:        16,
            right:       16,
            maxWidth:    448,
            marginLeft:  'auto',
            marginRight: 'auto',
            zIndex:      FRIENDSHIP_TOAST_Z_INDEX,
            display:     'flex',
            alignItems:  'center',
            gap:         12,
            padding:     '10px 14px',
            background:  '#0a0612',
            border:      '1px solid #bf5fff',
          }}
        >
          {/* Avatar initial */}
          <div
            style={{
              width:          32,
              height:         32,
              flexShrink:     0,
              background:     'rgba(191, 95, 255, 0.2)',
              border:         '1px solid rgba(191, 95, 255, 0.4)',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
            }}
          >
            <span className="font-pixel text-purple" style={{ fontSize: 8, lineHeight: 1 }}>
              {initial}
            </span>
          </div>

          {/* Text + bar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
            <span className="font-pixel leading-none" style={{ fontSize: 8, color: '#ffd700' }}>
              +{xpAwarded} BOND XP
            </span>
            <span
              className="font-body text-primary leading-none truncate"
              style={{ fontSize: 12, fontVariationSettings: '"opsz" 14' }}
            >
              {partnerName}
            </span>

            {/* XP bar row */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div className="font-silkscreen" style={{ display: 'flex', gap: 4 }}>
                <span className="text-secondary leading-none" style={{ fontSize: 8 }}>
                  Bond Lv.{level}
                </span>
                <span className="text-tertiary leading-none" style={{ fontSize: 8 }}>
                  · {xpInLevel}/{BOND_XP_PER_LEVEL} XP
                </span>
              </div>
              <div
                style={{
                  height:   3,
                  background: 'rgba(191, 95, 255, 0.15)',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <motion.div
                  style={{ position: 'absolute', left: 0, top: 0, height: '100%', background: '#bf5fff' }}
                  initial={{ width: '0%' }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ type: 'spring', stiffness: 300, damping: 28, delay: 0.15 }}
                />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
