'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
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
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/config'
import { haptic } from '@/lib/sounds'
import { compressImage, generateLQIP, validateImageUpload, getNetworkQuality } from '@/lib/utils/imageProcessing'
import { IMAGE_CONFIG } from '@/lib/config'
import { Send } from 'pixelarticons/react/Send'
import { Chart } from 'pixelarticons/react/Chart'
import { Camera } from 'pixelarticons/react/Camera'
import { ChevronRight } from 'pixelarticons/react/ChevronRight'
import { kickMemberAction, renameCrewAction, birthdaysCommandAction } from '@/app/(app)/chat/actions'
import { CrewImageUploadModal } from '@/components/chat/CrewImageUploadModal'
import { NotifSheet, type NotifPrefs } from '@/components/chat/NotifSheet'
import { SquadDetailsSheet, type MiniMember } from '@/components/chat/SquadDetailsSheet'
import { PollCreatorSheet } from '@/components/chat/PollCreatorSheet'
import type { Message, MessageWithProfile, Profile, ActiveRaid } from '@/types'

const MAX_MESSAGE_LENGTH = 2000
const RATE_LIMIT_MAX     = 30
const RATE_LIMIT_WINDOW  = 60_000

const CREW_AVATAR_COLORS = ['#bf5fff', '#00e5ff', '#ffd700', '#ff4444', '#66bb6a', '#ff9800']

const SLASH_COMMANDS = [
  { name: 'birthdays', icon: '🎂', description: 'See upcoming squad birthdays' },
] as const
type SlashCommandName = typeof SLASH_COMMANDS[number]['name']


type MemberProfile = Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url' | 'status'>

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
  isDM?:          boolean
}

function sanitizeMessage(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').trim().slice(0, MAX_MESSAGE_LENGTH)
}


export function ChatInput({ crewId, userId, userProfile, memberProfiles, crewName, inviteCode, creatorId, crewImageUrl: initialCrewImageUrl, initialXP, initialRaid, isDM }: ChatInputProps) {
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
  const [removeTarget,   setRemoveTarget]   = useState<MemberProfile | null>(null)
  const [removing,       setRemoving]       = useState(false)
  const [removeError,    setRemoveError]    = useState<string | null>(null)
  const [kickedIds,      setKickedIds]      = useState<Set<string>>(new Set())
  const [crewImageUrl,   setCrewImageUrl]   = useState<string | null>(initialCrewImageUrl ?? null)
  const [crewImageFile,  setCrewImageFile]  = useState<File | null>(null)
  const [showNotif,       setShowNotif]       = useState(false)
  const [notifPrefs,      setNotifPrefs]      = useState<NotifPrefs>({ messages: true, raids: true, victory: true, mentions: true })
  const [showPollCreator,   setShowPollCreator]   = useState(false)
  const [mentionQuery,    setMentionQuery]    = useState<string | null>(null)
  const [mentionIndex,    setMentionIndex]    = useState(0)
  const [isFocused,       setIsFocused]       = useState(false)

  const [chatImageLocalUrl,  setChatImageLocalUrl]  = useState<string | null>(null)
  const [chatImagePublicUrl, setChatImagePublicUrl] = useState<string | null>(null)
  const [chatImageLqip,      setChatImageLqip]      = useState<string | null>(null)
  const [chatImageUploading, setChatImageUploading] = useState(false)
  const [chatImageError,     setChatImageError]     = useState<string | null>(null)

  const textareaRef        = useRef<HTMLTextAreaElement>(null)
  const overlayRef         = useRef<HTMLDivElement>(null)
  const crewImageInputRef  = useRef<HTMLInputElement>(null)
  const chatImageInputRef  = useRef<HTMLInputElement>(null)
  const rateRef           = useRef({ count: 0, resetAt: Date.now() + RATE_LIMIT_WINDOW })
  const typingTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingChannelRef  = useRef<RealtimeChannel | null>(null)
  const msgChannelRef     = useRef<RealtimeChannel | null>(null)
  const channelReadyRef   = useRef(false)

  const {
    addMessage, removeMessage, updateMessage, setCrewXP, receiveXP, addXP,
    activeRaid, setActiveRaid, damageFloats, addDamageFloat, dismissDamageFloat,
    crewXP, crewLevel,
    onlineUserIds, setOnlineUserIds, addUserCoins,
    crewName: storeCrewName, setCrewName,
    replyTo, setReplyTo,
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

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus()
  }, [replyTo])

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

  useEffect(() => {
    let cancelled = false
    createClient()
      .from('crew_notification_preferences')
      .select('notif_messages, notif_raids, notif_victory, notif_mentions')
      .eq('user_id', userId)
      .eq('crew_id', crewId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        setNotifPrefs({
          messages: data.notif_messages as boolean,
          raids:    data.notif_raids    as boolean,
          victory:  data.notif_victory  as boolean,
          mentions: data.notif_mentions as boolean,
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
          notif_mentions: next.mentions,
          updated_at:     new Date().toISOString(),
        },
        { onConflict: 'user_id,crew_id' },
      )
  }, [notifPrefs, userId, crewId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync overlay scroll with textarea scroll so highlighted text stays aligned
  useEffect(() => {
    const ta = textareaRef.current
    const ov = overlayRef.current
    if (!ta || !ov) return
    const sync = () => { if (overlayRef.current && textareaRef.current) overlayRef.current.scrollTop = textareaRef.current.scrollTop }
    ta.addEventListener('scroll', sync)
    return () => ta.removeEventListener('scroll', sync)
  }, [])

  function handleTopPanEnd(_: PointerEvent, info: PanInfo) {
    if (info.offset.y < -50 || info.velocity.y < -300) setIsExpanded(true)
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
          channelReadyRef.current = true
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

    msgChannelRef.current     = ch
    typingChannelRef.current  = ch
    channelReadyRef.current   = false
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      supabase.removeChannel(ch)
      msgChannelRef.current     = null
      typingChannelRef.current  = null
      channelReadyRef.current   = false
    }
  }, [crewId, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  function broadcastTyping(isTyping: boolean) {
    typingChannelRef.current?.track({ username: userProfileRef.current.username, typing: isTyping })
  }

  // Revoke any existing blob URL and reset image upload state.
  const clearChatImage = useCallback(() => {
    setChatImageLocalUrl((prev) => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
      return null
    })
    setChatImagePublicUrl(null)
    setChatImageLqip(null)
    setChatImageUploading(false)
    setChatImageError(null)
  }, [])

  // Revoke blob URLs when they're replaced to avoid memory leaks.
  useEffect(() => {
    return () => {
      if (chatImageLocalUrl?.startsWith('blob:')) URL.revokeObjectURL(chatImageLocalUrl)
    }
  }, [chatImageLocalUrl])

  async function handleChatImagePick(file: File) {
    const validation = validateImageUpload(file)
    if (!validation.ok) { setChatImageError(validation.error); return }

    const localUrl = URL.createObjectURL(file)
    setChatImageLocalUrl(localUrl)
    setChatImageUploading(true)
    setChatImagePublicUrl(null)
    setChatImageLqip(null)
    setChatImageError(null)

    try {
      const networkQuality = getNetworkQuality()
      const qualityScale   = networkQuality === 'slow' ? 0.7 : networkQuality === 'medium' ? 0.85 : 1
      const quality        = IMAGE_CONFIG.CHAT_IMAGE_QUALITY * qualityScale

      const [lqip, compressed] = await Promise.all([
        generateLQIP(file),
        compressImage(file, { maxWidthOrHeight: IMAGE_CONFIG.CHAT_IMAGE_MAX_WIDTH_PX, quality }),
      ])
      setChatImageLqip(lqip)

      const supabase = createClient()
      const ext      = file.type === 'image/gif' ? 'gif' : 'webp'
      const path     = `${crewId}/${userId}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('chat-images').upload(path, compressed, {
        contentType:  file.type === 'image/gif' ? 'image/gif' : 'image/webp',
        cacheControl: '31536000',
      })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(path)
      setChatImagePublicUrl(publicUrl)
    } catch (err) {
      setChatImageError(err instanceof Error ? err.message : 'Upload failed. Try again.')
    } finally {
      setChatImageUploading(false)
    }
  }

  const sendImage = useCallback(async () => {
    if (!chatImagePublicUrl || chatImageUploading || sending) return

    const publicUrlSnapshot = chatImagePublicUrl
    const lqipSnapshot      = chatImageLqip
    const tempId            = `opt_${Date.now()}`

    setSending(true)
    setSendError(null)
    clearChatImage()
    haptic(10)

    const optimisticMsg: MessageWithProfile = {
      id:               tempId,
      crew_id:          crewId,
      user_id:          userId,
      content:          publicUrlSnapshot,
      message_type:     'image',
      element_type:     'nature',
      xp_awarded:       0,
      reactions:        {},
      created_at:       new Date().toISOString(),
      image_url:        publicUrlSnapshot,
      image_blur_hash:  lqipSnapshot ?? undefined,
      profile:          userProfile,
    }
    addMessage(optimisticMsg)
    addXP(20)

    try {
      const supabase = createClient()
      const { data: raw, error } = await supabase.rpc('insert_message', {
        p_crew_id: crewId, p_content: publicUrlSnapshot, p_message_type: 'image',
      })
      if (error) throw error

      const alreadyAdded = useChatStore.getState().messages.some((m) => m.id === raw.id)
      if (alreadyAdded) {
        removeMessage(tempId)
      } else {
        updateMessage(tempId, {
          id: raw.id, created_at: raw.created_at, element_type: raw.element_type,
          image_url: publicUrlSnapshot, image_blur_hash: lqipSnapshot ?? undefined,
        })
      }

      // Persist blur hash to DB row (fire-and-forget).
      if (lqipSnapshot) {
        const msgId = raw.id
        void (async () => {
          try {
            const sb = createClient()
            await sb.from('messages').update({ image_url: publicUrlSnapshot, image_blur_hash: lqipSnapshot }).eq('id', msgId)
          } catch {}
        })()
      }

      if (channelReadyRef.current) msgChannelRef.current?.send({
        type: 'broadcast', event: 'new_message',
        payload: {
          id: raw.id, crew_id: raw.crew_id, user_id: raw.user_id,
          content: raw.content, message_type: raw.message_type,
          element_type: raw.element_type, xp_awarded: raw.xp_awarded,
          created_at: raw.created_at,
          image_url: publicUrlSnapshot, image_blur_hash: lqipSnapshot,
        },
      })

      const msgId = raw.id
      fetch(`${SUPABASE_URL}/functions/v1/award-xp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ message_id: msgId, crew_id: crewId, user_id: userId, username: userProfile.username, message_type: 'image', content: publicUrlSnapshot, mentioned_user_ids: [] }),
      })
        .then((r) => r.json())
        .then((data: { xp_earned?: number; new_total_xp?: number; coins_earned?: number }) => {
          if (typeof data.xp_earned === 'number' && data.xp_earned > 0) updateMessage(msgId, { xp_awarded: data.xp_earned })
          if (typeof data.new_total_xp === 'number') {
            setCrewXP(data.new_total_xp)
            if (channelReadyRef.current) msgChannelRef.current?.send({
              type: 'broadcast', event: 'xp_update',
              payload: { xp_earned: data.xp_earned ?? 0, new_total_xp: data.new_total_xp, sender_id: userId },
            })
          }
          if (typeof data.coins_earned === 'number' && data.coins_earned > 0) addUserCoins(data.coins_earned)
        })
        .catch(() => {})

      if (activeRaid && !activeRaid.defeated_at) {
        fetch(`${SUPABASE_URL}/functions/v1/attack-boss`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
          body: JSON.stringify({ crew_id: crewId, user_id: userId, message_type: 'image', element_type: 'nature', content: publicUrlSnapshot }),
        })
          .then((r) => r.json())
          .then((data) => { if (data.damage) { addDamageFloat(data.damage, 'nature'); haptic([10, 50, 10]) } })
          .catch(() => {})
      }
    } catch (err) {
      removeMessage(tempId)
      // Restore image state so user can retry.
      setChatImagePublicUrl(publicUrlSnapshot)
      setChatImageLocalUrl(publicUrlSnapshot)
      setChatImageLqip(lqipSnapshot)
      setSendError(err instanceof Error ? err.message : 'Failed to send image.')
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }, [chatImagePublicUrl, chatImageLqip, chatImageUploading, sending, crewId, userId, userProfile, addMessage, removeMessage, updateMessage, activeRaid, addDamageFloat, addUserCoins, clearChatImage]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback(async () => {
    const content = sanitizeMessage(text)
    if (!content || sending) return

    // Detect mentioned user IDs from @username patterns in the message
    const currentProfiles = profilesRef.current
    const usernameToId    = new Map(Object.values(currentProfiles).map((m) => [m.username.toLowerCase(), m.id]))
    const mentionedSet    = new Set<string>()
    const mentionRx       = /@(\w+)/g
    let mx: RegExpExecArray | null
    while ((mx = mentionRx.exec(content)) !== null) {
      const uid = usernameToId.get(mx[1].toLowerCase())
      if (uid && uid !== userId) mentionedSet.add(uid)
    }
    const mentionedUserIds = [...mentionedSet]

    const now = Date.now()
    if (now >= rateRef.current.resetAt) rateRef.current = { count: 0, resetAt: now + RATE_LIMIT_WINDOW }
    rateRef.current.count++
    if (rateRef.current.count > RATE_LIMIT_MAX) { setSendError('Slow down, warrior.'); return }

    if (!localStorage.getItem('nexus_first_message')) localStorage.setItem('nexus_first_message', String(Date.now()))

    // Capture reply context before clearing state
    const currentReply = useChatStore.getState().replyTo

    setSending(true)
    setSendError(null)
    setText('')
    setReplyTo(null)
    broadcastTyping(false)
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    haptic(10)

    const supabase    = createClient()
    const elementType = getElementType(content, 'text')

    const replyToId       = currentReply?.id ?? null
    const replyPreview    = currentReply ? currentReply.content.slice(0, 100) : null
    const replyUsername   = currentReply?.profile?.username ?? null

    // Optimistic: add the message instantly so it appears before the RPC round-trip.
    const tempId = `opt_${Date.now()}`
    const optimisticMsg: MessageWithProfile = {
      id: tempId, crew_id: crewId, user_id: userId, content,
      message_type: 'text', element_type: elementType,
      xp_awarded: 0, reactions: {}, created_at: new Date().toISOString(),
      profile: userProfile,
      reply_to_id: replyToId, reply_preview: replyPreview, reply_username: replyUsername,
    }
    addMessage(optimisticMsg)
    addXP(10)

    try {
      const { data: raw, error } = await supabase.rpc('insert_message', {
        p_crew_id: crewId, p_content: content, p_message_type: 'text',
        p_reply_to_id: replyToId, p_reply_preview: replyPreview, p_reply_username: replyUsername,
      })
      if (error) throw error

      // Replace the optimistic message with the confirmed server row.
      // Guard against a Postgres Changes INSERT arriving first — if raw.id is
      // already in the store, just remove the temp entry to avoid a duplicate.
      const alreadyAdded = useChatStore.getState().messages.some((m) => m.id === raw.id)
      if (alreadyAdded) {
        removeMessage(tempId)
      } else {
        updateMessage(tempId, { id: raw.id, created_at: raw.created_at, element_type: raw.element_type })
      }

      if (channelReadyRef.current) msgChannelRef.current?.send({
        type: 'broadcast', event: 'new_message',
        payload: {
          id: raw.id, crew_id: raw.crew_id, user_id: raw.user_id,
          content: raw.content, message_type: raw.message_type,
          element_type: raw.element_type, xp_awarded: raw.xp_awarded,
          created_at: raw.created_at,
          reply_to_id: raw.reply_to_id, reply_preview: raw.reply_preview, reply_username: raw.reply_username,
        },
      })

      const msgId = raw.id
      fetch(`${SUPABASE_URL}/functions/v1/award-xp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ message_id: msgId, crew_id: crewId, user_id: userId, username: userProfile.username, message_type: 'text', content, mentioned_user_ids: mentionedUserIds }),
      })
        .then((r) => r.json())
        .then((data: { xp_earned?: number; new_total_xp?: number; coins_earned?: number; notif_count?: number; notif_results?: unknown[] }) => {
          console.log('[award-xp]', data)
          if (typeof data.xp_earned === 'number' && data.xp_earned > 0) updateMessage(msgId, { xp_awarded: data.xp_earned })
          if (typeof data.new_total_xp === 'number') {
            setCrewXP(data.new_total_xp) // sync authoritative total; float already shown optimistically
            if (channelReadyRef.current) msgChannelRef.current?.send({
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
      removeMessage(tempId)
      setText(content)
      if (currentReply) setReplyTo(currentReply)
      setSendError(err instanceof Error ? err.message : 'Failed to send. Tap to retry.')
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }, [text, sending, crewId, userId, userProfile, addMessage, removeMessage, updateMessage, activeRaid, addDamageFloat]) // eslint-disable-line react-hooks/exhaustive-deps

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
    // @mention picker navigation
    if (mentionQuery !== null && mentionMatches.length > 0) {
      if (e.key === 'Escape')    { e.preventDefault(); setMentionQuery(null); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex((i) => (i + 1) % mentionMatches.length); return }
      if (e.key === 'Enter')     { e.preventDefault(); completeMention(mentionMatches[mentionIndex].username); return }
    }

    if (e.key === 'Escape' && text.startsWith('/') && !text.includes(' ')) {
      e.preventDefault()
      setText('')
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const isCmd = text.startsWith('/') && !text.includes(' ')
      if (isCmd) {
        const filter   = text.slice(1).toLowerCase()
        const matches  = SLASH_COMMANDS.filter((c) => c.name.startsWith(filter))
        if (matches.length === 1) { executeCommand(matches[0].name); return }
      }
      send()
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value.slice(0, MAX_MESSAGE_LENGTH)
    setText(val)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 91) + 'px'
    if (val.trim()) {
      broadcastTyping(true)
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      typingTimerRef.current = setTimeout(() => broadcastTyping(false), 3000)
    } else { broadcastTyping(false) }
    // Detect @mention query at cursor position
    const pos = e.target.selectionStart ?? val.length
    const q   = getMentionQuery(val, pos)
    setMentionQuery(q)
    if (q !== null) setMentionIndex(0)
  }

  function handleBlur() {
    broadcastTyping(false)
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    setIsFocused(false)
  }

  async function executeCommand(name: SlashCommandName) {
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    textareaRef.current?.focus()

    if (name === 'birthdays') {
      setSending(true)
      setSendError(null)
      try {
        const result = await birthdaysCommandAction(crewId)
        if (result.error) {
          setSendError(result.error)
        } else if (result.message) {
          const msgWithProfile = { ...result.message, profile: userProfile }
          addMessage(msgWithProfile)
          if (channelReadyRef.current) msgChannelRef.current?.send({
            type: 'broadcast', event: 'new_message',
            payload: {
              id: msgWithProfile.id, crew_id: msgWithProfile.crew_id, user_id: msgWithProfile.user_id,
              content: msgWithProfile.content, message_type: msgWithProfile.message_type,
              element_type: msgWithProfile.element_type, xp_awarded: msgWithProfile.xp_awarded,
              created_at: msgWithProfile.created_at,
            },
          })
        }
      } finally {
        setSending(false)
      }
    }
  }

  function handlePollCreated(message: MessageWithProfile) {
    setShowPollCreator(false)
    addMessage(message)
    if (channelReadyRef.current) msgChannelRef.current?.send({
      type: 'broadcast', event: 'new_message',
      payload: {
        id: message.id, crew_id: message.crew_id, user_id: message.user_id,
        content: message.content, message_type: message.message_type,
        element_type: message.element_type, xp_awarded: message.xp_awarded,
        created_at: message.created_at,
      },
    })
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

  // ─── @mention helpers ───────────────────────────────────────────────────────

  function getMentionQuery(val: string, cursorPos: number): string | null {
    const before = val.slice(0, cursorPos)
    const atIdx  = before.lastIndexOf('@')
    if (atIdx === -1) return null
    const query = before.slice(atIdx + 1)
    if (/[\s\n]/.test(query)) return null
    return query
  }

  function completeMention(username: string) {
    if (!textareaRef.current) return
    const pos    = textareaRef.current.selectionStart ?? text.length
    const before = text.slice(0, pos)
    const after  = text.slice(pos)
    const atIdx  = before.lastIndexOf('@')
    if (atIdx === -1) return
    const newText = before.slice(0, atIdx) + '@' + username + ' ' + after
    setText(newText)
    setMentionQuery(null)
    setMentionIndex(0)
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const cur = atIdx + username.length + 2
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(cur, cur)
      }
    })
  }

  function renderHighlightedInput(val: string): React.ReactNode {
    const memberSet = new Set(members.map((m) => m.username.toLowerCase()))
    const regex     = /@(\w+)/g
    const parts: React.ReactNode[] = []
    let lastIdx = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(val)) !== null) {
      if (memberSet.has(match[1].toLowerCase())) {
        if (match.index > lastIdx) parts.push(val.slice(lastIdx, match.index))
        parts.push(
          <mark key={match.index} style={{ background: 'transparent', color: 'var(--color-purple)' }}>
            @{match[1]}
          </mark>
        )
        lastIdx = match.index + match[0].length
      }
    }
    if (lastIdx < val.length) parts.push(val.slice(lastIdx))
    parts.push('​')
    return parts
  }

  const mentionMatches = mentionQuery !== null
    ? members.filter((m) => m.id !== userId && m.username.toLowerCase().startsWith(mentionQuery.toLowerCase()))
    : []

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
        paddingTop:    'var(--space-4)',
        paddingLeft:   'var(--space-5)',
        paddingRight:  'var(--space-5)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 32px)',
        gap:           'var(--space-5)',
      }}
    >
      {devMode && <DamageFloat floats={damageFloats} onDismiss={dismissDamageFloat} />}

      {/* ── DM: "Chatting with" label ── */}
      {isDM && (
        <p className="font-silkscreen text-[12px] leading-none">
          <span className="text-[#a1a1aa]">Chatting with </span>
          <span className="text-purple">{liveCrewName.toLowerCase()}</span>
        </p>
      )}

      {/* ── Group: Member avatars + XP bar — tap or swipe up to expand ── */}
      {!isDM && <motion.div
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
      </motion.div>}

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

        {/* ── Reply preview bar ── */}
        {replyTo && (
          <div
            className="flex items-center overflow-hidden"
            style={{ borderLeft: '2px solid var(--color-purple)', background: 'rgba(191,95,255,0.06)', paddingLeft: 'var(--space-4)', paddingRight: 'var(--space-3)', paddingTop: 'var(--space-3)', paddingBottom: 'var(--space-3)', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}
          >
            <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 2 }}>
              <span className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-purple)' }}>
                ↩ Replying to @{replyTo.profile?.username ?? replyTo.reply_username ?? '???'}
              </span>
              <span
                className="font-body font-normal leading-snug text-ellipsis overflow-hidden whitespace-nowrap"
                style={{ fontSize: 'var(--text-xxs)', color: 'var(--color-tertiary)', fontVariationSettings: '"opsz" 14' }}
              >
                {replyTo.content.slice(0, 80)}
              </span>
            </div>
            <button
              onClick={() => setReplyTo(null)}
              className="flex-shrink-0 flex items-center justify-center w-6 h-6 text-tertiary active:text-primary"
              aria-label="Cancel reply"
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>✕</span>
            </button>
          </div>
        )}

        {/* ── Image attachment preview ── */}
        {chatImageLocalUrl && (
          <div
            className="flex items-center overflow-hidden"
            style={{ border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.03)', padding: '8px 12px', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}
          >
            <div className="relative flex-shrink-0 overflow-hidden" style={{ width: 40, height: 40 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={chatImageLocalUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              {chatImageUploading && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <span className="font-pixel text-[6px] text-white leading-none">···</span>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 2 }}>
              <span className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: chatImageError ? 'var(--color-danger)' : chatImageUploading ? 'var(--color-tertiary)' : 'var(--color-success)' }}>
                {chatImageError ? chatImageError : chatImageUploading ? 'Uploading...' : 'Image ready'}
              </span>
            </div>
            <button
              onClick={clearChatImage}
              className="flex-shrink-0 flex items-center justify-center w-6 h-6 text-tertiary active:text-primary"
              aria-label="Remove image"
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>✕</span>
            </button>
          </div>
        )}

        {/* ── Input wrapper: pickers float above via absolute positioning ── */}
        <div className="relative">
          {/* @mention picker — absolute, grows upward over group details */}
          <AnimatePresence>
            {mentionQuery !== null && mentionMatches.length > 0 && (
              <motion.div
                key="mention-menu"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.12 }}
                className="absolute bottom-full left-0 right-0 border border-border bg-black"
              >
                <div className="nexus-scroll" style={{ maxHeight: 220, overflowY: 'scroll' }}>
                {mentionMatches.map((m, i) => {
                  const url     = m.avatar_url as string | null | undefined
                  const initial = m.username[0]?.toUpperCase() ?? '?'
                  const isLast  = i === mentionMatches.length - 1
                  return (
                    <button
                      key={m.id}
                      onMouseDown={(e) => { e.preventDefault(); completeMention(m.username) }}
                      className={`w-full flex items-center overflow-hidden p-2 text-left ${!isLast ? 'border-b border-border' : ''} ${i === mentionIndex ? 'bg-surface' : 'active:bg-surface'}`}
                      style={{ gap: 'var(--space-3)' }}
                    >
                      <div className="w-6 h-6 flex-shrink-0 overflow-hidden bg-surface flex items-center justify-center">
                        {url ? (
                          <div className="relative w-full h-full">
                            <Image src={resolveAvatarUrl(url, 24)} alt={m.username} fill sizes="24px" className="object-cover" unoptimized={isSupabaseStorage(url)} />
                          </div>
                        ) : (
                          <span className="font-pixel text-[length:var(--text-mini)] text-purple">{initial}</span>
                        )}
                      </div>
                      <div className="flex flex-col flex-1 min-w-0 items-start">
                        <span className="font-silkscreen text-[length:var(--text-mini)] text-purple leading-normal w-full">@mention</span>
                        <span className="font-body font-normal text-[length:var(--text-xs)] text-primary leading-normal w-full" style={{ fontVariationSettings: '"opsz" 14' }}>{m.username}</span>
                      </div>
                    </button>
                  )
                })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Slash command menu — absolute, grows upward over group details ── */}
          {(() => {
            const isCmd = text.startsWith('/') && !text.includes(' ')
            const filter = isCmd ? text.slice(1).toLowerCase() : ''
            const matches = isCmd ? SLASH_COMMANDS.filter((c) => c.name.startsWith(filter)) : []
            if (!isCmd || matches.length === 0) return null
            return (
              <AnimatePresence>
                <motion.div
                  key="cmd-menu"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute bottom-full left-0 right-0 border border-border bg-black"
                >
                  <div className="nexus-scroll" style={{ maxHeight: 220, overflowY: 'scroll' }}>
                  {matches.map((cmd, i) => {
                    const isLast = i === matches.length - 1
                    return (
                      <button
                        key={cmd.name}
                        onMouseDown={(e) => { e.preventDefault(); executeCommand(cmd.name) }}
                        className={`w-full flex flex-col items-start overflow-hidden p-2 text-left active:bg-surface ${!isLast ? 'border-b border-border' : ''}`}
                      >
                        <span className="font-silkscreen text-[length:var(--text-mini)] text-purple leading-normal w-full">/{cmd.name}</span>
                        <span className="font-body font-normal text-[length:var(--text-xs)] text-tertiary leading-normal w-full" style={{ fontVariationSettings: '"opsz" 14' }}>{cmd.description}</span>
                      </button>
                    )
                  })}
                  </div>
                </motion.div>
              </AnimatePresence>
            )
          })()}

          <div
            className="border flex items-center overflow-hidden transition-colors"
            style={{ borderColor: isFocused ? 'var(--color-purple)' : 'var(--color-border)', paddingLeft: 'var(--space-5)', paddingRight: 'var(--space-5)', gap: 'var(--space-5)', minHeight: 48 }}
          >
            <motion.div
              className="flex-shrink-0 overflow-hidden flex items-center"
              animate={{ width: isFocused ? 0 : 40, opacity: isFocused ? 0 : 1, marginRight: isFocused ? -16 : 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              style={{ pointerEvents: isFocused ? 'none' : 'auto', gap: 8 }}
            >
              <button
                onClick={() => setShowPollCreator(true)}
                className="flex-shrink-0 flex items-center justify-center w-4 h-4 text-tertiary active:text-purple"
                aria-label="Create poll"
              >
                <Chart style={{ width: 16, height: 16 }} aria-hidden="true" />
              </button>
              <button
                onClick={() => chatImageInputRef.current?.click()}
                disabled={chatImageUploading}
                className="flex-shrink-0 flex items-center justify-center w-4 h-4 text-tertiary active:text-purple disabled:opacity-40"
                aria-label="Share image"
              >
                <Camera style={{ width: 16, height: 16 }} aria-hidden="true" />
              </button>
            </motion.div>
            <div className="relative flex-1 min-w-0 overflow-hidden">
              {/* Overlay renders @mention highlights behind the transparent textarea */}
              <div
                ref={overlayRef}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 font-body text-[14px] leading-normal overflow-hidden"
                style={{ paddingTop: 14, paddingBottom: 14, fontVariationSettings: '"opsz" 14', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--color-primary)' }}
              >
                {renderHighlightedInput(text)}
              </div>
              <textarea
                ref={textareaRef}
                value={text}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                placeholder={inRaid ? 'Attack The Void...' : isDM ? 'Send a message...' : 'Message the squad...'}
                rows={1}
                onFocus={() => setIsFocused(true)}
                className="relative w-full bg-transparent font-body text-[14px] placeholder:text-muted resize-none focus:outline-none leading-normal"
                style={{ paddingTop: 14, paddingBottom: 14, maxHeight: 91, fontVariationSettings: '"opsz" 14', color: 'transparent', caretColor: 'var(--color-primary)', overflowY: 'auto', overflowX: 'hidden' }}
              />
            </div>
            {(() => {
              const isCmd    = text.startsWith('/') && !text.includes(' ')
              const hasMatch = isCmd && SLASH_COMMANDS.some((c) => c.name.startsWith(text.slice(1).toLowerCase()))
              const canSendImage = !!chatImagePublicUrl && !chatImageUploading
              const canSendText  = !!text.trim() && !hasMatch
              const canSend      = canSendImage || canSendText
              return (
                <button
                  onClick={canSendImage ? sendImage : send}
                  disabled={!canSend || sending || chatImageUploading}
                  className={`flex-shrink-0 flex items-center justify-center w-4 h-4 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${isFocused || canSendImage ? 'text-purple' : canSendText ? 'text-primary' : 'text-muted'}`}
                  aria-label="Send message"
                >
                  <Send style={{ width: 16, height: 16 }} aria-hidden="true" />
                </button>
              )
            })()}
          </div>
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
              className="relative w-full max-w-[480px] bg-surface border-t border-border-hover flex flex-col gap-6 p-4"
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
        {isExpanded && !isDM && (
          <SquadDetailsSheet
            crewId={crewId}
            crewName={liveCrewName}
            memberCount={memberCount}
            crewImageUrl={crewImageUrl}
            members={members.map((m): MiniMember => ({
              id:           m.id,
              username:     m.username,
              avatar_url:   m.avatar_url as string | null,
              avatar_class: m.avatar_class,
              status:       m.status,
            }))}
            onlineUserIds={onlineUserIds}
            crewXP={crewXP}
            crewLevel={crewLevel}
            xpProgress={xpProgress}
            totalMessages={totalMessages}
            inviteCode={inviteCode}
            creatorId={creatorId}
            currentUserId={userId}
            memberMsgCounts={memberMsgCounts}
            loadingCounts={loadingCounts}
            onUploadPhoto={() => crewImageInputRef.current?.click()}
            onNotifPress={() => setShowNotif(true)}
            onSave={async (newName) => {
              const trimmed = newName.trim()
              if (!trimmed || trimmed.length < 2) return
              const prev = liveCrewName
              setCrewName(trimmed)
              const result = await renameCrewAction(crewId, trimmed)
              if (result?.error) setCrewName(prev)
            }}
            onTapMember={(memberId) => {
              setIsExpanded(false)
              sessionStorage.setItem('nexus_chat_from', 'chat')
              router.push(`/chat/${crewId}/member/${memberId}`)
            }}
            onRemoveMember={(member) => setRemoveTarget(member as MemberProfile)}
            onClose={() => setIsExpanded(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNotif && (
          <NotifSheet
            prefs={notifPrefs}
            onToggle={handleToggleNotif}
            onClose={() => setShowNotif(false)}
          />
        )}
      </AnimatePresence>

      {/* File input outside any transformed container — iOS Safari drops .click() inside transforms */}
      <input
        ref={crewImageInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
        style={{ position: 'fixed', top: -1, left: -1, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) setCrewImageFile(f)
          e.target.value = ''
        }}
      />

      {/* Chat image picker — fixed position prevents .click() issues in transforms */}
      <input
        ref={chatImageInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic,image/heif"
        style={{ position: 'fixed', top: -1, left: -1, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleChatImagePick(f)
          e.target.value = ''
        }}
      />

      <CrewImageUploadModal
        file={crewImageFile}
        crewId={crewId}
        onClose={() => setCrewImageFile(null)}
        onSuccess={(url) => setCrewImageUrl(url)}
      />

      <AnimatePresence>
        {showPollCreator && (
          <PollCreatorSheet
            crewId={crewId}
            userProfile={userProfile}
            onClose={() => setShowPollCreator(false)}
            onCreated={handlePollCreated}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
