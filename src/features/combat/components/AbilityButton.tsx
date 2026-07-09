'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCombatStore } from '@/store/combatStore'
import { postEdgeFn } from '@/shared/utils/edgeFetch'
import type { CombatClass } from '@/types'

interface AbilityButtonProps {
  crewId:    string
  userId:    string
  userClass: CombatClass
  username:  string
}

const ABILITY_COST = 2  // flat cost for every class

const ABILITY_INFO: Record<CombatClass, { name: string; key: string; desc: string; color: string }> = {
  warrior: { name: 'GUARD',    key: 'guard',    desc: 'Taunt + DEF+40% for 60s', color: '#ef4444' },
  healer:  { name: 'MEND',     key: 'mend',     desc: 'Heal all living members',  color: '#22c55e' },
  archer:  { name: 'VOLLEY',   key: 'volley',   desc: 'Boss takes +20% dmg 30s',  color: '#ffd700' },
  rogue:   { name: 'BACKSTAB', key: 'backstab', desc: 'Guaranteed crit strike',   color: '#bf5fff' },
  mage:    { name: 'CAST',     key: 'cast',     desc: '3× ATK arcane nuke',       color: '#00e5ff' },
}

export function AbilityButton({ crewId, userId, userClass, username }: AbilityButtonProps) {
  const [firing,  setFiring]  = useState(false)
  const [toast,   setToast]   = useState<{ text: string; ok: boolean } | null>(null)
  // Individual selectors — the bare destructure also re-rendered on unrelated
  // combatStore changes (damage floats, combat log events).
  const activeRaid  = useCombatStore((s) => s.activeRaid)
  const memberStats = useCombatStore((s) => s.memberStats)

  const ability   = ABILITY_INFO[userClass]
  const member    = memberStats[userId]
  const canAfford = member ? member.ability_bank >= ABILITY_COST : false
  const downed    = member?.is_downed ?? false

  const fire = useCallback(async () => {
    if (firing || !canAfford || downed || !activeRaid) return
    setFiring(true)
    try {
      // Session-token call — attack-boss verifies the caller IS user_id server-side.
      const res = await postEdgeFn('attack-boss', {
        crew_id:      crewId,
        user_id:      userId,
        username,
        message_type: 'text',
        soft_blocked: false,
        is_ability:   true,
        ability_type: ability.key,
      })
      if (!res) throw new Error('no session')
      const data = await res.json() as { ability?: string; ability_blocked?: boolean; reason?: string; dmg?: number; heal_amount?: number; downed?: boolean }
      if (data.ability_blocked) {
        setToast({ text: 'Need 2 charges', ok: false })
      } else if (data.downed) {
        setToast({ text: "You're downed!", ok: false })
      } else {
        const valueStr = data.dmg != null ? ` — ${data.dmg} DMG` : data.heal_amount != null ? ` — ${data.heal_amount} HP` : ''
        setToast({ text: `${ability.name}${valueStr}`, ok: true })
      }
    } catch {
      setToast({ text: 'Error', ok: false })
    } finally {
      setFiring(false)
      setTimeout(() => setToast(null), 2000)
    }
  }, [firing, canAfford, downed, activeRaid, crewId, userId, ability]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!activeRaid || !member) return null

  const color = ability.color

  return (
    <div className="relative">
      <button
        onClick={fire}
        disabled={firing || !canAfford || downed}
        className="flex flex-col items-center justify-center gap-0.5 transition-opacity disabled:opacity-40"
        style={{
          width:      56,
          height:     44,
          background: canAfford && !downed ? `${color}18` : '#1a0d2e',
          border:     `1px solid ${canAfford && !downed ? color + '66' : '#2a1545'}`,
        }}
        aria-label={`Use ${ability.name} (Cost: ${ABILITY_COST})`}
      >
        <span className="font-pixel" style={{ fontSize: 6, color: canAfford ? color : '#6b4f8f' }}>
          {ability.name}
        </span>
        <span className="font-silkscreen" style={{ fontSize: 7, color: 'var(--color-tertiary)' }}>
          Cost: {ABILITY_COST}
        </span>
      </button>

      <AnimatePresence>
        {toast && (
          <motion.div
            className="absolute bottom-full left-1/2 mb-1 px-2 py-1 pointer-events-none whitespace-nowrap"
            style={{
              transform:  'translateX(-50%)',
              background: toast.ok ? `${color}22` : '#ff444422',
              border:     `1px solid ${toast.ok ? color + '66' : '#ff444466'}`,
            }}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <span className="font-pixel" style={{ fontSize: 6, color: toast.ok ? color : '#ff4444' }}>
              {toast.text}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
