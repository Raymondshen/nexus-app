'use client'

import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useCombatStore } from '@/store/combatStore'
import { CombatLog } from '@/components/game/CombatLog'
import { BOSS_ATTACK_INTERVAL_MS } from '@/lib/config'

interface CombatHUDProps {
  currentUserId:  string
  crewId?:        string
  isDevUser?:     boolean
  memberProfiles?: Record<string, { username: string }>
}

function RaidMarquee({ onClick }: { onClick: () => void }) {
  const items = Array.from({ length: 8 })
  return (
    <button
      onClick={onClick}
      className="w-full overflow-hidden"
      style={{
        borderTop:    '1px solid var(--color-danger)',
        borderBottom: '1px solid var(--color-danger)',
        background:   'black',
        display:      'flex',
        alignItems:   'center',
        height:       35,
        cursor:       'pointer',
      }}
      aria-label="Toggle raid panel"
    >
      <motion.div
        className="flex items-center flex-shrink-0 whitespace-nowrap"
        initial={{ x: 0 }}
        animate={{ x: '-50%' }}
        transition={{ duration: 18, repeat: Infinity, ease: 'linear', repeatType: 'loop' }}
      >
        {items.map((_, i) => (
          <span key={i} className="inline-flex items-center" style={{ gap: 8, paddingRight: 20 }}>
            <span
              style={{ width: 8, height: 8, background: 'var(--color-danger)', display: 'inline-block', flexShrink: 0 }}
            />
            <span className="font-silkscreen leading-none" style={{ fontSize: 11, color: 'var(--color-danger)' }}>
              RAID IN PROGRESS TAP BANNER TO VIEW
            </span>
          </span>
        ))}
      </motion.div>
    </button>
  )
}

export function CombatHUD({ currentUserId, crewId, isDevUser, memberProfiles }: CombatHUDProps) {
  const [open,          setOpen]          = useState(false)
  const [combatEnabled, setCombatEnabled] = useState(false)
  const [timeToNext,    setTimeToNext]    = useState('')
  const triggeredRef                      = useRef(false)

  const activeRaid   = useCombatStore((s) => s.activeRaid)
  const memberStats  = useCombatStore((s) => s.memberStats)
  const combatEvents = useCombatStore((s) => s.combatEvents)

  useEffect(() => {
    setCombatEnabled(localStorage.getItem('nexus_combat_enabled') === '1')
  }, [])

  // Next-attack countdown
  useEffect(() => {
    if (!activeRaid) return
    triggeredRef.current = false
    const tick = () => {
      const anchor = activeRaid.last_boss_attack_at
        ? new Date(activeRaid.last_boss_attack_at).getTime()
        : new Date(activeRaid.started_at).getTime()
      const nextAt = anchor + BOSS_ATTACK_INTERVAL_MS
      const ms     = Math.max(0, nextAt - Date.now())
      const h      = Math.floor(ms / 3_600_000)
      const m      = Math.floor((ms % 3_600_000) / 60_000)
      const s      = Math.floor((ms % 60_000) / 1000)
      setTimeToNext(h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`)
      if (ms === 0 && !triggeredRef.current) {
        triggeredRef.current = true
        fetch('/api/combat/boss-attack', { method: 'POST' }).catch(() => {})
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [activeRaid])

  const hasJoinedRaid = !!(activeRaid && memberStats[currentUserId])

  if (!isDevUser || !combatEnabled || !hasJoinedRaid || !activeRaid) return null

  // Boss name from spawn event
  const spawnEvent = combatEvents.find((e) => e.kind === 'boss_spawn')
  const bossName   = spawnEvent
    ? spawnEvent.text.replace(/^⚔ /, '').replace(/ (appears|—).*$/, '').toLowerCase() + '...'
    : 'the void...'

  // Last boss attack damage
  const lastBossHit = [...combatEvents].reverse().find((e) => e.kind === 'boss_attack')
  const bossDmg     = lastBossHit?.value

  // Expiry label
  const msLeft     = Math.max(0, new Date(activeRaid.expires_at).getTime() - Date.now())
  const daysLeft   = Math.floor(msLeft / 86_400_000)
  const hoursLeft  = Math.floor((msLeft % 86_400_000) / 3_600_000)
  const expiryText = daysLeft > 0
    ? `ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`
    : hoursLeft > 0 ? `ends in ${hoursLeft}h` : 'ending soon'

  return (
    // flex-shrink-0: grows into MessageList (flex:1) space as panel expands
    <div className="flex-shrink-0 bg-black" style={{ zIndex: 64 }}>

      {/* ── Banner — always visible at the top, above the expanded panel ── */}
      <RaidMarquee onClick={() => setOpen((v) => !v)} />

      {/* ── Expanded panel — slides open below the banner ──
          As height grows, MessageList (flex:1) shrinks to accommodate.
          Banner stays anchored above; ChatInput stays anchored below. */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.25, 0, 0, 1] }}
            style={{ overflow: 'hidden', background: 'black' }}
          >
            <div style={{ paddingTop: 16, paddingBottom: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Boss info rows */}
              <div style={{ paddingLeft: 16, paddingRight: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="font-silkscreen leading-none" style={{ fontSize: 12, color: 'var(--color-primary)' }}>
                    {bossName}
                  </span>
                  {bossDmg != null && (
                    <span className="font-silkscreen leading-none" style={{ fontSize: 12, color: 'var(--color-secondary)' }}>
                      dmg {bossDmg}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="font-silkscreen leading-none" style={{ fontSize: 11, color: 'var(--color-coins)' }}>
                    Next attack {timeToNext}
                  </span>
                  <span className="font-silkscreen leading-none" style={{ fontSize: 11, color: 'var(--color-tertiary)' }}>
                    {expiryText}
                  </span>
                </div>
              </div>

              {/* Combat log */}
              <CombatLog />

              {/* Member HP list */}
              {Object.values(memberStats).length > 0 && (
                <div style={{ paddingLeft: 16, paddingRight: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Object.values(memberStats).map((member) => {
                    const username  = memberProfiles?.[member.user_id]?.username ?? member.user_id.slice(0, 8)
                    const pct       = member.max_hp > 0 ? (member.current_hp / member.max_hp) * 100 : 0
                    const barColor  = member.is_downed ? 'var(--color-tertiary)' : pct <= 30 ? 'var(--color-danger)' : 'var(--color-success)'
                    const isMe      = member.user_id === currentUserId
                    return (
                      <div key={member.user_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          className="font-silkscreen leading-none flex-shrink-0"
                          style={{ fontSize: 9, color: member.is_downed ? 'var(--color-tertiary)' : isMe ? 'var(--color-purple)' : 'var(--color-secondary)', width: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {isMe ? '▶ ' : ''}{username}
                        </span>
                        <div className="flex-1 bg-surface overflow-hidden" style={{ height: 3 }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: barColor, transition: 'width 0.4s ease-out' }} />
                        </div>
                        <span className="font-silkscreen leading-none flex-shrink-0" style={{ fontSize: 9, color: member.is_downed ? 'var(--color-danger)' : 'var(--color-tertiary)', width: 52, textAlign: 'right' }}>
                          {member.is_downed ? 'DOWNED' : `${Math.round(member.current_hp)}/${Math.round(member.max_hp)}`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}
