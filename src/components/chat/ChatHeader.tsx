'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useChatStore } from '@/store/chatStore'
import { createClient } from '@/lib/supabase/client'
import type { Crew, ActiveRaid } from '@/types'
import { formatDistanceToNow } from 'date-fns'

interface ChatHeaderProps {
  crew:          Crew
  initialXP:     number
  initialRaid:   ActiveRaid | null
  currentUserId: string
  crewId:        string
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
  initialXP,
  initialRaid,
  currentUserId,
  crewId,
}: ChatHeaderProps) {
  const router = useRouter()
  const { setCrewXP, setActiveRaid, activeRaid } = useChatStore()
  const [showShare, setShowShare] = useState(false)

  useEffect(() => {
    setCrewXP(initialXP)
    setActiveRaid(initialRaid)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update last_seen every 60s for accurate server-side initial state.
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

  return (
    <>
      <div
        className="bg-black border-b border-border px-4 pb-4 relative flex-shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
      >
        {/* Heading row — h-10 (40px), matches Figma "heading" node */}
        <div className="flex items-center justify-between h-10">

          {/* Left: crew name + chevron-right, gap-1 (4px) — Figma node 11:114 */}
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {/* Crew name — Press Start 2P, 18px, #fafafa */}
            <h1 className="font-pixel text-[18px] text-primary truncate leading-none">
              {crew.name.toUpperCase()}
            </h1>
            {/* Chevron-right pixel icon — 24px hitbox, purple tint */}
            <button
              onClick={() => router.back()}
              aria-label="Back"
              className="flex-shrink-0 flex items-center justify-center"
              style={{ width: 24, height: 40 }}
            >
              <i className="hn hn-angle-right" style={{ fontSize: 14, color: '#a855f7' }} aria-hidden="true" />
            </button>
          </div>

          {/* Right: user-plus + vault, gap-4 (16px) — Figma node 11:96 */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <button
              onClick={() => setShowShare(true)}
              aria-label="Invite members"
              className="flex items-center justify-center text-primary hover:text-purple transition-colors"
              style={{ width: 24, height: 40 }}
            >
              <i className="hn hn-user-plus" style={{ fontSize: 18 }} aria-hidden="true" />
            </button>
            <Link
              href={`/vault/${crewId}`}
              aria-label="View vault"
              className="flex items-center justify-center text-primary hover:text-purple transition-colors"
              style={{ width: 24, height: 40 }}
            >
              <i className="hn hn-bank" style={{ fontSize: 18 }} aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* Boss countdown if raid is active */}
        {activeRaid && !activeRaid.defeated_at && (
          <div className="flex items-center gap-2 mt-2 bg-[#2d0a0a] border border-[#ff4444]/40 px-2 py-1">
            <span className="font-pixel text-[8px] text-[#ff4444]">💀 BOSS ACTIVE</span>
            <span className="font-pixel text-[7px] text-[#ff4444]/70">
              {formatDistanceToNow(new Date(activeRaid.expires_at), { addSuffix: true }).toUpperCase()}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <div className="h-1 w-16 bg-[#1a0000] border border-[#ff4444]/20">
                <div
                  className="h-full bg-[#ff4444] transition-all duration-500"
                  style={{ width: `${Math.round((activeRaid.current_hp / activeRaid.max_hp) * 100)}%` }}
                />
              </div>
              <span className="font-pixel text-[7px] text-[#ff4444]/70">HP</span>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showShare && <ShareModal crew={crew} onClose={handleCloseShare} />}
      </AnimatePresence>
    </>
  )
}
