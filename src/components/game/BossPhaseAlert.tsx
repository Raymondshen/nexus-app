'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface BossPhaseAlertProps {
  phase: 2 | 3 | null
  onDismiss: () => void
}

const PHASE_CONFIG = {
  2: {
    bg:      'bg-[#2d1400]',
    border:  'border-[#ff8800]/60',
    glow:    'rgba(255,136,0,0.3)',
    icon:    '⚠',
    title:   'THE VOID AWAKENS',
    sub:     'It grows stronger. Keep fighting.',
    color:   '#ff8800',
  },
  3: {
    bg:      'bg-[#1a0000]',
    border:  'border-[#ff0000]/60',
    glow:    'rgba(255,0,0,0.4)',
    icon:    '☠',
    title:   'ENRAGE',
    sub:     'Feed the chat or it heals.',
    color:   '#ff2200',
  },
}

export function BossPhaseAlert({ phase, onDismiss }: BossPhaseAlertProps) {
  useEffect(() => {
    if (!phase) return
    const t = setTimeout(onDismiss, 5000)
    return () => clearTimeout(t)
  }, [phase, onDismiss])

  const cfg = phase ? PHASE_CONFIG[phase] : null

  return (
    <AnimatePresence>
      {cfg && phase && (
        <motion.div
          key={phase}
          initial={{ opacity: 0, scaleY: 0 }}
          animate={{ opacity: 1, scaleY: 1 }}
          exit={{ opacity: 0, scaleY: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className={`w-full border-y-2 ${cfg.bg} ${cfg.border} px-4 py-3 text-center`}
          style={{ boxShadow: `0 0 20px ${cfg.glow}` }}
        >
          <p
            className="font-pixel text-[11px] mb-1"
            style={{ color: cfg.color, textShadow: `0 0 10px ${cfg.glow}` }}
          >
            {cfg.icon} PHASE {phase} — {cfg.title}
          </p>
          <p className="font-pixel text-[8px] text-[#9b8ab0]">{cfg.sub}</p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
