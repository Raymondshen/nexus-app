'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import type { PanInfo } from 'framer-motion'
import Image from 'next/image'
import { isSupabaseStorage, resolveAvatarUrl } from '@/components/ui/Avatar'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { getElementType, getXPProgress, XP_PER_LEVEL } from '@/lib/game/xp'
import { useChatStore } from '@/store/chatStore'
import { DamageFloat } from '@/components/game/DamageFloat'
import { PixelSprite, spriteInfoFor } from '@/components/game/PixelSprite'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/config'
import { haptic } from '@/lib/sounds'
import { Send } from 'pixelarticons/react/Send'
import { ChevronRight } from 'pixelarticons/react/ChevronRight'
import { Crown } from 'pixelarticons/react/Crown'
import { Copy } from 'pixelarticons/react/Copy'
import { Check } from 'pixelarticons/react/Check'
import { UserMinus } from 'pixelarticons/react/UserMinus'
import { Bell } from 'pixelarticons/react/Bell'
import { kickMemberAction, renameCrewAction } from '@/app/(app)/chat/actions'
import { CrewImageUploadModal } from '@/components/chat/CrewImageUploadModal'
import { MagicEdit } from 'pixelarticons/react/MagicEdit'
import { NotifSheet, type NotifPrefs } from '@/components/chat/NotifSheet'
import type { Message, MessageWithProfile, Profile, ActiveRaid } from '@/types'

const MAX_MESSAGE_LENGTH = 2000
const RATE_LIMIT_MAX     = 30
const RATE_LIMIT_WINDOW  = 60_000

const CREW_AVATAR_COLORS = ['#bf5fff', '#00e5ff', '#ffd700', '#ff4444', '#66bb6a', '#ff9800']

const CLASS_LABELS: Record<string, string> = {
  berserker: 'Berserker', sage: 'Sage', ghost: 'Ghost', hype_man: 'Hype Man',
  the_voice: 'The Voice', meme_lord: 'Meme Lord', mage: 'Mage', warrior: 'Warrior',
  rogue: 'Rogue', healer: 'Healer', archer: 'Archer',
}

type MemberProfile = Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url'>

interface ChatInputProps {
  crewId:         string
  userId:         string
  userProfile:    MemberProfile
  memberProfiles: Record<string, MemberProfile>
  crewName:       string
  inviteCode?:    string
  creatorId?:     string
  crewImageUrl?:  string | null
  initialXP?:     number
  initialRaid?:   ActiveRaid | null
  currentUserId?: string
}

function sanitizeMessage(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').trim().slice(0, MAX_MESSAGE_LENGTH)
}

function MemberListRow({
  profile, msgCount, loading, isOnline, isCreator, onTap, onRemove,
}: {
  profile: MemberProfile; msgCount: number; loading: boolean; isOnline: boolean; isCreator?: boolean; onTap?: () => void; onRemove?: () => void
}) {
  const spriteInfo = spriteInfoFor(profile.avatar_class)
  const url        = profile.avatar_url as string | null
  const initial    = profile.username[0]?.toUpperCase() ?? '?'
  const classLabel = profile.avatar_class ? (CLASS_LABELS[profile.avatar_class] ?? profile.avatar_class) : 'Unknown'

  return (
    <div
      className="flex items-center gap-3 active:bg-surface/50 transition-colors"
      onClick={onTap}
      style={onTap ? { cursor: 'pointer' } : undefined}
    >
      {/* Profile photo with online dot */}
      <div className="relative flex-shrink-0">
        <div className="w-8 h-8 overflow-hidden bg-surface flex items-center justify-center">
          {url ? (
            <div className="relative w-full h-full">
              <Image src={resolveAvatarUrl(url, 32)} alt={profile.username} fill sizes="32px" className="object-cover" unoptimized={isSupabaseStorage(url)} />
            </div>
          ) : (
            <span className="font-pixel text-[8px] text-purple">{initial}</span>
          )}
        </div>
        {isOnline && (
          <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#66bb6a] border-[1.5px] border-black" />
        )}
      </div>

      {/* Animated sprite — no background, bumped scale with overflow clip */}
      <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center overflow-hidden">
        {spriteInfo ? (
          <PixelSprite spriteId={spriteInfo.id} nativePx={spriteInfo.nativePx} scale={1.5} animate />
        ) : (
          <span className="font-pixel text-[8px] text-purple">{initial}</span>
        )}
      </div>

      {/* Name + class · msg count */}
      <div className="flex flex-col gap-1 justify-center min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="font-body font-bold text-[16px] text-white truncate leading-none">{profile.username}</p>
          {isCreator && (
            <Crown style={{ width: 12, height: 12, color: '#f59e0b' }} aria-hidden="true" />
          )}
        </div>
        <p className="font-silkscreen text-[8px] text-secondary leading-none">
          {loading ? '...' : `${classLabel} · ${msgCount.toLocaleString()} msg.`}
        </p>
      </div>

      {/* Remove button — creator only */}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="flex-shrink-0 flex items-center justify-center w-8 h-8 text-[#ef4444] active:opacity-70 transition-opacity"
          aria-label={`Remove ${profile.username}`}
        >
          <UserMinus style={{ width: 16, height: 16 }} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

export function ChatInput({ crewId, userId, userProfile, memberProfiles, crewName, inviteCode, creatorId, crewImageUrl: initialCrewImageUrl, initialXP, initialRaid }: ChatInputProps) {
  const router = useRouter()
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
  const [copied,         setCopied]         = useState(false)
  const [removeTarget,   setRemoveTarget]   = useState<MemberProfile | null>(null)
  const [removing,       setRemoving]       = useState(false)
  const [removeError,    setRemoveError]    = useState<string | null>(null)
  const [kickedIds,      setKickedIds]      = useState<Set<string>>(new Set())
  const [crewImageUrl,   setCrewImageUrl]   = useState<string | null>(initialCrewImageUrl ?? null)
  const [crewImageFile,  setCrewImageFile]  = useState<File | null>(null)
  const [isEditingName,  setIsEditingName]  = useState(false)
  const [editNameValue,  setEditNameValue]  = useState('')
  const [showNotif,      setShowNotif]      = useState(false)
  const [notifPrefs,     setNotifPrefs]     = useState<NotifPrefs>({ messages: true, raids: true, victory: true })

  const textareaRef       = useRef<HTMLTextAreaElement>(null)
  const crewImageInputRef = useRef<HTMLInputElement>(null)
  const memberListRef     = useRef<HTMLDivElement>(null)
  const editNameInputRef  = useRef<HTMLInputElement>(null)
  const rateRef           = useRef({ count: 0, resetAt: Date.now() + RATE_LIMIT_WINDOW })
  const pullToCloseRef    = useRef({ startY: 0, atTop: false })
  const typingTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingChannelRef = useRef<RealtimeChannel | null>(null)
  const msgChannelRef    = useRef<RealtimeChannel | null>(null)

  const {
    addMessage, updateMessage, setCrewXP, receiveXP, addXP,
    activeRaid, setActiveRaid, damageFloats, addDamageFloat, dismissDamageFloat,
    crewXP, crewLevel, xpFloats, dismissXPFloat,
    onlineUserIds, setOnlineUserIds, addUserCoins,
    crewName: storeCrewName, setCrewName,
  } = useChatStore()

  const liveCrewName = storeCrewName || crewName

  const profilesRef     = useRef(memberProfiles)
  profilesRef.current   = memberProfiles
  const userProfileRef  = useRef(userProfile)
  userProfileRef.current = userProfile
  const inRaid = !!(activeRaid && !activeRaid.defeated_at)

  const xpProgress  = getXPProgress(crewXP)
  const members     = Object.values(memberProfiles).filter(m => !kickedIds.has(m.id))
  const memberCount = members.length

  useEffect(() => {
    setDevMode(localStorage.getItem('nexus_dev_mode') === '1')
  }, [])

  // Seed store with server-fetched values (previously handled by ChatHeader)
  useEffect(() => {
    if (initialXP   !== undefined) setCrewXP(initialXP)
    if (initialRaid !== undefined) setActiveRaid(initialRaid ?? null)
    setCrewName(crewName)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update last_seen every 60s for accurate server-side unread cursors
  useEffect(() => {
    const supabase = createClient()
    const update = async () => {
      try {
        await supabase
          .from('crew_members')
          .update({ last_seen: new Date().toISOString() })
          .eq('crew_id', crewId)
          .eq('user_id', userId)
      } catch {
        // Presence is best-effort
      }
    }
    update()
    const interval = setInterval(update, 60_000)
    return () => clearInterval(interval)
  }, [crewId, userId]) // eslint-disable-line

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

  // Pull-to-close: when the member list is at scroll-top and user drags down, dismiss the sheet
  useEffect(() => {
    if (!isExpanded) return
    const el = memberListRef.current
    if (!el) return

    function onTouchStart(e: TouchEvent) {
      pullToCloseRef.current = { startY: e.touches[0].clientY, atTop: el!.scrollTop === 0 }
    }
    function onTouchMove(e: TouchEvent) {
      if (!pullToCloseRef.current.atTop) return
      if (e.touches[0].clientY - pullToCloseRef.current.startY > 0) e.preventDefault()
    }
    function onTouchEnd(e: TouchEvent) {
      if (!pullToCloseRef.current.atTop) return
      if (e.changedTouches[0].clientY - pullToCloseRef.current.startY > 60) setIsExpanded(false)
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove',  onTouchMove,  { passive: false })
    el.addEventListener('touchend',   onTouchEnd,   { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
      el.removeEventListener('touchend',   onTouchEnd)
    }
  }, [isExpanded])

  useEffect(() => {
    if (isEditingName) editNameInputRef.current?.focus()
  }, [isEditingName])

  function startEditingName() {
    setEditNameValue(liveCrewName)
    setIsEditingName(true)
  }

  async function confirmRename() {
    const trimmed = editNameValue.trim()
    setIsEditingName(false)
    if (!trimmed || trimmed.length < 2 || trimmed === liveCrewName) return
    const prev = liveCrewName
    setCrewName(trimmed)
    const result = await renameCrewAction(crewId, trimmed)
    if (result?.error) setCrewName(prev)
  }

  function cancelRename() {
    setIsEditingName(false)
    setEditNameValue(liveCrewName)
  }

  useEffect(() => {
    let cancelled = false
    createClient()
      .from('crew_notification_preferences')
      .select('notif_messages, notif_raids, notif_victory')
      .eq('user_id', userId)
      .eq('crew_id', crewId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        setNotifPrefs({
          messages: data.notif_messages as boolean,
          raids:    data.notif_raids    as boolean,
          victory:  data.notif_victory  as boolean,
        })
      })
    return () => { cancelled = true }
  }, [userId, crewId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleNotif = useCallback(async (type: keyof NotifPrefs) => {
    const next = { ...notifPrefs, [type]: !notifPrefs[type] }
    setNotifPrefs(next)
    await createClient()
      .from('crew_notification_preferences')
      .upsert(
        {
          user_id:        userId,
          crew_id:        crewId,
          notif_messages: next.messages,
          notif_raids:    next.raids,
          notif_victory:  next.victory,
          updated_at:     new Date().toISOString(),
        },
        { onConflict: 'user_id,crew_id' },
      )
  }, [notifPrefs, userId, crewId]) // eslint-disable-line react-hooks/exhaustive-deps

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
        const ids = new Set(Object.keys(state))
        ids.add(userId) // always include self — track() confirmation may lag behind sync
        setOnlineUserIds(ids)
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

    // Re-track presence when user brings the app back to foreground (handles iOS PWA
    // backgrounding where the WebSocket may reconnect without firing SUBSCRIBED again)
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        ch.track({ username: userProfileRef.current.username, typing: false }).catch(() => {})
        // Also ensure self is always in the online set while visible
        setOnlineUserIds(new Set([...useChatStore.getState().onlineUserIds, userId]))
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    msgChannelRef.current    = ch
    typingChannelRef.current = ch
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
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

  function handleCopyCode() {
    if (!inviteCode || copied) return
    navigator.clipboard.writeText(`Come join my squad on Nexus app ${inviteCode}`).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1000)
  }

  async function handleKick() {
    if (!removeTarget || removing) return
    setRemoving(true)
    setRemoveError(null)
    const result = await kickMemberAction(crewId, removeTarget.id)
    setRemoving(false)
    if (result.error) { setRemoveError(result.error); return }
    setKickedIds(prev => new Set([...prev, removeTarget.id]))
    setRemoveTarget(null)
  }

  const typingLabel = typingUsers.length === 1
    ? `${typingUsers[0]} is typing...`
    : typingUsers.length === 2
      ? `${typingUsers[0]} and ${typingUsers[1]} are typing...`
      : typingUsers.length > 2 ? 'Several warriors are typing...' : null

  const totalMessages = [...memberMsgCounts.values()].reduce((s, n) => s + n, 0)

  return (
    <div
      className="bg-black border-t border-border flex flex-col flex-shrink-0 relative z-[40]"
      style={{
        paddingTop:    'var(--space-5)',
        paddingLeft:   'var(--space-5)',
        paddingRight:  'var(--space-5)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 32px)',
        gap:           'var(--space-5)',
      }}
    >
      {devMode && <DamageFloat floats={damageFloats} onDismiss={dismissDamageFloat} />}

      {/* ── Member avatars + XP bar — tap or swipe up to expand ── */}
      <motion.div
        className="flex flex-col relative cursor-pointer"
        style={{ touchAction: 'pan-x', gap: 'var(--space-3)' }}
        onPanEnd={handleTopPanEnd}
        onClick={() => setIsExpanded(true)}
      >
        {/* Crew name + member count */}
        <div className="flex items-center" style={{ gap: 'var(--space-2)' }}>
          <p className="font-silkscreen text-[length:var(--text-xs)] text-purple leading-none whitespace-nowrap">{liveCrewName.toUpperCase()}</p>
          <p className="font-silkscreen text-[length:var(--text-mini)] text-tertiary leading-none">· {memberCount} member{memberCount !== 1 ? 's' : ''}</p>
        </div>

        {/* Chevron — absolute top-right of content section */}
        <button
          onClick={(e) => { e.stopPropagation(); setIsExpanded(true) }}
          className="absolute right-0 top-0 flex items-center justify-center flex-shrink-0"
          style={{ width: 'var(--space-7)', height: 'var(--space-7)' }}
          aria-label="Show members"
        >
          <ChevronRight
            style={{ width: 'var(--space-7)', height: 'var(--space-7)', color: 'var(--color-tertiary)', transform: 'rotate(-90deg)' }}
            aria-hidden="true"
          />
        </button>

        {/* User list */}
        <div className="flex items-center w-full">
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
                        <Image src={resolveAvatarUrl(url, 24)} alt={m.username} fill sizes="24px" className="object-cover" unoptimized={isSupabaseStorage(url)} />
                      </div>
                    ) : (
                      <span className="font-pixel text-[length:var(--text-mini)] text-purple">{initial}</span>
                    )}
                  </div>
                  {online && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#66bb6a] border-[1.5px] border-black" />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* XP indicator */}
        <div
          className="flex flex-col items-center justify-center w-full"
          style={{ height: 'var(--space-7)', gap: 'var(--space-3)' }}
        >
          <div className="flex items-center w-full font-silkscreen text-tertiary" style={{ gap: 'var(--space-2)' }}>
            <p className="flex-1 min-w-0 leading-[0] text-[0px]">
              <span className="text-[length:var(--text-mini)] leading-none text-secondary">Level {crewLevel}</span>
              <span className="text-[length:var(--text-mini)] leading-none">
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
                      className="pointer-events-none absolute bottom-0 left-0 font-pixel text-[length:var(--text-mini)] text-[#ffd700] whitespace-nowrap z-10"
                      style={{ textShadow: '0 0 8px rgba(255,215,0,0.8)' }}
                    >
                      +{f.amount} XP
                    </motion.span>
                  ))}
                </AnimatePresence>
              </span>
            </p>
            <p className="text-[length:var(--text-mini)] leading-none whitespace-nowrap text-tertiary">Next Boss</p>
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
          className="border border-border h-12 flex items-center justify-between overflow-hidden"
          style={{ borderColor: inRaid ? 'rgba(255,34,0,0.4)' : undefined, paddingLeft: 'var(--space-5)', paddingRight: 'var(--space-5)', paddingTop: 12, paddingBottom: 12 }}
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

      {/* ── Kick confirmation sheet ── */}
      <AnimatePresence>
        {removeTarget && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { if (!removing) setRemoveTarget(null) }}
          >
            <div className="absolute inset-0 bg-black/60" />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="relative w-full max-w-[480px] bg-surface border-t border-border flex flex-col gap-6 p-4"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex flex-col gap-2">
                <p className="font-pixel text-[8px] text-tertiary leading-none">REMOVE FROM SQUAD</p>
                <div className="flex flex-col gap-1">
                  <h2
                    className="font-body font-bold text-[18px] text-primary leading-none"
                    style={{ fontVariationSettings: '"opsz" 14' }}
                  >
                    {removeTarget.username}
                  </h2>
                  <p className="font-body text-[12px] text-secondary leading-normal">
                    Removing this member will redistribute their XP and any gains within the squad equally to all remaining members.
                  </p>
                </div>
              </div>

              {removeError && (
                <p className="font-silkscreen text-[8px] text-[#ef4444] leading-none">{removeError}</p>
              )}

              {/* Buttons */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleKick}
                  disabled={removing}
                  className="w-full h-12 flex items-center justify-center bg-[#ef4444] disabled:opacity-50 transition-opacity active:opacity-70"
                >
                  <span className="font-pixel text-[8px] text-primary leading-none">
                    {removing ? '...' : 'REMOVE MEMBER'}
                  </span>
                </button>
                <button
                  onClick={() => { setRemoveTarget(null); setRemoveError(null) }}
                  disabled={removing}
                  className="w-full h-12 flex items-center justify-center transition-opacity active:opacity-70"
                >
                  <span className="font-pixel text-[8px] text-tertiary leading-none">CANCEL</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

            {/* Sheet — absolute so it slides up from the ChatInput container */}
            <motion.div
              className="absolute bottom-0 left-0 right-0 z-[50] bg-black border-t border-border flex flex-col"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              style={{ maxHeight: '85vh' }}
              onPanEnd={handlePanelPanEnd}
            >
              {/* ── Fixed header: crew image, title, subtext, avatars, XP bar, invite code ── */}
              <div className="flex flex-col gap-4 px-4 pt-[var(--space-7)] flex-shrink-0">
                {/* Title + stats + chevron AND avatar row + XP bar — 56px gap between them */}
                <div className="flex flex-col gap-14">

                  {/* Crew image + name row + collapse button */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {/* Crew image — tappable for creator */}
                      <input
                        ref={crewImageInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null
                          if (f) setCrewImageFile(f)
                          e.target.value = ''
                        }}
                      />
                      <button
                        onClick={userId === creatorId ? () => crewImageInputRef.current?.click() : undefined}
                        className="relative flex-shrink-0 w-8 h-8 overflow-hidden"
                        style={userId !== creatorId ? { cursor: 'default' } : undefined}
                        aria-label={userId === creatorId ? 'Change crew photo' : undefined}
                      >
                        {crewImageUrl ? (
                          <div className="relative w-full h-full">
                            <Image
                              src={crewImageUrl}
                              alt={liveCrewName}
                              fill
                              sizes="32px"
                              className="object-cover"
                              unoptimized={isSupabaseStorage(crewImageUrl)}
                            />
                          </div>
                        ) : (
                          <div className="w-full h-full bg-purple" />
                        )}
                        {userId === creatorId && (
                          <div className="absolute inset-0 flex items-end justify-end p-[2px] pointer-events-none">
                            <div className="bg-black/60 rounded-sm p-[1px]">
                              <MagicEdit style={{ width: 8, height: 8, color: 'var(--color-tertiary)' }} aria-hidden="true" />
                            </div>
                          </div>
                        )}
                      </button>

                      <div className="flex flex-col min-w-0 flex-1">
                        {isEditingName ? (
                          <input
                            ref={editNameInputRef}
                            value={editNameValue}
                            onChange={(e) => setEditNameValue(e.target.value.slice(0, 30))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') confirmRename()
                              if (e.key === 'Escape') cancelRename()
                            }}
                            onBlur={confirmRename}
                            maxLength={30}
                            className="font-silkscreen text-[length:var(--text-md)] text-purple bg-transparent border-b border-purple focus:outline-none leading-none w-full py-1 uppercase"
                            aria-label="Edit squad name"
                          />
                        ) : (
                          <p className="font-silkscreen text-[length:var(--text-md)] text-purple leading-none truncate">
                            {liveCrewName.toUpperCase()}
                          </p>
                        )}
                        <p className="font-silkscreen text-[8px] text-tertiary leading-none">
                          {memberCount} {memberCount === 1 ? 'member' : 'members'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      {userId === creatorId && (
                        <button
                          onClick={startEditingName}
                          className="flex items-center justify-center"
                          style={{ width: 24, height: 24 }}
                          aria-label="Edit squad name"
                        >
                          <MagicEdit style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
                        </button>
                      )}
                      <button
                        onClick={() => setShowNotif(true)}
                        className="flex items-center justify-center"
                        style={{ width: 24, height: 24 }}
                        aria-label="Notification settings"
                      >
                        <Bell style={{ width: 24, height: 24, color: 'var(--color-primary)' }} aria-hidden="true" />
                      </button>
                      <button
                        onClick={() => setIsExpanded(false)}
                        className="flex items-center justify-center"
                        style={{ width: 24, height: 24 }}
                        aria-label="Collapse"
                      >
                        <ChevronRight
                          style={{ width: 24, height: 24, color: 'var(--color-tertiary)', transform: 'rotate(90deg)' }}
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  </div>

                  {/* Avatar list + XP bar */}
                  <div className="flex flex-col gap-2">
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
                                  <Image src={resolveAvatarUrl(url, 24)} alt={m.username} fill sizes="24px" className="object-cover" unoptimized={isSupabaseStorage(url)} />
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

                    <div className="h-6 flex flex-col gap-2 items-center justify-center w-full">
                      <div className="flex items-center gap-2 w-full font-silkscreen text-tertiary">
                        <p className="flex-1 min-w-0 leading-[0] text-[0px]">
                          <span className="text-[8px] leading-none text-[#fafafa]">Level {crewLevel}</span>
                          <span className="text-[8px] leading-none text-tertiary">
                            {` · ${crewXP % XP_PER_LEVEL} / ${XP_PER_LEVEL}XP`}
                          </span>
                          {totalMessages > 0 && (
                            <span className="text-[8px] leading-none text-tertiary">
                              {` · ${totalMessages.toLocaleString()} total msg.`}
                            </span>
                          )}
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
                </div>

                {/* Invite code block */}
                {inviteCode && (
                  <div className="flex items-center justify-between bg-[rgba(168,85,247,0.1)] border border-purple p-4 overflow-hidden">
                    <div className="flex flex-col gap-1">
                      <p className="font-silkscreen text-[8px] text-secondary leading-none tracking-[0.2px]">
                        Invite your squad
                      </p>
                      <p
                        className="font-silkscreen text-[24px] text-purple leading-none tracking-[0.2px]"
                        style={{ textShadow: '0px 0px 3px #a855f7' }}
                      >
                        {inviteCode}
                      </p>
                    </div>
                    <button
                      onClick={handleCopyCode}
                      className="flex items-center gap-1 px-4 py-3 flex-shrink-0 transition-colors duration-150"
                      style={copied
                        ? { backgroundColor: '#22c55e', boxShadow: '2px 2px 0px 0px rgba(34,197,94,0.5)' }
                        : { backgroundColor: 'var(--color-purple)' }
                      }
                    >
                      {copied ? (
                        <>
                          <Check style={{ width: 12, height: 12, color: 'white' }} aria-hidden="true" />
                          <p className="font-silkscreen text-[11px] text-white leading-none whitespace-nowrap">copied</p>
                        </>
                      ) : (
                        <>
                          <Copy style={{ width: 12, height: 12, color: 'white' }} aria-hidden="true" />
                          <p className="font-silkscreen text-[11px] text-white leading-none whitespace-nowrap">Copy Code</p>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* ── Scrollable member list ── */}
              <div ref={memberListRef} className="flex-1 overflow-y-auto nexus-scroll px-4 min-h-0 mt-4">
                <div className="flex flex-col gap-6">
                  {members.flatMap((m, i) => {
                    const row = (
                      <MemberListRow
                        key={m.id}
                        profile={m}
                        msgCount={memberMsgCounts.get(m.id) ?? 0}
                        loading={loadingCounts}
                        isOnline={onlineUserIds.has(m.id)}
                        isCreator={m.id === creatorId}
                        onTap={() => {
                          setIsExpanded(false)
                          router.push(`/chat/${crewId}/member/${m.id}`)
                        }}
                        onRemove={userId === creatorId && m.id !== userId && !!inviteCode
                          ? () => setRemoveTarget(m)
                          : undefined
                        }
                      />
                    )
                    return i < members.length - 1
                      ? [row, <div key={`div-${i}`} className="h-px w-full bg-border" />]
                      : [row]
                  })}
                </div>
              </div>

              {/* ── Fixed close button ── */}
              <div
                className="flex-shrink-0 px-4"
                style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 32px)' }}
              >
                <button
                  onClick={() => setIsExpanded(false)}
                  className="h-12 w-full flex items-center justify-center font-pixel text-[8px] text-[#ef4444] transition-colors active:opacity-70"
                >
                  CLOSE
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNotif && (
          <NotifSheet
            crewName={liveCrewName}
            prefs={notifPrefs}
            onToggle={handleToggleNotif}
            onClose={() => setShowNotif(false)}
          />
        )}
      </AnimatePresence>

      <CrewImageUploadModal
        file={crewImageFile}
        crewId={crewId}
        onClose={() => setCrewImageFile(null)}
        onSuccess={(url) => setCrewImageUrl(url)}
      />
    </div>
  )
}
