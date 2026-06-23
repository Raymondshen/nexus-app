'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCombatStore } from '@/store/combatStore'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/config'
import type { CombatClass } from '@/types'

interface AbilityButtonProps {
  crewId:    string
  userId:    string
  userClass: CombatClass
  username:  string
}

const ABILITY_INFO: Record<CombatClass, { name: string; cost: number; key: string; desc: string; color: string }> = {
  warrior: { name: 'GUARD',    cost: 40, key: 'guard',    desc: 'Taunt + DEF+40% for 60s', color: '#ef4444' },
  healer:  { name: 'MEND',     cost: 50, key: 'mend',     desc: 'Heal all living members',  color: '#22c55e' },
  archer:  { name: 'VOLLEY',   cost: 40, key: 'volley',   desc: 'Boss takes +20% dmg 30s',  color: '#ffd700' },
  rogue:   { name: 'BACKSTAB', cost: 35, key: 'backstab', desc: 'Guaranteed crit strike',   color: '#bf5fff' },
  mage:    { name: 'CAST',     cost: 55, key: 'cast',     desc: '3× ATK arcane nuke',       color: '#00e5ff' },
}

export function AbilityButton({ crewId, userId, userClass, username }: AbilityButtonProps) {
  const [firing,  setFiring]  = useState(false)
  const [toast,   setToast]   = useState<{ text: string; ok: boolean } | null>(null)
  const { activeRaid, memberStats } = useCombatStore()

  const ability = ABILITY_INFO[userClass]
  const member  = memberStats[userId]
  const hasMP   = member ? member.current_mp >= ability.cost : false
  const downed  = member?.is_downed ?? false

  const fire = useCallback(async () => {
    if (firing || !hasMP || downed || !activeRaid) return
    setFiring(true)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/attack-boss`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          crew_id:      crewId,
          user_id:      userId,
          username,
          message_type: 'text',
          soft_blocked: false,
          is_ability:   true,
          ability_type: ability.key,
        }),
      })
      const data = await res.json() as { ability?: string; ability_blocked?: boolean; reason?: string; dmg?: number; heal_amount?: number; downed?: boolean }
      if (data.ability_blocked) {
        setToast({ text: 'Not enough MP', ok: false })
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
  }, [firing, hasMP, downed, activeRaid, crewId, userId, ability]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!activeRaid || !member) return null

  const mpPct  = member ? (member.current_mp / member.max_mp) * 100 : 0
  const color  = ability.color

  return (
    <div className="relative">
      <button
        onClick={fire}
        disabled={firing || !hasMP || downed}
        className="flex flex-col items-center justify-center gap-0.5 transition-opacity disabled:opacity-40"
        style={{
          width:        56,
          height:       44,
          background:   hasMP && !downed ? `${color}18` : '#1a0d2e',
          border:       `1px solid ${hasMP && !downed ? color + '66' : '#2a1545'}`,
          position:     'relative',
          overflow:     'hidden',
        }}
        aria-label={`Use ${ability.name} (${ability.cost} MP)`}
      >
        {/* MP fill indicator behind content */}
        <div
          className="absolute inset-x-0 bottom-0 transition-all duration-300"
          style={{ height: `${mpPct}%`, background: `${color}18` }}
        />

        <span className="font-pixel relative z-[1]" style={{ fontSize: 6, color: hasMP ? color : '#6b4f8f' }}>
          {ability.name}
        </span>
        <span className="font-silkscreen relative z-[1]" style={{ fontSize: 7, color: 'var(--color-tertiary)' }}>
          {member.current_mp}/{ability.cost}MP
        </span>
      </button>

      {/* Feedback toast */}
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
