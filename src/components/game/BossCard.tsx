'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCombatStore } from '@/store/combatStore'
import { BOSS_ATTACK_INTERVAL_MS } from '@/lib/config'

export function BossCard() {
  const raid = useCombatStore((s) => s.activeRaid)
  const [timeToNext, setTimeToNext] = useState('')
  const triggeredRef = useRef(false)

  // Next-attack countdown — auto-triggers the boss attack when it reaches 0
  useEffect(() => {
    if (!raid) return
    triggeredRef.current = false  // reset each cycle (fires again after last_boss_attack_at updates)
    const tick = () => {
      const anchor   = raid.last_boss_attack_at
        ? new Date(raid.last_boss_attack_at).getTime()
        : new Date(raid.started_at).getTime()
      const nextAt   = anchor + BOSS_ATTACK_INTERVAL_MS
      const ms       = Math.max(0, nextAt - Date.now())
      const h        = Math.floor(ms / 3_600_000)
      const m        = Math.floor((ms % 3_600_000) / 60_000)
      const s        = Math.floor((ms % 60_000) / 1000)
      setTimeToNext(h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`)

      if (ms === 0 && !triggeredRef.current) {
        triggeredRef.current = true
        fetch('/api/combat/boss-attack', { method: 'POST' }).catch(() => {})
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [raid])

  if (!raid) return null

  const hpPct    = (raid.current_hp / raid.max_hp) * 100
  const bossColor = '#9333ea'

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25 }}
        className="relative overflow-hidden"
        style={{
          background:  'linear-gradient(135deg, #0f0820 0%, #1a0d2e 100%)',
          border:      `1px solid ${bossColor}44`,
          padding:     '12px 16px',
          marginBottom: 2,
        }}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          {/* Boss identity */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-pixel leading-none" style={{ fontSize: 8, color: bossColor }}>
                ◆ THE VOID ◆
              </span>
            </div>
            <div className="flex items-center gap-2">
              {raid.volley_expires_at && new Date(raid.volley_expires_at).getTime() > Date.now() && (
                <span className="font-pixel leading-none" style={{ fontSize: 6, color: '#ffd700', background: '#ffd70018', padding: '2px 5px', border: '1px solid #ffd70033' }}>
                  VOLLEY DEBUFFED
                </span>
              )}
            </div>
          </div>

          {/* Next attack timer */}
          <div className="text-right flex-shrink-0">
            <p className="font-pixel leading-none" style={{ fontSize: 6, color: '#6b4f8f', marginBottom: 3 }}>NEXT ATTACK</p>
            <p className="font-silkscreen leading-none" style={{ fontSize: 11, color: bossColor }}>{timeToNext}</p>
          </div>
        </div>

        {/* HP bar */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="font-pixel" style={{ fontSize: 6, color: '#6b4f8f' }}>VOID HP</span>
            <span className="font-silkscreen" style={{ fontSize: 9, color: 'var(--color-primary)' }}>
              {Math.round(raid.current_hp).toLocaleString()} / {Math.round(raid.max_hp).toLocaleString()}
            </span>
          </div>
          <div className="relative h-[6px] rounded-full overflow-hidden" style={{ background: '#2a1545' }}>
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ background: `linear-gradient(90deg, ${bossColor}99, ${bossColor})` }}
              initial={false}
              animate={{ width: `${hpPct}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
