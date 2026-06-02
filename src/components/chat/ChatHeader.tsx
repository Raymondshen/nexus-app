'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { useChatStore, XP_PER_LEVEL } from '@/store/chatStore'
import { getXPProgress } from '@/lib/game/xp'
import { createClient } from '@/lib/supabase/client'
import { signOut } from '@/lib/supabase/auth'
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

// ─── UserMenu ─────────────────────────────────────────────────────────────────

function UserMenu({ username, onClose }: { username: string; onClose: () => void }) {
  const router  = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleLogout() {
    setLoading(true)
    try {
      await signOut()
      router.push('/login')
    } catch {
      setLoading(false)
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
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="font-pixel text-[8px] text-[#6b4f8f] mb-1">LOGGED IN AS</p>
            <p className="font-pixel text-[11px] text-white">{username.toUpperCase()}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-[#6b4f8f] hover:text-white"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <button
          onClick={handleLogout}
          disabled={loading}
          className="w-full h-12 font-pixel text-[9px] text-[#ff4444] border border-[#ff4444]/40 hover:border-[#ff4444] hover:bg-[#ff4444]/08 transition-colors disabled:opacity-50"
        >
          {loading ? '...' : 'LOG OUT'}
        </button>

        <button
          onClick={onClose}
          className="mt-3 w-full font-pixel text-[8px] text-[#3d2660] py-2 hover:text-[#6b4f8f] transition-colors"
        >
          CANCEL
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
  const { crewXP, crewLevel, xpFloats, dismissXPFloat, setCrewXP, setActiveRaid, activeRaid } =
    useChatStore()
  const [showShare, setShowShare]         = useState(false)
  const [showUserMenu, setShowUserMenu]   = useState(false)

  const currentMember  = members.find((m) => m.id === currentUserId)
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

  const handleCloseShare    = useCallback(() => setShowShare(false), [])
  const handleCloseUserMenu = useCallback(() => setShowUserMenu(false), [])

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

        {/* Row 1: crew name + share + level badge */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="font-pixel text-[11px] text-white truncate mr-2">
            {crew.name}
          </h1>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowShare(true)}
              className="font-pixel text-[8px] text-[#3d2660] hover:text-[#6b4f8f] transition-colors px-1 py-1"
              style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
              onClick={() => setShowUserMenu(true)}
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

      {/* Share modal */}
      <AnimatePresence>
        {showShare && <ShareModal crew={crew} onClose={handleCloseShare} />}
      </AnimatePresence>

      {/* User / account menu */}
      <AnimatePresence>
        {showUserMenu && (
          <UserMenu username={currentUsername} onClose={handleCloseUserMenu} />
        )}
      </AnimatePresence>
    </>
  )
}
