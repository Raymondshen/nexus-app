'use client'

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'

interface VictoryOverlayProps {
  crewName:   string
  bossName?:  string
  xpGained?:  number
  newLevel?:  number | null
  onDismiss:  () => void
}

export function VictoryOverlay({
  crewName,
  bossName  = 'THE VOID',
  xpGained  = 500,
  newLevel  = null,
  onDismiss,
}: VictoryOverlayProps) {
  const firedRef = useRef(false)

  // Confetti burst — purple, gold, cyan
  useEffect(() => {
    if (firedRef.current) return
    firedRef.current = true

    const fire = (angle: number, spread: number) =>
      confetti({
        particleCount:  80,
        angle,
        spread,
        origin:         { x: 0.5, y: 0.5 },
        colors:         ['#bf5fff', '#ffd700', '#00e5ff', '#9c27b0', '#ffffff'],
        scalar:         1.1,
        ticks:          260,
        gravity:        0.85,
        drift:          0.1,
      })

    fire(60,  70)
    setTimeout(() => fire(120, 70),  150)
    setTimeout(() => fire(90,  100), 350)
  }, [])

  // Auto-dismiss after 4 s
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={{ background: 'rgba(6,2,16,0.94)', backdropFilter: 'blur(4px)' }}
      onClick={onDismiss}
    >
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle at 50% 50%, rgba(191,95,255,0.12) 0%, transparent 70%)' }}
      />

      {/* VICTORY */}
      <motion.div
        initial={{ scale: 0.2, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.45, type: 'spring', stiffness: 220, damping: 16 }}
        className="text-center mb-6"
      >
        <motion.p
          animate={{ textShadow: ['0 0 20px #ffd700, 0 0 40px #bf5fff', '0 0 40px #ffd700, 0 0 80px #bf5fff', '0 0 20px #ffd700, 0 0 40px #bf5fff'] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          className="font-pixel text-[28px] text-[#ffd700] leading-none"
        >
          VICTORY
        </motion.p>
      </motion.div>

      {/* Crew name */}
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="font-pixel text-[9px] text-[#bf5fff] tracking-widest mb-8 text-center px-4"
      >
        THE {crewName.toUpperCase()} PREVAILS
      </motion.p>

      {/* Boss crossed out */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.4 }}
        className="mb-4 text-center"
      >
        <p className="font-pixel text-[8px] text-[#4a3060] line-through mb-1">{bossName}</p>
        <p className="font-pixel text-[8px] text-[#66bb6a]">✓ DEFEATED</p>
      </motion.div>

      {/* XP gained */}
      <motion.p
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.8, duration: 0.35, type: 'spring' }}
        className="font-pixel text-[10px] text-[#ffd700] mb-4"
        style={{ textShadow: '0 0 12px rgba(255,215,0,0.6)' }}
      >
        +{xpGained} CREW XP
      </motion.p>

      {/* Level up */}
      {newLevel && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0, duration: 0.4 }}
          className="px-4 py-2 mb-4 text-center"
          style={{ border: '1px solid rgba(255,215,0,0.5)', background: 'rgba(255,215,0,0.08)' }}
        >
          <p className="font-pixel text-[9px] text-[#ffd700]">
            LEVEL UP — LVL {String(newLevel).padStart(2, '0')}
          </p>
        </motion.div>
      )}

      {/* Tap to skip */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.5, 0.5] }}
        transition={{ delay: 1.5, duration: 0.5 }}
        className="font-pixel text-[7px] text-[#3d2660] absolute bottom-8"
      >
        tap to continue
      </motion.p>
    </motion.div>
  )
}
