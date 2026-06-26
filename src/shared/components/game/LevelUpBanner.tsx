'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'

interface LevelUpBannerProps {
  level:      number
  isTierUp?:  boolean
  onDismiss:  () => void
}

export function LevelUpBanner({ level, isTierUp = false, onDismiss }: LevelUpBannerProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <motion.div
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0,   opacity: 1 }}
      exit={{    y: -80, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 20 }}
      className="w-full my-2 px-4 py-3 text-center"
      style={{
        background: 'linear-gradient(90deg, #7a5500 0%, #ffd700 50%, #7a5500 100%)',
        boxShadow:  '0 0 24px rgba(255,215,0,0.5)',
      }}
    >
      <p className="font-pixel text-[10px] text-[#0a0612] leading-tight">
        ★ LEVEL UP ★
      </p>
      <p className="font-pixel text-[8px] text-[#1a0a00] mt-1">
        THE CREW REACHES LVL {String(level).padStart(2, '0')}
      </p>
      {level >= 3 && (
        <p className="font-pixel text-[6px] text-[#3d2200] mt-1">
          NEW BOSS TIER UNLOCKED
        </p>
      )}
    </motion.div>
  )
}
