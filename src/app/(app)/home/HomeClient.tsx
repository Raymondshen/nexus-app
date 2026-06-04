'use client'

import { useState, useEffect, useRef, useCallback, useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion'
import type { PanInfo } from 'framer-motion'
import { X, Plus, Bell, Pencil } from 'lucide-react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { createCrewAction } from '@/app/(app)/onboarding/create/actions'
import { leaveCrewAction } from './actions'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { CrewSummary } from './page'
import type { Message, MessageWithProfile } from '@/types'

interface HomeClientProps {
  initialCrews:  CrewSummary[]
  userId:        string
  username:      string
  avatarUrl:     string | null
  memberSince:   string
  profileCache:  Record<string, string>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const XP_PER_LEVEL = 500

function truncate(str: string, max: number): string {
  return str.length <= max ? str : str.slice(0, max - 1) + '…'
}

function relativeTime(iso: string): string {
  try {
    const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (seconds < 60)    return 'just now'
    if (seconds < 3600)  return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  } catch {
    return ''
  }
}

// ─── Profile banner ───────────────────────────────────────────────────────────

function ProfileBanner({
  username,
  avatarUrl,
  memberSince,
  crewCount,
  onEditProfile,
}: {
  username:     string
  avatarUrl:    string | null
  memberSince:  string
  crewCount:    number
  onEditProfile: () => void
}) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4 flex flex-col gap-4">
      {/* User details row */}
      <div className="flex items-center gap-4">
        {/* Avatar */}
        <div className="w-12 h-12 flex-shrink-0 overflow-hidden relative bg-border">
          {avatarUrl ? (
            <Image src={avatarUrl} alt={username} fill sizes="48px" className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-pixel text-[10px] text-primary">
              {username[0]?.toUpperCase() ?? '?'}
            </div>
          )}
        </div>

        {/* Name + stats */}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          {memberSince && (
            <span className="font-silkscreen text-[8px] text-tertiary">
              Member Since {memberSince}
            </span>
          )}
          <span className="font-body font-bold text-[18px] text-primary leading-tight truncate">
            {username}
          </span>
          <span className="font-silkscreen text-[8px] text-secondary">
            {crewCount} group chat{crewCount !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Edit */}
        <button
          onClick={onEditProfile}
          className="self-start text-tertiary hover:text-primary transition-colors"
          aria-label="Edit profile"
        >
          <Pencil size={16} />
        </button>
      </div>

      {/* AFK XP bar */}
      <div className="flex items-stretch gap-2">
        <div className="flex-1 flex flex-col gap-2 justify-center">
          <span className="font-silkscreen text-[8px] text-primary">
            AFK EXP ACCUMULATED · 100 / 100 XP
          </span>
          <div className="h-1 w-full bg-purple" />
        </div>
        <button
          className="bg-purple px-4 py-2 font-pixel text-[8px] text-primary whitespace-nowrap"
        >
          CLAIM
        </button>
      </div>
    </div>
  )
}

// ─── Create crew sheet ────────────────────────────────────────────────────────

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
      <div className="absolute inset-0 bg-black/70" />
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0,  opacity: 1 }}
        exit={{   y: 80, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        className="relative w-full max-w-[480px] bg-surface border-t border-border p-6"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="font-pixel text-[8px] text-tertiary mb-1">NEW WAR PARTY</p>
            <h2 className="font-pixel text-[11px] text-primary">CREATE A CREW</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-tertiary hover:text-primary"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {state?.error && (
          <div className="bg-[#ff4444]/10 border border-[#ff4444]/50 px-3 py-2 mb-4">
            <p className="font-pixel text-[9px] text-[#ff4444] leading-relaxed">{state.error}</p>
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
          <div className="flex-1 border-t border-border" />
          <span className="font-pixel text-[8px] text-muted">── OR ──</span>
          <div className="flex-1 border-t border-border" />
        </div>

        <a
          href="/onboarding/join"
          className="mt-4 w-full flex items-center justify-center h-12 font-pixel text-[9px] text-purple border border-purple/40 hover:border-purple transition-colors"
        >
          🔗 JOIN WITH CODE
        </a>
      </motion.div>
    </motion.div>
  )
}

// ─── Leave confirm sheet ──────────────────────────────────────────────────────

function LeaveConfirmSheet({
  summary,
  onConfirm,
  onClose,
  pending,
  leaveError,
}: {
  summary:    CrewSummary
  onConfirm:  () => void
  onClose:    () => void
  pending:    boolean
  leaveError: string | null
}) {
  const isLast = summary.memberCount <= 1

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70" />
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0,  opacity: 1 }}
        exit={{   y: 80, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        className="relative w-full max-w-[480px] bg-surface border-t border-border p-6"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5">
          <p className="font-pixel text-[8px] text-[#ff4444] mb-1">⚠ LEAVE CREW</p>
          <h2 className="font-pixel text-[11px] text-primary truncate">
            {summary.crew.name.toUpperCase()}
          </h2>
        </div>

        <p className="font-pixel text-[8px] text-tertiary leading-relaxed">
          {isLast
            ? 'You are the last member. This will permanently delete the crew and all its history.'
            : 'Your XP and artifact gains will be redistributed to the remaining members.'}
        </p>

        {leaveError && (
          <p className="mt-3 font-pixel text-[8px] text-[#ff4444]">{leaveError}</p>
        )}

        <button
          onClick={onConfirm}
          disabled={pending}
          className="mt-5 w-full h-12 font-pixel text-[9px] text-white bg-[#ff4444] active:opacity-80 transition-opacity disabled:opacity-50"
        >
          {pending ? '...' : isLast ? 'DELETE CREW' : 'LEAVE CREW'}
        </button>

        <button
          onClick={onClose}
          disabled={pending}
          className="mt-3 w-full font-pixel text-[8px] text-muted py-2 hover:text-tertiary transition-colors disabled:opacity-50"
        >
          CANCEL
        </button>
      </motion.div>
    </motion.div>
  )
}

// ─── Crew card content ────────────────────────────────────────────────────────

const CREW_AVATAR_COLORS = ['#bf5fff', '#00e5ff', '#ffd700', '#ff4444', '#66bb6a', '#ff9800']

function CrewCardContent({ summary }: { summary: CrewSummary }) {
  const { crew, lastMessage, unreadCount } = summary
  const hasUnread   = unreadCount > 0
  const xpInLevel   = crew.total_xp % XP_PER_LEVEL
  const colorIndex  = crew.name.charCodeAt(0) % CREW_AVATAR_COLORS.length
  const avatarColor = CREW_AVATAR_COLORS[colorIndex]

  return (
    <div className="w-full text-left flex items-center gap-4">
      {/* Crew avatar — 52×52px matching Figma */}
      <div
        className="flex-shrink-0 w-[52px] h-[52px] flex items-center justify-center font-pixel text-[11px]"
        style={{
          background:  avatarColor + '22',
          border:      `1px solid ${avatarColor}60`,
          color:       avatarColor,
        }}
      >
        {crew.name[0]?.toUpperCase()}
      </div>

      {/* Content — vertically centered to match avatar height */}
      <div className="flex-1 min-w-0 flex flex-col gap-2 justify-center">
        {/* XP / level */}
        <span className="font-silkscreen text-[8px] text-tertiary whitespace-nowrap">
          {xpInLevel}/{XP_PER_LEVEL} XP · Group Lv. {crew.level}
          {hasUnread ? ` · +${unreadCount} new` : ''}
        </span>

        <div className="flex flex-col gap-1">
          {/* Crew name + timestamp — 16px row height */}
          <div className="flex items-center gap-2">
            <span className="font-body font-bold text-[16px] leading-none text-white truncate flex-1 min-w-0">
              {crew.name}
            </span>
            {lastMessage && (
              <span className="font-body font-light text-[12px] leading-none text-muted flex-shrink-0 whitespace-nowrap">
                {relativeTime(lastMessage.created_at)}
              </span>
            )}
          </div>

          {/* Last message preview — 14px */}
          <p
            className="font-body font-normal text-[14px] leading-none truncate"
            style={{ color: hasUnread ? 'var(--color-primary)' : 'var(--color-muted)' }}
          >
            {lastMessage
              ? lastMessage.sender
                ? `${lastMessage.sender}: ${truncate(lastMessage.content, 40)}`
                : truncate(lastMessage.content, 44)
              : 'Group journey just started… send a message'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Swipeable crew card ──────────────────────────────────────────────────────

const LEAVE_REVEAL = 88

function SwipeableCrewCard({
  summary,
  onTap,
  onLeaveRequest,
  openCardId,
  onOpen,
}: {
  summary:        CrewSummary
  onTap:          () => void
  onLeaveRequest: () => void
  openCardId:     string | null
  onOpen:         (id: string) => void
}) {
  const x           = useMotionValue(0)
  const [open, setOpen] = useState(false)
  const wasDragging = useRef(false)

  useEffect(() => {
    if (openCardId !== summary.crew.id) {
      animate(x, 0, { type: 'spring', stiffness: 300, damping: 28 })
      setOpen(false)
    }
  }, [openCardId]) // eslint-disable-line react-hooks/exhaustive-deps

  function snapTo(target: number, isOpen: boolean) {
    animate(x, target, { type: 'spring', stiffness: 300, damping: 28 })
    setOpen(isOpen)
  }

  function handleDragEnd(_: unknown, info: PanInfo) {
    setTimeout(() => { wasDragging.current = false }, 50)
    if (info.offset.x < -(LEAVE_REVEAL / 2)) {
      snapTo(-LEAVE_REVEAL, true)
    } else {
      snapTo(0, false)
    }
  }

  function handleClick() {
    if (wasDragging.current) return
    if (open) {
      snapTo(0, false)
    } else {
      onTap()
    }
  }

  return (
    <div className="overflow-hidden">
      <motion.div
        className="flex"
        drag="x"
        dragConstraints={{ left: -LEAVE_REVEAL, right: 0 }}
        dragElastic={{ left: 0.05, right: 0.1 }}
        style={{ x, width: `calc(100% + ${LEAVE_REVEAL}px)` }}
        onDragStart={() => { wasDragging.current = true; onOpen(summary.crew.id) }}
        onDragEnd={handleDragEnd}
      >
        <motion.div
          className="flex-1 min-w-0 bg-black cursor-pointer"
          onClick={handleClick}
          whileTap={{ scale: open ? 1 : 0.98 }}
        >
          <CrewCardContent summary={summary} />
        </motion.div>

        <button
          className="flex-shrink-0 flex flex-col items-center justify-center gap-1 bg-[#ff4444]"
          style={{ width: LEAVE_REVEAL }}
          onClick={(e) => { e.stopPropagation(); snapTo(0, false); onLeaveRequest() }}
          tabIndex={open ? 0 : -1}
          aria-label={`Leave ${summary.crew.name}`}
        >
          <span style={{ fontSize: 16 }}>🚪</span>
          <span className="font-pixel text-[7px] text-white">LEAVE</span>
        </button>
      </motion.div>
    </div>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-8 text-center py-12">
      <h2 className="font-pixel text-[10px] text-primary mb-2">NO CREWS YET</h2>
      <p className="font-pixel text-[8px] text-muted leading-relaxed mb-8">
        Assemble your war party<br />and start fighting.
      </p>
      <button
        onClick={onCreate}
        className="w-full max-w-[280px] h-12 font-pixel text-[10px] text-black bg-purple active:opacity-80 transition-opacity mb-3"
      >
        ⚔ CREATE CREW
      </button>
      <a
        href="/onboarding/join"
        className="w-full max-w-[280px] flex items-center justify-center h-12 font-pixel text-[10px] text-purple border border-purple/50 hover:border-purple transition-colors"
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
  avatarUrl,
  memberSince,
  profileCache,
}: HomeClientProps) {
  const router = useRouter()

  const [crews,       setCrews]       = useState<CrewSummary[]>(initialCrews)
  const [showCreate,  setShowCreate]  = useState(false)
  const [openCardId,  setOpenCardId]  = useState<string | null>(null)
  const [leaveTarget, setLeaveTarget] = useState<CrewSummary | null>(null)
  const [leaving,     setLeaving]     = useState(false)
  const [leaveError,  setLeaveError]  = useState<string | null>(null)

  const profileCacheRef = useRef<Record<string, string>>(profileCache)
  useEffect(() => { profileCacheRef.current = profileCache }, [profileCache])

  useEffect(() => { setCrews(initialCrews) }, [initialCrews])

  useEffect(() => {
    router.refresh()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const crewIds = crews.map((c) => c.crew.id)

  // ── Realtime: live message previews + unread counts ──────────────────────
  useEffect(() => {
    if (crewIds.length === 0) return
    const supabase = createClient()
    const seenIds  = new Set<string>()

    function applyNewMessage(
      crewId: string,
      msg: { id: string; content: string; user_id: string; created_at: string; sender: string },
    ) {
      if (seenIds.has(msg.id)) return
      seenIds.add(msg.id)

      setCrews((prev) =>
        prev
          .map((cs) => {
            if (cs.crew.id !== crewId) return cs
            return {
              ...cs,
              lastMessage: { content: msg.content, sender: msg.sender, created_at: msg.created_at },
              unreadCount: msg.user_id === userId ? cs.unreadCount : cs.unreadCount + 1,
            }
          })
          .sort((a, b) =>
            (b.lastMessage?.created_at ?? '').localeCompare(a.lastMessage?.created_at ?? ''),
          ),
      )
    }

    const channels = crewIds.map((crewId) =>
      supabase
        .channel(`messages:${crewId}`)
        .on('broadcast', { event: 'new_message' }, (payload) => {
          const msg = payload.payload as MessageWithProfile
          if (!msg?.id || msg.message_type === 'system') return
          applyNewMessage(crewId, {
            id:         msg.id,
            content:    msg.content,
            user_id:    msg.user_id,
            created_at: msg.created_at,
            sender:     profileCacheRef.current[msg.user_id] ?? msg.profile?.username ?? '',
          })
        })
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `crew_id=eq.${crewId}` },
          (payload) => {
            const msg = payload.new as Message
            if (msg.message_type === 'system') return
            applyNewMessage(crewId, {
              id:         msg.id,
              content:    msg.content,
              user_id:    msg.user_id,
              created_at: msg.created_at,
              sender:     profileCacheRef.current[msg.user_id] ?? '',
            })
          },
        )
        .subscribe(),
    )

    return () => { channels.forEach((ch) => supabase.removeChannel(ch)) }
  }, [crewIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation: mark as read on tap ──────────────────────────────────────
  const handleCrewTap = useCallback(
    (crewId: string) => {
      setCrews((prev) => prev.map((cs) => cs.crew.id === crewId ? { ...cs, unreadCount: 0 } : cs))
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

  // ── Leave crew ────────────────────────────────────────────────────────────
  const handleLeaveCrew = useCallback(async () => {
    if (!leaveTarget || leaving) return
    setLeaving(true)
    setLeaveError(null)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const result = await leaveCrewAction(leaveTarget.crew.id, session?.access_token ?? '')
      if (result.error) { setLeaveError(result.error); return }
      setCrews((prev) => prev.filter((c) => c.crew.id !== leaveTarget.crew.id))
      setLeaveTarget(null)
    } catch (err) {
      setLeaveError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLeaving(false)
    }
  }, [leaveTarget, leaving])

  const handleCloseCreate = useCallback(() => setShowCreate(false), [])
  const handleCloseLeave  = useCallback(() => {
    if (!leaving) { setLeaveTarget(null); setLeaveError(null) }
  }, [leaving])

  return (
    <div className="min-h-screen bg-black flex flex-col">

      {/* ── Header ── */}
      <div
        className="border-b border-border px-4 pb-4 flex-shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 0px)' }}
      >
        <div className="flex items-center justify-between h-10">
          <h1 className="font-pixel text-[18px] text-primary">NEXUS</h1>

          <div className="flex items-center gap-5">
            <button
              aria-label="Notifications"
              className="text-primary hover:text-purple transition-colors"
            >
              <Bell size={24} />
            </button>
            <button
              onClick={() => setShowCreate(true)}
              aria-label="Create crew"
              className="text-primary hover:text-purple transition-colors"
            >
              <Plus size={24} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-6">

        {/* Profile banner */}
        <ProfileBanner
          username={username}
          avatarUrl={avatarUrl}
          memberSince={memberSince}
          crewCount={crews.length}
          onEditProfile={() => router.push('/profile')}
        />

        {/* Crew list / empty state */}
        {crews.length === 0 ? (
          <EmptyState onCreate={() => setShowCreate(true)} />
        ) : (
          <div className="flex flex-col gap-6">
            {crews.map((summary) => (
              <SwipeableCrewCard
                key={summary.crew.id}
                summary={summary}
                onTap={() => handleCrewTap(summary.crew.id)}
                onLeaveRequest={() => { setLeaveTarget(summary); setLeaveError(null) }}
                openCardId={openCardId}
                onOpen={setOpenCardId}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showCreate  && <CreateCrewSheet onClose={handleCloseCreate} />}
        {leaveTarget && (
          <LeaveConfirmSheet
            summary={leaveTarget}
            onConfirm={handleLeaveCrew}
            onClose={handleCloseLeave}
            pending={leaving}
            leaveError={leaveError}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
