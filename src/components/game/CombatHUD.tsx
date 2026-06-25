'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useCombatStore } from '@/store/combatStore'
import { CombatLog } from '@/components/game/CombatLog'
import { AbilityButton } from '@/components/game/AbilityButton'
import { createClient } from '@/lib/supabase/client'
import { BOSS_ATTACK_INTERVAL_MS } from '@/lib/config'
import type { CombatClass } from '@/types'

interface CombatHUDProps {
  currentUserId:   string
  crewId?:         string
  isDevUser?:      boolean
  memberProfiles?: Record<string, { username: string }>
  userCombatClass?: CombatClass
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

function ReviveButton({ raidId, tokens }: { raidId: string; tokens: number }) {
  const [firing,  setFiring]  = useState(false)
  const [toast,   setToast]   = useState<{ text: string; ok: boolean } | null>(null)

  const memberStats      = useCombatStore((s) => s.memberStats)
  const patchMemberHP    = useCombatStore((s) => s.patchMemberHP)
  const setReviveTokens  = useCombatStore((s) => s.setReviveTokens)

  const downedMembers = Object.values(memberStats).filter((m) => m.is_downed)
  const hasTokens     = tokens > 0
  const canRevive     = hasTokens && downedMembers.length > 0 && !firing

  const fire = useCallback(async () => {
    if (!canRevive) return
    const target = downedMembers[0]
    setFiring(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('use_revive_token', {
        p_raid_id:        raidId,
        p_target_user_id: target.user_id,
      })
      if (error) throw error
      const result = data as { ok?: boolean; new_hp?: number; tokens_remaining?: number }
      if (result.ok) {
        if (result.new_hp != null)          patchMemberHP(target.user_id, result.new_hp, false, null)
        if (result.tokens_remaining != null) setReviveTokens(result.tokens_remaining)
        setToast({ text: 'Revived!', ok: true })
      } else {
        setToast({ text: 'Failed', ok: false })
      }
    } catch {
      setToast({ text: 'Error', ok: false })
    } finally {
      setFiring(false)
      setTimeout(() => setToast(null), 2000)
    }
  }, [canRevive, downedMembers, raidId, patchMemberHP, setReviveTokens])

  return (
    <div className="relative">
      <button
        onClick={fire}
        disabled={!canRevive}
        className="flex flex-col items-center justify-center gap-0.5 transition-opacity disabled:opacity-40"
        style={{
          width:      64,
          height:     44,
          background: canRevive ? '#22c55e18' : '#1a1a1a',
          border:     `1px solid ${canRevive ? '#22c55e66' : '#2a2a2a'}`,
        }}
        aria-label={`Revive (${tokens} tokens)`}
      >
        <span className="font-pixel" style={{ fontSize: 6, color: canRevive ? '#22c55e' : '#555' }}>
          REVIVE
        </span>
        <span className="font-silkscreen" style={{ fontSize: 7, color: 'var(--color-tertiary)' }}>
          {tokens} left
        </span>
      </button>

      <AnimatePresence>
        {toast && (
          <motion.div
            className="absolute bottom-full left-1/2 mb-1 px-2 py-1 pointer-events-none whitespace-nowrap"
            style={{
              transform:  'translateX(-50%)',
              background: toast.ok ? '#22c55e22' : '#ff444422',
              border:     `1px solid ${toast.ok ? '#22c55e66' : '#ff444466'}`,
            }}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <span className="font-pixel" style={{ fontSize: 6, color: toast.ok ? '#22c55e' : '#ff4444' }}>
              {toast.text}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function CombatHUD({ currentUserId, crewId, isDevUser, memberProfiles, userCombatClass }: CombatHUDProps) {
  const [open,          setOpen]          = useState(false)
  const [combatEnabled, setCombatEnabled] = useState(false)
  const [timeToNext,    setTimeToNext]    = useState('')
  const triggeredRef                      = useRef(false)

  const activeRaid    = useCombatStore((s) => s.activeRaid)
  const memberStats   = useCombatStore((s) => s.memberStats)
  const combatEvents  = useCombatStore((s) => s.combatEvents)
  const reviveTokens  = useCombatStore((s) => s.reviveTokens)

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

  const username = memberProfiles?.[currentUserId]?.username ?? 'you'

  return (
    // flex-shrink-0: grows into MessageList (flex:1) space as panel expands
    <div className="flex-shrink-0 bg-black" style={{ zIndex: 64 }}>

      {/* ── Banner — always visible at the top, above the expanded panel ── */}
      <RaidMarquee onClick={() => setOpen((v) => !v)} />

      {/* ── Expanded panel — slides open below the banner ── */}
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
                    const uname    = memberProfiles?.[member.user_id]?.username ?? member.user_id.slice(0, 8)
                    const pct      = member.max_hp > 0 ? (member.current_hp / member.max_hp) * 100 : 0
                    const barColor = member.is_downed ? 'var(--color-tertiary)' : pct <= 30 ? 'var(--color-danger)' : 'var(--color-success)'
                    const isMe     = member.user_id === currentUserId
                    return (
                      <div key={member.user_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          className="font-silkscreen leading-none flex-shrink-0"
                          style={{ fontSize: 9, color: member.is_downed ? 'var(--color-tertiary)' : isMe ? 'var(--color-purple)' : 'var(--color-secondary)', width: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {isMe ? '▶ ' : ''}{uname}
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

              {/* Action row: class ability + revive */}
              <div style={{ paddingLeft: 16, paddingRight: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="font-silkscreen leading-none" style={{ fontSize: 9, color: 'var(--color-tertiary)' }}>
                    ABILITY
                  </span>
                  {crewId && userCombatClass && (
                    <AbilityButton
                      crewId={crewId}
                      userId={currentUserId}
                      userClass={userCombatClass}
                      username={username}
                    />
                  )}
                </div>
                <ReviveButton raidId={activeRaid.id} tokens={reviveTokens} />
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}
