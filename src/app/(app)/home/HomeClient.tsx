'use client'

import { useState, useEffect, useRef, useCallback, useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { signOut } from '@/lib/supabase/auth'
import { createCrewAction } from '@/app/(app)/onboarding/create/actions'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { CrewSummary } from './page'
import type { Message } from '@/types'

interface HomeClientProps {
  initialCrews:  CrewSummary[]
  userId:        string
  username:      string
  profileCache:  Record<string, string>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max - 1) + '…'
}

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
      .replace('about ', '')
      .replace('less than a minute ago', 'just now')
  } catch {
    return ''
  }
}

// ─── User menu ────────────────────────────────────────────────────────────────

function UserMenuSheet({
  username,
  onClose,
}: {
  username: string
  onClose:  () => void
}) {
  const router  = useRouter()
  const [busy, setBusy] = useState(false)

  async function handleLogout() {
    setBusy(true)
    try {
      await signOut()
      router.push('/login')
    } catch {
      setBusy(false)
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
          disabled={busy}
          className="w-full h-12 font-pixel text-[9px] text-[#ff4444] border border-[#ff4444]/40 hover:border-[#ff4444] transition-colors disabled:opacity-50"
        >
          {busy ? '...' : 'LOG OUT'}
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

// ─── Create crew modal ────────────────────────────────────────────────────────

function CreateCrewSheet({ onClose }: { onClose: () => void }) {
  const [state, action, isPending] = useActionState(createCrewAction, null)

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
            <p className="font-pixel text-[8px] text-[#6b4f8f] mb-1">NEW WAR PARTY</p>
            <h2 className="font-pixel text-[11px] text-white">CREATE A CREW</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-[#6b4f8f] hover:text-white"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {state?.error && (
          <div className="bg-[#ff4444]/10 border border-[#ff4444]/50 px-3 py-2 mb-4">
            <p className="font-pixel text-[9px] text-[#ff4444] leading-relaxed">
              {state.error}
            </p>
          </div>
        )}

        <form action={action} className="flex flex-col gap-4">
          <Input
            name="crewName"
            type="text"
            label="CREW NAME"
            placeholder="The Void Slayers"
            required
            minLength={2}
            maxLength={30}
            autoComplete="off"
            autoFocus
          />
          <Button type="submit" variant="primary" loading={isPending} className="w-full">
            FORGE THE CREW
          </Button>
        </form>

        <div className="flex items-center gap-3 mt-4">
          <div className="flex-1 border-t border-[#2a1545]" />
          <span className="font-pixel text-[8px] text-[#3d2660]">── OR ──</span>
          <div className="flex-1 border-t border-[#2a1545]" />
        </div>

        <a
          href="/onboarding/join"
          className="mt-4 w-full flex items-center justify-center h-12 font-pixel text-[9px] text-[#bf5fff] border border-[#bf5fff]/40 hover:border-[#bf5fff] transition-colors"
        >
          🔗 JOIN WITH CODE
        </a>
      </motion.div>
    </motion.div>
  )
}

// ─── Crew card ────────────────────────────────────────────────────────────────

const LEVEL_COLORS = ['#6b4f8f', '#bf5fff', '#00e5ff', '#ffd700', '#ff4444']

function CrewCard({
  summary,
  onTap,
}: {
  summary: CrewSummary
  onTap:   () => void
}) {
  const { crew, lastMessage, unreadCount } = summary
  const levelColor = LEVEL_COLORS[Math.min(Math.floor(crew.level / 3), LEVEL_COLORS.length - 1)]
  const hasUnread  = unreadCount > 0

  return (
    <motion.button
      onClick={onTap}
      whileTap={{ scale: 0.98 }}
      className="w-full text-left px-4 py-3.5 flex items-center gap-3 border-b border-[#1a1a2e] active:bg-[#0f0820]/80 transition-colors"
      style={{ background: hasUnread ? 'rgba(191,95,255,0.03)' : 'transparent' }}
    >
      {/* Level avatar */}
      <div
        className="flex-shrink-0 w-11 h-11 flex items-center justify-center border font-pixel text-[8px]"
        style={{
          borderColor:     levelColor + '60',
          backgroundColor: levelColor + '18',
          color:           levelColor,
        }}
      >
        {String(crew.level).padStart(2, '0')}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span
            className="font-pixel text-[10px] truncate"
            style={{ color: hasUnread ? '#ffffff' : '#c8b8e0' }}
          >
            {crew.name}
          </span>
          {lastMessage && (
            <span className="font-pixel text-[7px] text-[#3d2660] flex-shrink-0">
              {relativeTime(lastMessage.created_at)}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="font-sans text-[13px] text-[#6b4f8f] truncate leading-tight">
            {lastMessage
              ? lastMessage.sender
                ? `${lastMessage.sender}: ${truncate(lastMessage.content, 36)}`
                : truncate(lastMessage.content, 40)
              : 'No messages yet'}
          </p>
          {hasUnread && (
            <span
              className="flex-shrink-0 min-w-[18px] h-[18px] px-1 flex items-center justify-center font-pixel text-[7px] text-[#0a0612] rounded-full"
              style={{ background: '#bf5fff', boxShadow: '0 0 8px rgba(191,95,255,0.6)' }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
      </div>
    </motion.button>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-8 text-center">
      <div
        className="font-pixel text-[32px] text-[#bf5fff] mb-4"
        style={{ textShadow: '0 0 30px rgba(191,95,255,0.6)' }}
      >
        N
      </div>
      <h2 className="font-pixel text-[10px] text-white mb-2">NO CREWS YET</h2>
      <p className="font-pixel text-[8px] text-[#3d2660] leading-relaxed mb-8">
        Assemble your war party<br />and start fighting.
      </p>
      <button
        onClick={onCreate}
        className="w-full max-w-[280px] h-12 font-pixel text-[10px] text-[#0a0612] bg-[#bf5fff] shadow-[3px_3px_0px_#7b2fa8] active:shadow-none active:translate-y-[2px] transition-all mb-3"
      >
        ⚔ CREATE CREW
      </button>
      <a
        href="/onboarding/join"
        className="w-full max-w-[280px] flex items-center justify-center h-12 font-pixel text-[10px] text-[#bf5fff] border border-[#bf5fff]/50 hover:border-[#bf5fff] transition-colors"
      >
        🔗 JOIN WITH CODE
      </a>
    </div>
  )
}

// ─── HomeClient ───────────────────────────────────────────────────────────────

export function HomeClient({
  initialCrews,
  userId,
  username,
  profileCache,
}: HomeClientProps) {
  const router = useRouter()

  const [crews,        setCrews]        = useState<CrewSummary[]>(initialCrews)
  const [showCreate,   setShowCreate]   = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)

  const profileCacheRef = useRef<Record<string, string>>(profileCache)
  useEffect(() => { profileCacheRef.current = profileCache }, [profileCache])

  const crewIds = crews.map((c) => c.crew.id)

  // ── Realtime: live message previews + unread counts ──────────────────────
  useEffect(() => {
    if (crewIds.length === 0) return
    const supabase = createClient()

    const channels = crewIds.map((crewId) =>
      supabase
        .channel(`home:${crewId}`)
        .on(
          'postgres_changes',
          {
            event:  'INSERT',
            schema: 'public',
            table:  'messages',
            filter: `crew_id=eq.${crewId}`,
          },
          (payload) => {
            const msg = payload.new as Message
            if (msg.message_type === 'system') return

            setCrews((prev) =>
              prev
                .map((cs) => {
                  if (cs.crew.id !== crewId) return cs
                  return {
                    ...cs,
                    lastMessage: {
                      content:    msg.content,
                      sender:     profileCacheRef.current[msg.user_id] ?? '',
                      created_at: msg.created_at,
                    },
                    unreadCount:
                      msg.user_id === userId
                        ? cs.unreadCount
                        : cs.unreadCount + 1,
                  }
                })
                // Re-sort: crew with newest message floats to top
                .sort((a, b) =>
                  (b.lastMessage?.created_at ?? '').localeCompare(
                    a.lastMessage?.created_at ?? '',
                  ),
                ),
            )
          },
        )
        .subscribe(),
    )

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch))
    }
  }, [crewIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation: mark as read on tap ──────────────────────────────────────
  const handleCrewTap = useCallback(
    (crewId: string) => {
      // Optimistically clear unread badge
      setCrews((prev) =>
        prev.map((cs) =>
          cs.crew.id === crewId ? { ...cs, unreadCount: 0 } : cs,
        ),
      )
      // Update last_seen so unread resets properly (fire-and-forget)
      const supabase = createClient()
      supabase
        .from('crew_members')
        .update({ last_seen: new Date().toISOString() })
        .eq('crew_id', crewId)
        .eq('user_id', userId)
        .then(() => {})

      router.push(`/chat/${crewId}`)
    },
    [userId, router],
  )

  const handleCloseCreate   = useCallback(() => setShowCreate(false), [])
  const handleCloseUserMenu = useCallback(() => setShowUserMenu(false), [])

  return (
    <div className="min-h-screen bg-[#0a0612] flex flex-col">

      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 border-b border-[#1a1a2e] flex-shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)', paddingBottom: 12 }}
      >
        <h1
          className="font-pixel text-[14px] text-[#bf5fff]"
          style={{ textShadow: '0 0 20px rgba(191,95,255,0.5)' }}
        >
          NEXUS
        </h1>

        <div className="flex items-center gap-2">
          {crews.length > 0 && (
            <button
              onClick={() => setShowCreate(true)}
              className="w-8 h-8 flex items-center justify-center text-[#6b4f8f] hover:text-[#bf5fff] border border-[#2a1545] hover:border-[#bf5fff]/40 transition-colors"
              aria-label="Create crew"
            >
              <Plus size={14} />
            </button>
          )}
          <button
            onClick={() => setShowUserMenu(true)}
            className="w-8 h-8 flex items-center justify-center font-pixel text-[9px] border border-[#2a1545] hover:border-[#6b4f8f] transition-colors"
            style={{ background: 'rgba(107,79,143,0.15)', color: '#6b4f8f' }}
            aria-label="Account"
          >
            {username[0]?.toUpperCase() ?? '?'}
          </button>
        </div>
      </div>

      {/* ── Section label ── */}
      {crews.length > 0 && (
        <div className="px-4 py-2 border-b border-[#1a1a2e]">
          <span className="font-pixel text-[8px] text-[#3d2660]">
            YOUR CREWS — {crews.length}
          </span>
        </div>
      )}

      {/* ── Crew list / empty state ── */}
      {crews.length === 0 ? (
        <EmptyState onCreate={() => setShowCreate(true)} />
      ) : (
        <div className="flex-1 overflow-y-auto">
          {crews.map((summary) => (
            <CrewCard
              key={summary.crew.id}
              summary={summary}
              onTap={() => handleCrewTap(summary.crew.id)}
            />
          ))}
        </div>
      )}

      {/* ── FAB (when crew list is non-empty) ── */}
      {crews.length > 0 && (
        <button
          onClick={() => setShowCreate(true)}
          className="fixed bottom-6 right-5 w-14 h-14 flex items-center justify-center text-[#0a0612] shadow-[3px_3px_0px_#7b2fa8] active:shadow-none active:translate-y-[1px] transition-all z-40"
          style={{
            background: '#bf5fff',
            boxShadow:  '3px 3px 0px #7b2fa8, 0 0 20px rgba(191,95,255,0.4)',
            bottom:     'max(calc(env(safe-area-inset-bottom) + 16px), 24px)',
          }}
          aria-label="Create new crew"
        >
          <Plus size={20} />
        </button>
      )}

      {/* ── Modals ── */}
      <AnimatePresence>
        {showCreate   && <CreateCrewSheet onClose={handleCloseCreate} />}
        {showUserMenu && <UserMenuSheet username={username} onClose={handleCloseUserMenu} />}
      </AnimatePresence>
    </div>
  )
}
