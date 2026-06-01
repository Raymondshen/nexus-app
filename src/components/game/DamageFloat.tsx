'use client'

import { motion, AnimatePresence } from 'framer-motion'
import type { ElementType } from '@/types'

const ELEMENT_COLORS: Record<ElementType, string> = {
  fire:      '#ff4444',
  water:     '#00e5ff',
  lightning: '#ffd700',
  nature:    '#66bb6a',
  shadow:    '#bf5fff',
  arcane:    '#00e5ff',
}

const ELEMENT_ICONS: Record<ElementType, string> = {
  fire:      '🔥',
  water:     '💧',
  lightning: '⚡',
  nature:    '🌿',
  shadow:    '💀',
  arcane:    '✨',
}

export interface DamageFloatItem {
  id: number
  damage: number
  elementType: ElementType | null
}

interface DamageFloatProps {
  floats: DamageFloatItem[]
  onDismiss: (id: number) => void
}

export function DamageFloat({ floats, onDismiss }: DamageFloatProps) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <AnimatePresence>
        {floats.map((f) => {
          const color = f.elementType ? ELEMENT_COLORS[f.elementType] : '#ffd700'
          const icon  = f.elementType ? ELEMENT_ICONS[f.elementType] : '⚔️'
          return (
            <motion.div
              key={f.id}
              initial={{ opacity: 1, y: 0, x: '50%', scale: 1 }}
              animate={{ opacity: 0, y: -48, scale: 1.2 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
              onAnimationComplete={() => onDismiss(f.id)}
              className="absolute right-8 bottom-12 flex items-center gap-1"
            >
              <span className="text-xs">{icon}</span>
              <span
                className="font-pixel text-[11px] font-bold"
                style={{ color, textShadow: `0 0 8px ${color}` }}
              >
                -{f.damage}
              </span>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
