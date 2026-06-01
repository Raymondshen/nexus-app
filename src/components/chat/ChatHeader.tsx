'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useChatStore, XP_PER_LEVEL } from '@/store/chatStore'
import { getXPProgress } from '@/lib/game/xp'
import type { Crew, Profile, ActiveRaid } from '@/types'
import { formatDistanceToNow } from 'date-fns'

interface ChatHeaderProps {
  crew: Crew
  members: Pick<Profile, 'id' | 'username' | 'avatar_class'>[]
  initialXP: number
  initialRaid: ActiveRaid | null
}

const AVATAR_COLORS = ['#bf5fff', '#00e5ff', '#ffd700', '#ff4444', '#66bb6a', '#ff9800']

export function ChatHeader({ crew, members, initialXP, initialRaid }: ChatHeaderProps) {
  const { crewXP, crewLevel, xpFloats, dismissXPFloat, setCrewXP, setActiveRaid, activeRaid } =
    useChatStore()

  useEffect(() => {
    setCrewXP(initialXP)
    setActiveRaid(initialRaid)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const xpProgress = getXPProgress(crewXP)
  const level      = crewLevel

  return (
    <div className="bg-[#0a0612] border-b border-[#1a1a2e] px-4 pt-3 pb-0 relative overflow-hidden">
      {/* Subtle top glow */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[1px]"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(191,95,255,0.4), transparent)' }}
      />

      {/* Row 1: crew name + level badge */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="font-pixel text-[11px] text-white truncate mr-3">
          {crew.name}
        </h1>
        <span
          className="font-pixel text-[8px] text-[#bf5fff] border border-[#bf5fff]/50 px-2 py-0.5 flex-shrink-0"
          style={{ textShadow: '0 0 8px rgba(191,95,255,0.6)' }}
        >
          LVL {String(level).padStart(2, '0')}
        </span>
      </div>

      {/* Row 2: member avatars */}
      <div className="flex items-center gap-1.5 mb-2">
        {members.slice(0, 8).map((m, i) => (
          <div
            key={m.id}
            className="w-6 h-6 flex items-center justify-center border font-pixel text-[8px] flex-shrink-0"
            style={{
              backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length] + '22',
              borderColor:     AVATAR_COLORS[i % AVATAR_COLORS.length] + '80',
              color:           AVATAR_COLORS[i % AVATAR_COLORS.length],
            }}
            title={m.username}
          >
            {m.username[0]?.toUpperCase()}
          </div>
        ))}
        {members.length > 8 && (
          <span className="font-pixel text-[7px] text-[#3d2660]">+{members.length - 8}</span>
        )}
      </div>

      {/* Boss countdown if raid is active */}
      {activeRaid && !activeRaid.defeated_at && (
        <div className="flex items-center gap-2 mb-2 bg-[#2d0a0a] border border-[#ff4444]/40 px-2 py-1">
          <span className="font-pixel text-[8px] text-[#ff4444]">
            💀 BOSS ACTIVE
          </span>
          <span className="font-pixel text-[7px] text-[#ff4444]/70">
            {formatDistanceToNow(new Date(activeRaid.expires_at), { addSuffix: true }).toUpperCase()}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <div className="h-1 w-16 bg-[#1a0000] border border-[#ff4444]/20">
              <div
                className="h-full bg-[#ff4444] transition-all"
                style={{
                  width: `${Math.round((activeRaid.current_hp / activeRaid.max_hp) * 100)}%`,
                }}
              />
            </div>
            <span className="font-pixel text-[7px] text-[#ff4444]/70">HP</span>
          </div>
        </div>
      )}

      {/* XP bar */}
      <div className="pb-0">
        <div className="flex items-center justify-between mb-1">
          <span className="font-pixel text-[7px] text-[#3d2660]">
            {crewXP % XP_PER_LEVEL} / {XP_PER_LEVEL} XP
          </span>
          <span className="font-pixel text-[7px] text-[#3d2660]">NEXT BOSS</span>
        </div>
        <div className="h-1.5 bg-[#0f0820] border border-[#1a1a2e] mb-3">
          <motion.div
            className="h-full"
            style={{
              background: 'linear-gradient(90deg, #7b2dbd, #bf5fff)',
              boxShadow:  '0 0 6px rgba(191,95,255,0.6)',
            }}
            animate={{ width: `${xpProgress}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
        </div>
      </div>

      {/* Floating +XP notifications */}
      <AnimatePresence>
        {xpFloats.map((f) => (
          <motion.div
            key={f.id}
            initial={{ opacity: 1, y: 0 }}
            animate={{ opacity: 0, y: -24 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9 }}
            onAnimationComplete={() => dismissXPFloat(f.id)}
            className="pointer-events-none absolute right-4 top-2 font-pixel text-[9px] text-[#ffd700]"
            style={{ textShadow: '0 0 8px rgba(255,215,0,0.8)' }}
          >
            +{f.amount} XP
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
