'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { PanInfo } from 'framer-motion'
import Image from 'next/image'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { getElementType, getXPProgress, XP_PER_LEVEL } from '@/lib/game/xp'
import { useChatStore } from '@/store/chatStore'
import { DamageFloat } from '@/components/game/DamageFloat'
import { PixelSprite, spriteInfoFor } from '@/components/game/PixelSprite'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/config'
import { haptic } from '@/lib/sounds'
import { Send } from 'pixelarticons/react/Send'
import type { Message, MessageWithProfile, Profile } from '@/types'

const MAX_MESSAGE_LENGTH = 2000
const RATE_LIMIT_MAX     = 30
const RATE_LIMIT_WINDOW  = 60_000

type MemberProfile = Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url'>

interface ChatInputProps {
  crewId:         string
  userId:         string
  userProfile:    MemberProfile
  memberProfiles: Record<string, MemberProfile>
}

function sanitizeMessage(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').trim().slice(0, MAX_MESSAGE_LENGTH)
}

function ExpandedMemberRow({ profile, msgCount, loading }: { profile: MemberProfile; msgCount: number; loading: boolean }) {
  const spriteInfo = spriteInfoFor(profile.avatar_class)
  const initial    = profile.username[0]?.toUpperCase() ?? '?'
  const url        = profile.avatar_url as string | null

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0">
      <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center">
        {spriteInfo ? (
          <PixelSprite spriteId={spriteInfo.id} nativePx={spriteInfo.nativePx} scale={2} animate />
        ) : (
          <div className="w-10 h-10 bg-[#0f0820] border border-[#2a1545] flex items-center justify-center">
            <span className="font-pixel text-[10px] text-purple">{initial}</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-body font-bold text-[16px] text-primary truncate leading-none">{profile.username}</p>
        <p className="font-silkscreen text-[8px] text-muted leading-none mt-[5px]">
          {loading ? '...' : `${msgCount.toLocaleString()} MSG`}
        </p>
      </div>
      <div className="relative w-9 h-9 flex-shrink-0 overflow-hidden bg-border">
        {url ? (
          <Image src={url} alt={profile.username} fill sizes="36px" className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="font-pixel text-[10px] text-purple">{initial}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function ChatInput({ crewId, userId, userProfile, memberProfiles }: ChatInputProps) {
  const [text,           setText]          = useState('')
  const [sending,        setSending]        = useState(false)
  const [sendError,      setSendError]      = useState<string | null>(null)
  const [typingUsers,    setTypingUsers]    = useState<string[]>([])
  const [spawning,       setSpawning]       = useState(false)
  const [spawnError,     setSpawnError]     = useState<string | null>(null)
  const [devMode,        setDevMode]        = useState(false)
  const [isExpanded,     setIsExpanded]     = useState(false)
  const [memberMsgCounts, setMemberMsgCounts] = useState<Map<string, number>>(new Map())
  const [loadingCounts,  setLoadingCounts]  = useState(false)

  const textareaRef      = useRef<HTMLTextAreaElement>(null)
  const rateRef          = useRef({ count: 0, resetAt: Date.now() + RATE_LIMIT_WINDOW })
  const typingTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingChannelRef = useRef<RealtimeChannel | null>(null)
  const msgChannelRef    = useRef<RealtimeChannel | null>(null)

  const {
    addMessage, updateMessage, setCrewXP, receiveXP, addXP,
    activeRaid, damageFloats, addDamageFloat, dismissDamageFloat,
    crewXP, crewLevel, xpFloats, dismissXPFloat,
    onlineUserIds, setOnlineUserIds, addUserCoins,
  } = useChatStore()

  const profilesRef     = useRef(memberProfiles)
  profilesRef.current   = memberProfiles
  const userProfileRef  = useRef(userProfile)
  userProfileRef.current = userProfile
  const inRaid = !!(activeRaid && !activeRaid.defeated_at)

  const xpProgress  = getXPProgress(crewXP)
  const memberCount = Object.keys(memberProfiles).length
  const members     = Object.values(memberProfiles)

  useEffect(() => {
    setDevMode(localStorage.getItem('nexus_dev_mode') === '1')
  }, [])

  useEffect(() => {
    if (!isExpanded) return
    let cancelled = false
    setLoadingCounts(true)
    createClient()
      .rpc('get_crew_member_msg_counts', { p_crew_id: crewId })
      .then(({ data }) => {
        if (cancelled) return
        setMemberMsgCounts(new Map((data ?? []).map(r => [r.user_id, Number(r.msg_count)])))
        setLoadingCounts(false)
      })
    return () => { cancelled = true }
  }, [isExpanded, crewId]) // eslint-disable-line

  function handleTopPanEnd(_: PointerEvent, info: PanInfo) {
    if (info.offset.y < -50 || info.velocity.y < -300) setIsExpanded(true)
  }

  function handlePanelPanEnd(_: PointerEvent, info: PanInfo) {
    if (info.offset.y > 60 || info.velocity.y > 300) setIsExpanded(false)
  }

  useEffect(() => {
    // Seed own ID optimistically before channel connects
    setOnlineUserIds(new Set([userId]))

    const supabase = createClient()
    const ch = supabase.channel(`messages:${crewId}`, {
      config: { presence: { key: userId } },
    })
    const fallbackProfile = (uid: string): MemberProfile =>
      profilesRef.current[uid] ?? { id: uid, username: '???', avatar_class: null, avatar_url: null }

    ch
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState<{ username: string; typing: boolean }>()
        setOnlineUserIds(new Set(Object.keys(state)))
        const others = Object.entries(state)
          .filter(([key]) => key !== userId)
          .flatMap(([, presences]) => presences)
          .filter((p) => p.typing)
          .map((p) => p.username)
        setTypingUsers(others)
      })
      .on('presence', { event: 'join' }, ({ key }: { key: string }) => {
        setOnlineUserIds(new Set([...useChatStore.getState().onlineUserIds, key]))
      })
      .on('presence', { event: 'leave' }, ({ key }: { key: string }) => {
        const next = new Set(useChatStore.getState().onlineUserIds)
        next.delete(key)
        setOnlineUserIds(next)
      })
      .on('broadcast', { event: 'new_message' }, (payload) => {
        const msg = payload.payload as Message
        if (!msg?.id || typeof msg.content !== 'string') return
        addMessage({ ...msg, profile: fallbackProfile(msg.user_id) })
      })
      .on('broadcast', { event: 'xp_update' }, (payload) => {
        const { xp_earned, new_total_xp, sender_id } =
          payload.payload as { xp_earned: number; new_total_xp: number; sender_id: string }
        if (typeof new_total_xp !== 'number') return
        if (sender_id === userId)      setCrewXP(new_total_xp)
        else if (xp_earned > 0)        receiveXP(xp_earned, new_total_xp)
        else                           setCrewXP(new_total_xp)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({ username: userProfileRef.current.username, typing: false })
        }
      })

    msgChannelRef.current    = ch
    typingChannelRef.current = ch
    return () => {
      supabase.removeChannel(ch)
      msgChannelRef.current    = null
      typingChannelRef.current = null
    }
  }, [crewId, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  function broadcastTyping(isTyping: boolean) {
    typingChannelRef.current?.track({ username: userProfileRef.current.username, typing: isTyping })
  }

  const send = useCallback(async () => {
    const content = sanitizeMessage(text)
    if (!content || sending) return

    const now = Date.now()
    if (now >= rateRef.current.resetAt) rateRef.current = { count: 0, resetAt: now + RATE_LIMIT_WINDOW }
    rateRef.current.count++
    if (rateRef.current.count > RATE_LIMIT_MAX) { setSendError('Slow down, warrior.'); return }

    if (!localStorage.getItem('nexus_first_message')) localStorage.setItem('nexus_first_message', String(Date.now()))

    setSending(true)
    setSendError(null)
    setText('')
    broadcastTyping(false)
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    haptic(10)

    try {
      const supabase    = createClient()
      const elementType = getElementType(content, 'text')
      const { data: raw, error } = await supabase.rpc('insert_message', {
        p_crew_id: crewId, p_content: content, p_message_type: 'text',
      })
      if (error) throw error

      const newMessage: MessageWithProfile = {
        id: raw.id, crew_id: raw.crew_id, user_id: raw.user_id, content: raw.content,
        message_type: raw.message_type, element_type: raw.element_type,
        xp_awarded: raw.xp_awarded, reactions: {}, created_at: raw.created_at, profile: userProfile,
      }
      addMessage(newMessage)
      addXP(10) // optimistic: show float + advance bar immediately; server syncs authoritative total below

      msgChannelRef.current?.send({
        type: 'broadcast', event: 'new_message',
        payload: {
          id: newMessage.id, crew_id: newMessage.crew_id, user_id: newMessage.user_id,
          content: newMessage.content, message_type: newMessage.message_type,
          element_type: newMessage.element_type, xp_awarded: newMessage.xp_awarded,
          created_at: newMessage.created_at,
        },
      })

      const msgId = raw.id
      fetch(`${SUPABASE_URL}/functions/v1/award-xp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ message_id: msgId, crew_id: crewId, user_id: userId, username: userProfile.username, message_type: 'text', content }),
      })
        .then((r) => r.json())
        .then((data: { xp_earned?: number; new_total_xp?: number; coins_earned?: number; notif_count?: number; notif_results?: unknown[] }) => {
          console.log('[award-xp]', data)
          if (typeof data.xp_earned === 'number' && data.xp_earned > 0) updateMessage(msgId, { xp_awarded: data.xp_earned })
          if (typeof data.new_total_xp === 'number') {
            setCrewXP(data.new_total_xp) // sync authoritative total; float already shown optimistically
            msgChannelRef.current?.send({
              type: 'broadcast', event: 'xp_update',
              payload: { xp_earned: data.xp_earned ?? 0, new_total_xp: data.new_total_xp, sender_id: userId },
            })
          }
          if (typeof data.coins_earned === 'number' && data.coins_earned > 0) {
            addUserCoins(data.coins_earned)
          }
        })
        .catch(() => {})

      if (activeRaid && !activeRaid.defeated_at) {
        fetch(`${SUPABASE_URL}/functions/v1/attack-boss`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
          body: JSON.stringify({ crew_id: crewId, user_id: userId, message_type: 'text', element_type: elementType, content }),
        })
          .then((r) => r.json())
          .then((data) => { if (data.damage) { addDamageFloat(data.damage, elementType); haptic([10, 50, 10]) } })
          .catch(() => {})
      }
    } catch (err) {
      setText(content)
      setSendError(err instanceof Error ? err.message : 'Failed to send. Tap to retry.')
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }, [text, sending, crewId, userId, userProfile, addMessage, updateMessage, activeRaid, addDamageFloat]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSpawnBoss() {
    if (spawning || inRaid) return
    setSpawning(true); setSpawnError(null)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/test/spawn-boss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ crew_id: crewId }),
      })
      let data: { error?: string } = {}
      try { data = await res.json() } catch { setSpawnError(`Server error ${res.status}`); return }
      if (!res.ok) setSpawnError(data.error ?? `Error ${res.status}`)
    } catch (err) {
      setSpawnError(err instanceof Error ? err.message : 'Network error')
    } finally { setSpawning(false) }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value.slice(0, MAX_MESSAGE_LENGTH)
    setText(val)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    if (val.trim()) {
      broadcastTyping(true)
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      typingTimerRef.current = setTimeout(() => broadcastTyping(false), 3000)
    } else { broadcastTyping(false) }
  }

  function handleBlur() {
    broadcastTyping(false)
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
  }

  const typingLabel = typingUsers.length === 1
    ? `${typingUsers[0]} is typing...`
    : typingUsers.length === 2
      ? `${typingUsers[0]} and ${typingUsers[1]} are typing...`
      : typingUsers.length > 2 ? 'Several warriors are typing...' : null

  const totalMessages = [...memberMsgCounts.values()].reduce((s, n) => s + n, 0)

  return (
    <div
      className="bg-black border-t border-border px-4 pt-4 flex-shrink-0 relative"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 32px)' }}
    >
      {devMode && <DamageFloat floats={damageFloats} onDismiss={dismissDamageFloat} />}

      {/* ── Member avatars + XP bar — swipe up to expand ── */}
      <motion.div
        className="flex flex-col gap-2 mb-4"
        style={{ touchAction: 'pan-x' }}
        onPanEnd={handleTopPanEnd}
      >
        {/* User list */}
        <div className="flex items-center gap-3">
          {members.slice(0, 8).map((m) => {
            const url     = m.avatar_url as string | null | undefined
            const initial = m.username[0]?.toUpperCase() ?? '?'
            const online  = onlineUserIds.has(m.id)
            return (
              <div key={m.id} className="relative flex-shrink-0" title={m.username}>
                <div className="w-6 h-6 overflow-hidden bg-surface flex items-center justify-center">
                  {url ? (
                    <div className="relative w-full h-full">
                      <Image src={url} alt={m.username} fill sizes="24px" className="object-cover" />
                    </div>
                  ) : (
                    <span className="font-pixel text-[8px] text-purple">{initial}</span>
                  )}
                </div>
                {online && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#66bb6a] border-[1.5px] border-black" />
                )}
              </div>
            )
          })}
        </div>

        {/* XP indicator */}
        <div className="h-6 flex flex-col gap-2 items-center justify-center w-full">
          <div className="flex items-center gap-2 w-full font-silkscreen text-tertiary">
            <p className="flex-1 min-w-0 leading-[0] text-[0px]">
              <span className="text-[8px] leading-none text-purple">Level {crewLevel}</span>
              <span className="text-[8px] leading-none">
                {` · ${crewXP % XP_PER_LEVEL} / ${XP_PER_LEVEL}XP · ${memberCount} Member${memberCount !== 1 ? 's' : ''}`}
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
      </motion.div>

      {/* ── Status indicators + input — fade out when expanded ── */}
      <motion.div
        animate={{ opacity: isExpanded ? 0 : 1, y: isExpanded ? 16 : 0 }}
        transition={{ duration: 0.18 }}
        style={{ pointerEvents: isExpanded ? 'none' : 'auto' }}
      >
        {sendError && (
          <button className="w-full font-pixel text-[7px] text-[#ff4444] mb-2 text-left" onClick={send}>
            ↺ {sendError}
          </button>
        )}

        {devMode && inRaid && typingLabel && (
          <div className="flex items-center gap-1 mb-2">
            <span className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="inline-block w-1 h-1 rounded-full bg-purple animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </span>
            <span className="font-pixel text-[7px] text-tertiary">{typingLabel}</span>
          </div>
        )}

        {devMode && inRaid && !typingLabel && (
          <div className="flex items-center gap-1 mb-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#ff2200] animate-pulse" />
            <span className="font-pixel text-[7px] text-[#ff4444]">⚔ RAID ACTIVE — every message deals damage</span>
          </div>
        )}

        {devMode && !inRaid && (
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={handleSpawnBoss}
              disabled={spawning}
              className="font-pixel text-[7px] px-2 py-0.5 border border-[#ff4444]/40 text-[#ff4444]/70 hover:text-[#ff4444] hover:border-[#ff4444] transition-colors disabled:opacity-40"
            >
              {spawning ? 'SPAWNING...' : '⚔ SPAWN BOSS'}
            </button>
            {spawnError && <span className="font-pixel text-[7px] text-[#ff4444]/60">{spawnError}</span>}
          </div>
        )}

        <div
          className="border border-border h-12 flex items-center px-4 gap-3 overflow-hidden"
          style={{ borderColor: inRaid ? 'rgba(255,34,0,0.4)' : undefined }}
        >
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder={inRaid ? 'Attack The Void...' : 'Send a message...'}
            rows={1}
            className="flex-1 bg-transparent text-white font-body text-[14px] placeholder:text-muted resize-none focus:outline-none leading-normal py-3"
            style={{ maxHeight: 120, fontVariationSettings: '"opsz" 14' }}
          />
          <button
            onClick={send}
            disabled={!text.trim() || sending}
            className={`flex-shrink-0 flex items-center justify-center w-4 h-4 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${text.trim() ? 'text-primary' : 'text-muted'}`}
            aria-label="Send message"
          >
            <Send style={{ width: 16, height: 16 }} aria-hidden="true" />
          </button>
        </div>
      </motion.div>

      {/* ── Expanded member panel ── */}
      <AnimatePresence>
        {isExpanded && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-[38] bg-black/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsExpanded(false)}
            />

            {/* Sheet */}
            <motion.div
              className="fixed inset-x-0 bottom-0 z-[39] bg-[#0a0612] border-t border-[#2a1545]"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)', maxWidth: 480, margin: '0 auto' }}
            >
              {/* Drag-down header */}
              <motion.div
                className="px-6 pt-4 pb-4 border-b border-border flex flex-col gap-3"
                style={{ touchAction: 'pan-x', cursor: 'grab' }}
                onPanEnd={handlePanelPanEnd}
              >
                {/* Pill handle */}
                <div className="w-8 h-1 bg-border rounded-full mx-auto" />

                {/* Crew stats */}
                <div className="flex flex-col gap-1">
                  <p className="font-silkscreen text-[8px] text-muted leading-none">SQUAD</p>
                  {!loadingCounts && (
                    <p className="font-silkscreen text-[8px] text-muted leading-none">
                      {memberCount} {memberCount === 1 ? 'MEMBER' : 'MEMBERS'}
                      {' · '}
                      {totalMessages.toLocaleString()} {totalMessages === 1 ? 'MESSAGE' : 'MESSAGES'}
                    </p>
                  )}
                </div>

                {/* XP bar */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 w-full font-silkscreen">
                    <p className="flex-1 min-w-0 leading-[0] text-[0px]">
                      <span className="text-[8px] leading-none text-purple">Level {crewLevel}</span>
                      <span className="text-[8px] leading-none text-tertiary">
                        {` · ${crewXP % XP_PER_LEVEL} / ${XP_PER_LEVEL}XP`}
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
              </motion.div>

              {/* Member list */}
              <div className="overflow-y-auto px-4 nexus-scroll" style={{ maxHeight: '55vh' }}>
                {members.map((m) => (
                  <ExpandedMemberRow
                    key={m.id}
                    profile={m}
                    msgCount={memberMsgCounts.get(m.id) ?? 0}
                    loading={loadingCounts}
                  />
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
