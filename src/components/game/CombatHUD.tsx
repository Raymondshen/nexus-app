'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { useCombatStore } from '@/store/combatStore'
import { isSupabaseStorage, resolveAvatarUrl } from '@/components/ui/Avatar'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'
import { ChevronRight } from 'pixelarticons/react/ChevronRight'

interface CombatHUDProps {
  memberProfiles: Record<string, Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url'>>
  currentUserId:  string
  crewId?:        string
}

const CLASS_COLOR: Record<string, string> = {
  warrior: '#ef4444',
  healer:  '#22c55e',
  archer:  '#ffd700',
  rogue:   '#bf5fff',
  mage:    '#00e5ff',
}

function HPBar({ current, max, cls, downed }: { current: number; max: number; cls: string; downed: boolean }) {
  const pct    = max > 0 ? (current / max) * 100 : 0
  const isLow  = pct < 30
  const color  = downed ? 'var(--color-downed)' : isLow ? 'var(--color-hp-low)' : 'var(--color-hp)'

  return (
    <div>
      <div className="flex justify-between mb-0.5">
        <span className="font-pixel" style={{ fontSize: 5, color: 'var(--color-tertiary)' }}>HP</span>
        <span className="font-silkscreen" style={{ fontSize: 7, color: downed ? 'var(--color-downed)' : 'var(--color-primary)' }}>
          {downed ? 'DOWN' : `${current}/${max}`}
        </span>
      </div>
      <div className="relative h-[4px] rounded-full overflow-hidden" style={{ background: '#1a0d2e' }}>
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: color }}
          initial={false}
          animate={{ width: downed ? '0%' : `${pct}%` }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}



export function CombatHUD({ memberProfiles, currentUserId, crewId }: CombatHUDProps) {
  const [open, setOpen] = useState(false)
  const [reviving, setReviving] = useState<string | null>(null)
  const { activeRaid, memberStats, reviveTokens } = useCombatStore()

  const handleRevive = useCallback(async (targetUserId: string) => {
    if (!activeRaid || reviveTokens < 1 || reviving) return
    setReviving(targetUserId)
    try {
      const supabase = createClient()
      await supabase.rpc('use_revive_token', {
        p_raid_id:       activeRaid.id,
        p_target_user_id: targetUserId,
      })
    } catch {
      // RPC error is non-critical — realtime will reconcile state
    } finally {
      setReviving(null)
    }
  }, [activeRaid, reviveTokens, reviving]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!activeRaid) return null

  const members = Object.values(memberStats)
  if (members.length === 0) return null

  return (
    <div style={{ borderBottom: '1px solid var(--color-border)' }}>
      {/* Toggle row */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4"
        style={{ height: 32, background: '#0f0820' }}
      >
        <div className="flex items-center gap-2">
          <span className="font-pixel" style={{ fontSize: 6, color: '#6b4f8f' }}>RAID ACTIVE</span>
          <span
            className="font-silkscreen"
            style={{ fontSize: 7, color: activeRaid.phase === 3 ? '#ef4444' : activeRaid.phase === 2 ? '#f59e0b' : '#9333ea' }}
          >
            P{activeRaid.phase}
          </span>
          {reviveTokens > 0 && (
            <span className="font-silkscreen" style={{ fontSize: 7, color: '#22c55e' }}>
              ✦ {reviveTokens} revives
            </span>
          )}
        </div>
        <motion.div animate={{ rotate: open ? 90 : -90 }} transition={{ duration: 0.15 }}>
          <ChevronRight style={{ width: 14, height: 14, color: '#6b4f8f' }} />
        </motion.div>
      </button>

      {/* Expanded member rows */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden', background: '#0a0612' }}
          >
            {members.map((m) => {
              const profile  = memberProfiles[m.user_id]
              const isYou    = m.user_id === currentUserId
              const clsColor = CLASS_COLOR[m.class] ?? '#a855f7'

              return (
                <div
                  key={m.user_id}
                  className="flex items-center gap-3 px-4 py-2"
                  style={{
                    borderBottom: '1px solid #1a0d2e',
                    opacity: m.is_downed ? 0.5 : 1,
                  }}
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0" style={{ width: 28, height: 28 }}>
                    {profile?.avatar_url ? (
                      <Image
                        src={resolveAvatarUrl(profile.avatar_url, 28)}
                        alt={profile.username}
                        fill
                        sizes="28px"
                        className="rounded-full object-cover"
                        loader={isSupabaseStorage(profile.avatar_url) ? undefined : undefined}
                        unoptimized={isSupabaseStorage(profile.avatar_url)}
                      />
                    ) : (
                      <div
                        className="w-full h-full rounded-full flex items-center justify-center font-pixel"
                        style={{ background: `${clsColor}22`, fontSize: 7, color: clsColor }}
                      >
                        {(profile?.username ?? '?')[0].toUpperCase()}
                      </div>
                    )}
                    {m.is_downed && (
                      <div className="absolute inset-0 rounded-full flex items-center justify-center" style={{ background: '#00000088' }}>
                        <span style={{ fontSize: 10 }}>💀</span>
                      </div>
                    )}
                  </div>

                  {/* Name + class */}
                  <div className="flex-shrink-0" style={{ width: 64 }}>
                    <p className="font-silkscreen leading-none truncate" style={{ fontSize: 8, color: isYou ? clsColor : 'var(--color-primary)', maxWidth: 64 }}>
                      {isYou ? 'YOU' : (profile?.username ?? '???')}
                    </p>
                    <p className="font-pixel leading-none mt-0.5 uppercase" style={{ fontSize: 5, color: clsColor }}>
                      {m.class}
                    </p>
                  </div>

                  {/* Bars or revive button */}
                  {m.is_downed && reviveTokens > 0 ? (
                    <div className="flex-1 flex items-center justify-end">
                      <button
                        onClick={() => handleRevive(m.user_id)}
                        disabled={!!reviving}
                        className="px-3 py-1 font-pixel transition-opacity disabled:opacity-50 active:opacity-60"
                        style={{ fontSize: 7, color: '#22c55e', background: '#22c55e18', border: '1px solid #22c55e44' }}
                      >
                        {reviving === m.user_id ? '...' : 'REVIVE'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col gap-1">
                      <HPBar current={m.current_hp} max={m.max_hp} cls={m.class} downed={m.is_downed} />
                      <div className="flex items-center justify-between">
                        <span className="font-pixel" style={{ fontSize: 5, color: 'var(--color-tertiary)' }}>MSGS</span>
                        <span className="font-silkscreen" style={{ fontSize: 7, color: clsColor }}>
                          {m.ability_bank}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
