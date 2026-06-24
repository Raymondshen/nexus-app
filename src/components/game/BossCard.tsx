'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCombatStore } from '@/store/combatStore'
import { BOSS_ATTACK_INTERVAL_MS } from '@/lib/config'

export function BossCard() {
  const raid = useCombatStore((s) => s.activeRaid)
  const [prevPhase, setPrevPhase] = useState<number | null>(null)
  const [phaseAlert, setPhaseAlert] = useState(false)
  const [timeToNext, setTimeToNext] = useState('')

  // Phase transition flash
  useEffect(() => {
    if (!raid) return
    if (prevPhase !== null && raid.phase > prevPhase) {
      setPhaseAlert(true)
      const t = setTimeout(() => setPhaseAlert(false), 2500)
      return () => clearTimeout(t)
    }
    setPrevPhase(raid.phase)
  }, [raid?.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Next-attack countdown
  useEffect(() => {
    if (!raid) return
    const tick = () => {
      const anchor   = raid.last_boss_attack_at
        ? new Date(raid.last_boss_attack_at).getTime()
        : new Date(raid.started_at).getTime()
      const interval = BOSS_ATTACK_INTERVAL_MS[raid.phase as 1 | 2 | 3] ?? BOSS_ATTACK_INTERVAL_MS[1]
      const nextAt   = anchor + interval
      const ms       = Math.max(0, nextAt - Date.now())
      const h        = Math.floor(ms / 3_600_000)
      const m        = Math.floor((ms % 3_600_000) / 60_000)
      const s        = Math.floor((ms % 60_000) / 1000)
      setTimeToNext(h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [raid])

  if (!raid) return null

  const hpPct    = (raid.current_hp / raid.max_hp) * 100
  const phaseColor = raid.phase === 3 ? '#ef4444' : raid.phase === 2 ? '#f59e0b' : '#9333ea'

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
          border:      `1px solid ${phaseColor}44`,
          padding:     '12px 16px',
          marginBottom: 2,
        }}
      >
        {/* Phase transition overlay */}
        <AnimatePresence>
          {phaseAlert && (
            <motion.div
              className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 1, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.5, times: [0, 0.1, 0.7, 1] }}
              style={{ background: `${phaseColor}22` }}
            >
              <span
                className="font-pixel"
                style={{ fontSize: 11, color: phaseColor, textShadow: `0 0 20px ${phaseColor}` }}
              >
                {raid.phase === 2 ? 'PHASE II — IT HUNGERS' : 'PHASE III — THE VOID RAGES'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-start justify-between gap-3 mb-3">
          {/* Boss identity */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-pixel leading-none" style={{ fontSize: 8, color: phaseColor }}>
                ◆ THE VOID ◆
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="font-pixel leading-none"
                style={{ fontSize: 7, color: '#6b4f8f', background: `${phaseColor}18`, padding: '2px 6px', border: `1px solid ${phaseColor}33` }}
              >
                PHASE {raid.phase}
              </span>
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
            <p className="font-silkscreen leading-none" style={{ fontSize: 11, color: phaseColor }}>{timeToNext}</p>
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
              style={{ background: `linear-gradient(90deg, ${phaseColor}99, ${phaseColor})` }}
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
