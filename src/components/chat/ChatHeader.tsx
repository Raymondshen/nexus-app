'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useChatStore, XP_PER_LEVEL } from '@/store/chatStore'
import { getXPProgress } from '@/lib/game/xp'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'
import type { Crew, Profile, ActiveRaid } from '@/types'
import { formatDistanceToNow } from 'date-fns'

interface ChatHeaderProps {
  crew:          Crew
  members:       Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url'>[]
  initialXP:     number
  initialRaid:   ActiveRaid | null
  currentUserId: string
  crewId:        string
  memberLastSeen?: Record<string, string | null>
}

const AVATAR_COLORS = ['#bf5fff', '#00e5ff', '#ffd700', '#ff4444', '#66bb6a', '#ff9800']

const FIVE_MINUTES_MS = 5 * 60 * 1000

function isOnline(lastSeen: string | null | undefined): boolean {
  if (!lastSeen) return false
  return Date.now() - new Date(lastSeen).getTime() < FIVE_MINUTES_MS
}

// ─── Share modal ─────────────────────────────────────────────────────────────

function ShareModal({ crew, onClose }: { crew: Crew; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(crew.invite_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API not available
    }
  }

  async function handleShare() {
    if (!navigator.share) return
    try {
      await navigator.share({
        title: `Join ${crew.name} on Nexus`,
        text:  `Join my crew on Nexus!\nCrew: ${crew.name}\nCode: ${crew.invite_code}`,
      })
    } catch {
      // User cancelled or share failed
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0,  opacity: 1 }}
        exit={{   y: 80, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        className="relative w-full max-w-[480px] bg-[#0f0820] border-t border-[#2a1545] p-6"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-pixel text-[8px] text-[#6b4f8f] mb-1">{crew.name.toUpperCase()}</p>
        <h2 className="font-pixel text-[11px] text-white mb-4">INVITE YOUR CREW</h2>

        {/* Invite code display */}
        <div
          className="flex items-center justify-center mb-4 py-4 border border-[#2a1545]"
          style={{ background: 'rgba(191,95,255,0.06)', letterSpacing: '0.5em' }}
        >
          <span className="font-pixel text-[20px] text-[#bf5fff]"
            style={{ textShadow: '0 0 14px rgba(191,95,255,0.6)' }}>
            {crew.invite_code}
          </span>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleCopy}
            className="flex-1 py-3 font-pixel text-[9px] border transition-colors"
            style={{
              color:       copied ? '#66bb6a' : '#bf5fff',
              borderColor: copied ? 'rgba(102,187,106,0.5)' : 'rgba(191,95,255,0.4)',
              background:  copied ? 'rgba(102,187,106,0.08)' : 'rgba(191,95,255,0.06)',
            }}
          >
            {copied ? '✓ COPIED' : 'COPY CODE'}
          </button>

          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button
              onClick={handleShare}
              className="flex-1 py-3 font-pixel text-[9px] border transition-colors"
              style={{
                color:       '#00e5ff',
                borderColor: 'rgba(0,229,255,0.4)',
                background:  'rgba(0,229,255,0.06)',
              }}
            >
              ↑ SHARE
            </button>
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full font-pixel text-[8px] text-[#3d2660] py-2 hover:text-[#6b4f8f] transition-colors"
        >
          CLOSE
        </button>
      </motion.div>
    </motion.div>
  )
}

// ─── ChatHeader ───────────────────────────────────────────────────────────────

export function ChatHeader({
  crew,
  members,
  initialXP,
  initialRaid,
  currentUserId,
  crewId,
  memberLastSeen = {},
}: ChatHeaderProps) {
  const router = useRouter()
  const { crewXP, crewLevel, xpFloats, dismissXPFloat, setCrewXP, setActiveRaid, activeRaid } =
    useChatStore()
  const [showShare, setShowShare] = useState(false)

  const currentMember   = members.find((m) => m.id === currentUserId)
  const currentUsername = currentMember?.username ?? ''

  useEffect(() => {
    setCrewXP(initialXP)
    setActiveRaid(initialRaid)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update last_seen every 60s
  useEffect(() => {
    const supabase = createClient()
    const update = async () => {
      try {
        await supabase
          .from('crew_members')
          .update({ last_seen: new Date().toISOString() })
          .eq('crew_id', crewId)
          .eq('user_id', currentUserId)
      } catch {
        // Silently fail — presence is best-effort
      }
    }
    update()
    const interval = setInterval(update, 60_000)
    return () => clearInterval(interval)
  }, [crewId, currentUserId])

  const handleCloseShare = useCallback(() => setShowShare(false), [])

  const xpProgress = getXPProgress(crewXP)
  const level      = crewLevel

  return (
    <>
      <div
        className="bg-[#0a0612] border-b border-[#1a1a2e] px-4 pb-0 relative overflow-hidden flex-shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
      >
        {/* Subtle top glow */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[1px]"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(191,95,255,0.4), transparent)' }}
        />

        {/* Row 1: back chevron + crew name | vault + share + level + avatar */}
        <div className="flex items-center justify-between mb-2">
          {/* Left: back + name */}
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <button
              onClick={() => router.back()}
              aria-label="Back"
              className="flex-shrink-0 flex items-center justify-center"
              style={{ minWidth: 36, minHeight: 44 }}
            >
              {/* pixel left chevron */}
              <svg width="8" height="12" viewBox="0 0 8 12" fill="#bf5fff" aria-hidden="true">
                <rect x="4" y="0" width="4" height="4" />
                <rect x="0" y="4" width="4" height="4" />
                <rect x="4" y="8" width="4" height="4" />
              </svg>
            </button>
            <h1 className="font-pixel text-[11px] text-white truncate">
              {crew.name}
            </h1>
          </div>

          {/* Right: vault + share + level + avatar */}
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
            <Link
              href={`/vault/${crewId}`}
              aria-label="View vault"
              className="flex items-center justify-center text-[#3d2660] hover:text-[#6b4f8f] transition-colors"
              style={{ minWidth: 36, minHeight: 44, fontSize: 16 }}
            >
              🏛
            </Link>
            <button
              onClick={() => setShowShare(true)}
              className="flex items-center justify-center text-[#3d2660] hover:text-[#6b4f8f] transition-colors"
              style={{ minWidth: 36, minHeight: 44, fontSize: 14 }}
              aria-label="Share crew invite code"
            >
              🔗
            </button>
            <span
              className="font-pixel text-[8px] text-[#bf5fff] border border-[#bf5fff]/50 px-2 py-0.5"
              style={{ textShadow: '0 0 8px rgba(191,95,255,0.6)' }}
            >
              LVL {String(level).padStart(2, '0')}
            </span>
            <button
              onClick={() => router.push('/profile')}
              className="w-7 h-7 flex items-center justify-center font-pixel text-[9px] border border-[#2a1545] hover:border-[#6b4f8f] transition-colors flex-shrink-0 overflow-hidden relative"
              style={currentMember?.avatar_url ? undefined : { background: 'rgba(107,79,143,0.15)', color: '#6b4f8f' }}
              aria-label="Account menu"
            >
              {currentMember?.avatar_url ? (
                <Image src={currentMember.avatar_url as string} alt={currentUsername} fill sizes="28px" className="object-cover" />
              ) : (
                currentUsername[0]?.toUpperCase() ?? '?'
              )}
            </button>
          </div>
        </div>

        {/* Row 2: member avatars with online dots + warrior count */}
        <div className="flex items-center gap-1.5 mb-2">
          <span className="font-pixel text-[7px] text-[#3d2660] mr-1">
            {members.length} WARRIOR{members.length !== 1 ? 'S' : ''}
          </span>
          {members.slice(0, 8).map((m, i) => (
            <div key={m.id} className="relative">
              {m.avatar_url ? (
                <div
                  className="w-7 h-7 relative overflow-hidden flex-shrink-0 border"
                  style={{ borderColor: AVATAR_COLORS[i % AVATAR_COLORS.length] + '80' }}
                  title={m.username}
                >
                  <Image src={m.avatar_url as string} alt={m.username} fill sizes="28px" className="object-cover" />
                </div>
              ) : (
                <div
                  className="w-7 h-7 flex items-center justify-center border font-pixel text-[8px] flex-shrink-0"
                  style={{
                    backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length] + '22',
                    borderColor:     AVATAR_COLORS[i % AVATAR_COLORS.length] + '80',
                    color:           AVATAR_COLORS[i % AVATAR_COLORS.length],
                  }}
                  title={m.username}
                >
                  {m.username[0]?.toUpperCase()}
                </div>
              )}
              {/* Online presence dot */}
              <span
                className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#0a0612]"
                style={{
                  background: isOnline(memberLastSeen[m.id]) ? '#66bb6a' : '#3d2660',
                }}
              />
            </div>
          ))}
          {members.length > 8 && (
            <span className="font-pixel text-[7px] text-[#3d2660]">+{members.length - 8}</span>
          )}
        </div>

        {/* Boss countdown if raid is active */}
        {activeRaid && !activeRaid.defeated_at && (
          <div className="flex items-center gap-2 mb-2 bg-[#2d0a0a] border border-[#ff4444]/40 px-2 py-1">
            <span className="font-pixel text-[8px] text-[#ff4444]">💀 BOSS ACTIVE</span>
            <span className="font-pixel text-[7px] text-[#ff4444]/70">
              {formatDistanceToNow(new Date(activeRaid.expires_at), { addSuffix: true }).toUpperCase()}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <div className="h-1 w-16 bg-[#1a0000] border border-[#ff4444]/20">
                <div
                  className="h-full bg-[#ff4444] transition-all duration-500"
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
            <div className="relative inline-flex items-center">
              <span className="font-pixel text-[7px] text-[#3d2660]">
                {crewXP % XP_PER_LEVEL} / {XP_PER_LEVEL} XP
              </span>
              <AnimatePresence>
                {xpFloats.map((f) => (
                  <motion.span
                    key={f.id}
                    initial={{ opacity: 1, y: 6 }}
                    animate={{ opacity: 0, y: -16 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.9, ease: 'easeOut' }}
                    onAnimationComplete={() => dismissXPFloat(f.id)}
                    className="pointer-events-none absolute left-0 top-0 font-pixel text-[8px] text-[#ffd700] whitespace-nowrap"
                    style={{ textShadow: '0 0 8px rgba(255,215,0,0.8)' }}
                  >
                    +{f.amount} XP
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
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
      </div>

      {/* Share modal */}
      <AnimatePresence>
        {showShare && <ShareModal crew={crew} onClose={handleCloseShare} />}
      </AnimatePresence>

    </>
  )
}
