'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCombatStore } from '@/store/combatStore'

export function DamageFloatLayer() {
  const { damageFloats } = useCombatStore()

  return (
    <AnimatePresence>
      {damageFloats.map((f) => (
        <DamageFloat key={f.id} {...f} />
      ))}
    </AnimatePresence>
  )
}

function DamageFloat({ id, value, isCrit, x, y }: { id: string; value: number; isCrit: boolean; x: number; y: number }) {
  const remove = useCombatStore((s) => s.removeDamageFloat)

  useEffect(() => {
    const t = setTimeout(() => remove(id), 1200)
    return () => clearTimeout(t)
  }, [id, remove])

  return (
    <motion.div
      className="pointer-events-none fixed z-[9998] select-none"
      style={{ left: x, top: y }}
      initial={{ opacity: 1, y: 0, scale: isCrit ? 1.4 : 1 }}
      animate={{ opacity: 0, y: -48, scale: isCrit ? 1.8 : 1.1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.1, ease: 'easeOut' }}
    >
      <span
        className="font-pixel leading-none drop-shadow-lg"
        style={{
          fontSize: isCrit ? 16 : 13,
          color: isCrit ? 'var(--color-crit)' : 'var(--color-primary)',
          textShadow: isCrit
            ? '0 0 12px rgba(251,191,36,0.8), 0 2px 0 rgba(0,0,0,0.8)'
            : '0 2px 0 rgba(0,0,0,0.8)',
        }}
      >
        {isCrit && <span style={{ fontSize: 8, display: 'block', marginBottom: 2, color: 'var(--color-crit)' }}>CRIT!</span>}
        -{value}
      </span>
    </motion.div>
  )
}
