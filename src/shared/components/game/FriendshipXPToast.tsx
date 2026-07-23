'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Heart } from 'pixelarticons/react/Heart'
import { FRIENDSHIP_TOAST_Z_INDEX } from '@/shared/constants/config'

const BOND_XP_PER_LEVEL = 100

interface FriendshipXPToastProps {
  visible:     boolean
  xpAwarded:   number
  totalXP:     number
  partnerName: string
  dailyCount:  number
}

export function FriendshipXPToast({ visible, xpAwarded, totalXP, partnerName, dailyCount }: FriendshipXPToastProps) {
  // Gates the createPortal call below — document.body doesn't exist during SSR, so
  // this must flip after mount, not during the initial render; not a state-mirroring
  // anti-pattern react-hooks/set-state-in-effect otherwise wants hoisted out.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])
  if (!mounted) return null

  const level       = Math.floor(totalXP / BOND_XP_PER_LEVEL) + 1
  const xpInLevel   = totalXP % BOND_XP_PER_LEVEL
  const progressPct = (xpInLevel / BOND_XP_PER_LEVEL) * 100

  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          key="friendship-toast"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0,   transition: { duration: 0.2, ease: 'easeOut' } }}
          exit={{    opacity: 0, y: -8,   transition: { duration: 0.3, ease: 'easeIn'  } }}
          style={{
            position:             'fixed',
            top:                  'calc(env(safe-area-inset-top, 0px) + 68px)',
            left:                 16,
            right:                16,
            maxWidth:             448,
            marginLeft:           'auto',
            marginRight:          'auto',
            zIndex:               FRIENDSHIP_TOAST_Z_INDEX,
            display:              'flex',
            alignItems:           'center',
            gap:                  16,
            padding:              16,
            background:           'rgba(17, 17, 17, 0.9)',
            backdropFilter:       'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            borderRadius:         8,
            boxShadow:            '0px 0px 20px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
          {/* Heart icon */}
          <Heart style={{ width: 16, height: 16, color: 'var(--color-tertiary)', flexShrink: 0 }} />

          {/* Details column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>

            {/* Label + message */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* Top row: level text left, daily pip squares right */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <p className="font-silkscreen leading-none" style={{ fontSize: 8, color: 'var(--color-tertiary)' }}>
                  <span style={{ color: 'var(--color-secondary)' }}>Friendship lv {level}</span>
                  {` · ${xpInLevel} / 100XP`}
                </p>
                {/* 10 daily-limit pips — filled = gradient, empty = muted gray */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {Array.from({ length: 10 }, (_, i) => (
                    <div
                      key={i}
                      style={{
                        width:      4,
                        height:     4,
                        flexShrink: 0,
                        background: i < dailyCount
                          ? 'linear-gradient(to right, var(--color-purple), #d946ef)'
                          : 'var(--color-muted)',
                      }}
                    />
                  ))}
                </div>
              </div>
              <p
                className="font-body font-normal leading-none truncate"
                style={{ fontSize: 12, color: 'var(--color-secondary)', fontVariationSettings: '"opsz" 14' }}
              >
                {`+${xpAwarded} Friendship Points with `}
                <span style={{ color: 'var(--color-purple)' }}>@{partnerName}</span>
              </p>
            </div>

            {/* XP progress bar */}
            <div style={{ height: 4, background: 'var(--color-border)', overflow: 'hidden', position: 'relative' }}>
              <motion.div
                style={{ position: 'absolute', left: 0, top: 0, height: '100%', background: 'linear-gradient(to right, var(--color-purple), #d946ef)' }}
                initial={{ width: '0%' }}
                animate={{ width: `${progressPct}%` }}
                transition={{ type: 'spring', stiffness: 300, damping: 28, delay: 0.15 }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
