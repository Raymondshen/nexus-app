'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSlideBack } from '@/components/ui/SlidePage'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { useChatStore } from '@/store/chatStore'
import { getXPProgress, XP_PER_LEVEL } from '@/lib/game/xp'
import { createClient } from '@/lib/supabase/client'
import type { Crew, ActiveRaid, AvatarClass } from '@/types'
import { formatDistanceToNow } from 'date-fns'
import { PixelSprite, spriteInfoFor } from '@/components/game/PixelSprite'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { ChevronRight } from 'pixelarticons/react/ChevronRight'
import { Bell } from 'pixelarticons/react/Bell'
import { BellOff } from 'pixelarticons/react/BellOff'
import { UserPlus } from 'pixelarticons/react/UserPlus'
import { Notebook } from 'pixelarticons/react/Notebook'

const CLASS_LABELS: Record<string, string> = {
  berserker: 'Berserker',
  sage:      'Sage',
  ghost:     'Ghost',
  hype_man:  'Hype Man',
  the_voice: 'The Voice',
  meme_lord: 'Meme Lord',
  mage:      'Mage',
  warrior:   'Warrior',
  rogue:     'Rogue',
  healer:    'Healer',
  archer:    'Archer',
}

// ─── GroupProfileSheet ────────────────────────────────────────────────────────

type MemberInfo = {
  userId:      string
  username:    string
  avatarUrl:   string | null
  avatarClass: AvatarClass | null
  msgCount:    number
}

function MemberRow({ member, isCurrentUser }: { member: MemberInfo; isCurrentUser: boolean }) {
  const spriteInfo = spriteInfoFor(member.avatarClass)
  const initial    = member.username[0]?.toUpperCase() ?? '?'
  const classLabel = member.avatarClass ? (CLASS_LABELS[member.avatarClass] ?? member.avatarClass) : 'Unknown'

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0">
      {/* Animated sprite or placeholder */}
      <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center">
        {spriteInfo ? (
          <PixelSprite spriteId={spriteInfo.id} nativePx={spriteInfo.nativePx} scale={2} animate />
        ) : (
          <div className="w-10 h-10 bg-[#0f0820] border border-[#2a1545] flex items-center justify-center">
            <span className="font-pixel text-[10px] text-purple">{initial}</span>
          </div>
        )}
      </div>

      {/* Name + class + message count */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-body font-bold text-[16px] text-primary truncate leading-none">{member.username}</p>
          {isCurrentUser && (
            <span className="font-silkscreen text-[6px] text-purple border border-purple px-1 py-[2px] flex-shrink-0 leading-none">YOU</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-[5px]">
          <span className="font-silkscreen text-[8px] text-purple leading-none">{classLabel.toUpperCase()}</span>
          <span className="font-silkscreen text-[8px] text-muted leading-none">·</span>
          <span className="font-silkscreen text-[8px] text-muted leading-none">{member.msgCount.toLocaleString()} MSG</span>
        </div>
      </div>

      {/* Profile avatar */}
      <div className="w-9 h-9 flex-shrink-0 relative overflow-hidden bg-border">
        {member.avatarUrl ? (
          <Image src={member.avatarUrl} alt={member.username} fill sizes="36px" className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#111]">
            <span className="font-pixel text-[10px] text-primary">{initial}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function GroupProfileSheet({
  crew,
  crewId,
  currentUserId,
  onClose,
}: {
  crew:          Crew
  crewId:        string
  currentUserId: string
  onClose:       () => void
}) {
  const [members, setMembers] = useState<MemberInfo[]>([])
  const [loading, setLoading] = useState(true)
  const { crewXP, crewLevel, xpFloats, dismissXPFloat } = useChatStore()
  const xpProgress = getXPProgress(crewXP)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const { data: memberRows } = await supabase
        .from('crew_members')
        .select('user_id, class, profiles(id, username, avatar_url)')
        .eq('crew_id', crewId)

      if (cancelled || !memberRows?.length) { setLoading(false); return }

      type RawRow = { user_id: string; class: string | null; profiles: { username: string; avatar_url: string | null } | null }
      const rows = memberRows as unknown as RawRow[]

      const { data: countData } = await supabase.rpc('get_crew_member_msg_counts', { p_crew_id: crewId })
      const msgCountMap = new Map((countData ?? []).map(r => [r.user_id, Number(r.msg_count)]))

      if (cancelled) return

      const infos: MemberInfo[] = rows.map((r) => ({
        userId:      r.user_id,
        username:    r.profiles?.username ?? 'Unknown',
        avatarUrl:   r.profiles?.avatar_url ?? null,
        avatarClass: r.class as AvatarClass | null,
        msgCount:    msgCountMap.get(r.user_id) ?? 0,
      }))

      infos.sort((a, b) => {
        if (a.userId === currentUserId) return -1
        if (b.userId === currentUserId) return 1
        return b.msgCount - a.msgCount
      })

      setMembers(infos)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [crewId, currentUserId])

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
        className="relative w-full max-w-[480px] bg-[#0a0612] border-t border-[#2a1545]"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header + XP bar — unified container */}
        <div className="px-6 pt-6 pb-4 border-b border-border flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="font-silkscreen text-[8px] text-muted leading-none">SQUAD</p>
            <h2 className="font-pixel text-[14px] text-primary leading-none">{crew.name.toUpperCase()}</h2>
            {!loading && (() => {
              const totalMessages = members.reduce((sum, m) => sum + m.msgCount, 0)
              return (
                <p className="font-silkscreen text-[8px] text-muted leading-none">
                  {members.length} {members.length === 1 ? 'MEMBER' : 'MEMBERS'}
                  {' · '}
                  {totalMessages.toLocaleString()} {totalMessages === 1 ? 'MESSAGE' : 'MESSAGES'}
                </p>
              )
            })()}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 w-full font-silkscreen">
              <p className="flex-1 min-w-0 leading-[0] text-[0px]">
                <span className="text-[8px] leading-none text-purple">Level {crewLevel}</span>
                <span className="text-[8px] leading-none text-tertiary">
                  {` · ${crewXP % XP_PER_LEVEL} / ${XP_PER_LEVEL}XP`}
                </span>
                <span className="relative inline-block">
                  <AnimatePresence>
                    {xpFloats.map((f) => (
                      <motion.span
                        key={f.id}
                        initial={{ opacity: 0, y: 0 }}
                        animate={{ opacity: [0, 1, 1, 0], y: [0, -12, -26, -42] }}
                        transition={{ duration: 1.4, ease: 'easeOut', times: [0, 0.15, 0.65, 1] }}
                        onAnimationComplete={() => dismissXPFloat(f.id)}
                        className="pointer-events-none absolute bottom-0 left-0 font-pixel text-[8px] text-[#ffd700] whitespace-nowrap z-10"
                        style={{ textShadow: '0 0 8px rgba(255,215,0,0.8)' }}
                      >
                        +{f.amount} XP
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </span>
              </p>
              <p className="text-[8px] leading-none whitespace-nowrap text-tertiary">Next Boss</p>
            </div>
            <div className="bg-surface h-1 overflow-hidden w-full relative">
              <motion.div
                className="absolute left-0 top-0 h-full bg-purple"
                animate={{ width: `${xpProgress}%` }}
                transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              />
            </div>
          </div>
        </div>

        {/* Member list */}
        <div className="px-4 overflow-y-auto" style={{ maxHeight: '55vh' }}>
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3 border-b border-border">
                <div className="w-12 h-12 flex-shrink-0 bg-border animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-border animate-pulse" />
                  <div className="h-2 w-20 bg-border animate-pulse" />
                </div>
                <div className="w-9 h-9 flex-shrink-0 bg-border animate-pulse" />
              </div>
            ))
          ) : (
            members.map(m => (
              <MemberRow key={m.userId} member={m} isCurrentUser={m.userId === currentUserId} />
            ))
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

// ─── NotifSheet ───────────────────────────────────────────────────────────────

type NotifPrefs = { messages: boolean; raids: boolean; victory: boolean }

function NotifToggleRow({
  label,
  description,
  enabled,
  onToggle,
}: {
  label:       string
  description: string
  enabled:     boolean
  onToggle:    () => void
}) {
  return (
    <div className="flex items-center gap-2 px-4">
      <div className="flex-1 min-w-0 flex flex-col tracking-[0.2px]">
        <p className="font-body font-medium text-[14px] text-secondary leading-normal">{label}</p>
        <p className="font-body text-[12px] text-tertiary leading-normal">{description}</p>
      </div>
      <button
        onClick={onToggle}
        aria-label={`${enabled ? 'Disable' : 'Enable'} ${label} notifications`}
        className="relative w-[40px] h-[24px] flex-shrink-0 p-1 transition-colors"
        style={{ background: enabled ? '#a855f7' : '#27272a' }}
      >
        <motion.span
          className="absolute top-1 w-4 h-4 bg-white pointer-events-none"
          animate={{ left: enabled ? 20 : 4 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      </button>
    </div>
  )
}

function NotifSheet({
  crew,
  prefs,
  onToggle,
  onClose,
}: {
  crew:     Crew
  prefs:    NotifPrefs
  onToggle: (type: keyof NotifPrefs) => void
  onClose:  () => void
}) {
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
        className="relative w-full max-w-[480px] bg-surface border-t border-border flex flex-col gap-6 p-4 overflow-hidden"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-col gap-2">
          <p className="font-pixel text-[8px] text-tertiary leading-none">{crew.name.toUpperCase()}</p>
          <div className="flex flex-col gap-1">
            <h2 className="font-body font-bold text-[18px] text-primary leading-none">Notifications</h2>
            <p className="font-body text-[12px] text-secondary leading-normal">Control what pulls you back into the chat.</p>
          </div>
        </div>

        {/* Settings card — purple border */}
        <div className="flex flex-col gap-4 py-4 border border-[rgba(168,85,247,0.5)] bg-surface overflow-hidden">
          <NotifToggleRow
            label="Messages"
            description="Notify me with new messages from this chat"
            enabled={prefs.messages}
            onToggle={() => onToggle('messages')}
          />
          <div className="border-t border-border w-full" />
          <NotifToggleRow
            label="Raid Alerts"
            description="Notify me when boss spawns and expires"
            enabled={prefs.raids}
            onToggle={() => onToggle('raids')}
          />
          <div className="border-t border-border w-full" />
          <NotifToggleRow
            label="Victory"
            description="Notify me when boss defeated & artifact drops"
            enabled={prefs.victory}
            onToggle={() => onToggle('victory')}
          />
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="w-full font-silkscreen text-[16px] text-muted leading-none py-1 transition-colors active:text-tertiary"
        >
          Close
        </button>
      </motion.div>
    </motion.div>
  )
}

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
  const goBack = useSlideBack()
  const { setCrewXP, setActiveRaid, activeRaid } = useChatStore()
  const [showProfile,  setShowProfile]  = useState(false)
  const [showShare,    setShowShare]    = useState(false)
  const [showNotif,    setShowNotif]    = useState(false)
  const [notifPrefs,   setNotifPrefs]   = useState<NotifPrefs>({ messages: true, raids: true, victory: true })
  const [devMode,      setDevMode]      = useState(false)

  useEffect(() => {
    setDevMode(localStorage.getItem('nexus_dev_mode') === '1')
  }, [])

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

  // Load per-crew notification preferences on mount
  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('crew_notification_preferences')
        .select('notif_messages, notif_raids, notif_victory')
        .eq('user_id', currentUserId)
        .eq('crew_id', crewId)
        .maybeSingle()
      if (data) {
        setNotifPrefs({
          messages: data.notif_messages as boolean,
          raids:    data.notif_raids    as boolean,
          victory:  data.notif_victory  as boolean,
        })
      }
    }
    load()
  }, [currentUserId, crewId])

  const handleToggleNotif = useCallback(async (type: keyof NotifPrefs) => {
    const next = { ...notifPrefs, [type]: !notifPrefs[type] }
    setNotifPrefs(next)  // optimistic
    const supabase = createClient()
    await supabase
      .from('crew_notification_preferences')
      .upsert(
        {
          user_id:        currentUserId,
          crew_id:        crewId,
          notif_messages: next.messages,
          notif_raids:    next.raids,
          notif_victory:  next.victory,
          updated_at:     new Date().toISOString(),
        },
        { onConflict: 'user_id,crew_id' },
      )
  }, [notifPrefs, currentUserId, crewId])

  const handleCloseProfile = useCallback(() => setShowProfile(false), [])
  const handleCloseShare   = useCallback(() => setShowShare(false), [])
  const handleCloseNotif   = useCallback(() => setShowNotif(false), [])

  const allMuted = !notifPrefs.messages && !notifPrefs.raids && !notifPrefs.victory

  return (
    <>
      <div
        className="bg-black border-b border-border px-4 pb-2 relative flex-shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}
      >
        <div className="flex items-center justify-between h-10">

          {/* Left: back button + [underlined crew name + dropdown chevron] */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button
              onClick={goBack}
              aria-label="Back"
              className="flex-shrink-0 flex items-center justify-center"
              style={{ width: 24, height: 40 }}
            >
              <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-tertiary)' }} aria-hidden="true" />
            </button>

            <button
              onClick={() => setShowProfile(true)}
              aria-label="View squad profile"
              className="flex items-center gap-1 min-w-0 text-left active:opacity-70 transition-opacity"
            >
              <h1 className="font-pixel text-[18px] text-primary truncate leading-none" style={{ textDecoration: 'underline' }}>
                {crew.name.toUpperCase()}
              </h1>
              <ChevronRight
                className="flex-shrink-0"
                style={{ width: 24, height: 24, color: 'var(--color-primary)', display: 'inline-block', transform: 'rotate(90deg)' }}
                aria-hidden="true"
              />
            </button>
          </div>

          {/* Right: bell + user-plus + vault */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <button
              onClick={() => setShowNotif(true)}
              aria-label={allMuted ? 'Notifications muted' : 'Notification settings'}
              className="flex items-center justify-center transition-colors"
              style={{ width: 24, height: 40, color: allMuted ? '#71717a' : 'var(--color-primary)' }}
            >
              {allMuted
                ? <BellOff style={{ width: 24, height: 24 }} aria-hidden="true" />
                : <Bell style={{ width: 24, height: 24 }} aria-hidden="true" />
              }
            </button>
            <button
              onClick={() => setShowShare(true)}
              aria-label="Invite members"
              className="flex items-center justify-center text-primary hover:text-purple transition-colors"
              style={{ width: 24, height: 40 }}
            >
              <UserPlus style={{ width: 24, height: 24 }} aria-hidden="true" />
            </button>
            <Link
              href={`/vault/${crewId}`}
              aria-label="View vault"
              className="flex items-center justify-center text-primary hover:text-purple transition-colors"
              style={{ width: 24, height: 40 }}
            >
              <Notebook style={{ width: 24, height: 24 }} aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* Boss countdown if raid is active — dev mode only */}
        {devMode && activeRaid && !activeRaid.defeated_at && (
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
        {showProfile && (
          <GroupProfileSheet
            crew={crew}
            crewId={crewId}
            currentUserId={currentUserId}
            onClose={handleCloseProfile}
          />
        )}
        {showShare && <ShareModal crew={crew} onClose={handleCloseShare} />}
        {showNotif && (
          <NotifSheet
            crew={crew}
            prefs={notifPrefs}
            onToggle={handleToggleNotif}
            onClose={handleCloseNotif}
          />
        )}
      </AnimatePresence>
    </>
  )
}
