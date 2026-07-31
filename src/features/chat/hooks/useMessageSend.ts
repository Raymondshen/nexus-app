import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createClient } from '@/shared/supabase/client'
import { useChatStore } from '@/store/chatStore'
import { SUPABASE_URL, IMAGE_CONFIG } from '@/shared/constants/config'
import { haptic } from '@/shared/utils/sounds'
import { compressImage, generateLQIP, validateImageUpload, getNetworkQuality } from '@/shared/utils/imageProcessing'
import { sendWithRetry } from '@/shared/utils/sendWithRetry'
import { postEdgeFn } from '@/shared/utils/edgeFetch'
import { addToOutbox, readOutbox, type OutboxJob } from '@/shared/utils/outbox'
import { setHomeLastMessage } from '@/features/home/utils/homePreviewCache'
import { isGemGateOpen, recordGemClaim } from '@/shared/utils/gems'
import type { GemClaimResult, Message, MessageWithProfile } from '@/types'
import type { MemberProfile } from '@/features/chat/components/input/ChatInput'

// Must match ChatInput's own copy of this constant — its handleInput independently
// truncates before handing off to the composer, and a real (non-type) circular import
// between the two files isn't worth avoiding for one shared literal.
const MAX_MESSAGE_LENGTH = 2000
const RATE_LIMIT_MAX     = 30
const RATE_LIMIT_WINDOW  = 60_000

function sanitizeMessage(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').trim().slice(0, MAX_MESSAGE_LENGTH)
}

// Fire-and-forget daily gem claim. The local gate (idb-keyval) is a debounce only —
// the award-gem Edge Function + claim_daily_gem RPC are the sole authority on the
// award decision. Must never block sending or surface errors as a send failure.
async function tryClaimDailyGem(supabase: ReturnType<typeof createClient>, onClaimed?: () => void) {
  try {
    if (!(await isGemGateOpen())) return
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return

    const res = await fetch(`${SUPABASE_URL}/functions/v1/award-gem`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body:    JSON.stringify({ timezone_offset_minutes: new Date().getTimezoneOffset() }),
    })
    const data: GemClaimResult = await res.json()
    if (data.claimed) {
      await recordGemClaim()
      useChatStore.getState().setGemBalance(data.gem_balance)
      onClaimed?.()
    }
  } catch {
    // Silent — a failed gem claim must never surface as a message send error.
  }
}

export interface PendingImage {
  id:        string
  localUrl:  string        // blob URL — shown immediately on selection
  publicUrl: string | null // set after upload completes
  lqip:      string | null // set after LQIP generation
  uploading: boolean
  error:     string | null
}

interface UseMessageSendParams {
  crewId:       string
  userId:       string
  userProfile:  MemberProfile
  isDM?:        boolean
  dmPartnerId?: string
  liveCrewName: string
  fxpEnabled:   boolean
  text:         string
  textRef:      RefObject<string>
  inputRef:     RefObject<HTMLInputElement | null>
  focusField:   () => void
  clearComposerText: () => boolean
  profilesRef:  RefObject<Record<string, MemberProfile>>
  broadcastNewMessage: (message: Message) => void
  broadcastXpUpdate:   (payload: { xp_earned: number; new_total_xp: number; sender_id: string }) => void
  pingPresence: () => void
}

// Owns the whole message-send pipeline: text/image/GIF send, edit-save, retry, the
// outbox-resume-on-remount effect, and their success side effects (XP settlement,
// presence piggyback, daily gem claim, friendship-XP toast). Extracted out of
// ChatInput (which had grown to ~2,500 lines mixing this with presence/composer/
// mention/squad-management concerns); nothing about the underlying behavior changed
// in the move.
export function useMessageSend({
  crewId, userId, userProfile, isDM, dmPartnerId, liveCrewName, fxpEnabled,
  text, textRef, inputRef, focusField, clearComposerText, profilesRef,
  broadcastNewMessage, broadcastXpUpdate, pingPresence,
}: UseMessageSendParams) {
  const addMessage    = useChatStore((s) => s.addMessage)
  const updateMessage = useChatStore((s) => s.updateMessage)
  const bumpCrewXP    = useChatStore((s) => s.bumpCrewXP)
  const setCrewXP     = useChatStore((s) => s.setCrewXP)
  const addUserCoins  = useChatStore((s) => s.addUserCoins)
  const setReplyTo    = useChatStore((s) => s.setReplyTo)
  const setEditTo     = useChatStore((s) => s.setEditTo)

  const [sendError,       setSendError]       = useState<string | null>(null)
  const [pendingImages,   setPendingImages]   = useState<PendingImage[]>([])
  const [friendshipToast, setFriendshipToast] = useState<{ totalXP: number; xpAwarded: number; partnerName: string; dailyCount: number } | null>(null)
  const [gemToastVisible, setGemToastVisible] = useState(false)

  const pendingImagesRef  = useRef<PendingImage[]>([])
  // Synced via layout effect rather than a bare assignment in the render body — see
  // usePresenceChannel's own comment on this same pattern; react-hooks/refs flags
  // writing a ref during render even when nothing reads it back that same render.
  useLayoutEffect(() => {
    pendingImagesRef.current = pendingImages
  })
  const chatImageInputRef = useRef<HTMLInputElement>(null)
  // resetAt starts at 0 (the epoch), not Date.now() + RATE_LIMIT_WINDOW — computing a
  // real deadline here would call an impure function (Date.now()) during render.
  // Functionally equivalent: send()'s own "now >= resetAt → reset the window" check
  // already treats 0 as "already expired," so the first call to send() seeds the real
  // window (now + RATE_LIMIT_WINDOW) itself, same as every subsequent expiry.
  const rateRef = useRef({ count: 0, resetAt: 0 })
  const friendshipToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gemToastTimerRef        = useRef<ReturnType<typeof setTimeout> | null>(null)

  const removePendingImage = useCallback((id: string) => {
    setPendingImages((prev) => {
      const img = prev.find((i) => i.id === id)
      if (img?.localUrl.startsWith('blob:')) URL.revokeObjectURL(img.localUrl)
      return prev.filter((i) => i.id !== id)
    })
  }, [])

  const clearPendingImages = useCallback(() => {
    setPendingImages((prev) => {
      prev.forEach((img) => { if (img.localUrl.startsWith('blob:')) URL.revokeObjectURL(img.localUrl) })
      return []
    })
  }, [])

  useEffect(() => {
    return () => {
      if (friendshipToastTimerRef.current) clearTimeout(friendshipToastTimerRef.current)
      if (gemToastTimerRef.current) clearTimeout(gemToastTimerRef.current)
      // Revoke any remaining blob URLs on unmount
      pendingImagesRef.current.forEach((img) => {
        if (img.localUrl.startsWith('blob:')) URL.revokeObjectURL(img.localUrl)
      })
    }
  }, [])

  const showGemToast = () => {
    if (gemToastTimerRef.current) clearTimeout(gemToastTimerRef.current)
    setGemToastVisible(true)
    gemToastTimerRef.current = setTimeout(() => setGemToastVisible(false), 3000)
  }

  // Shared award-xp settlement used by every send path (text/image/gif): applies the
  // XP/coin response and broadcasts xp_update to peers.
  const settleXp = useCallback((msgId: string, messageType: string, content: string, mentionedUserIds: string[], replyToId?: string | null) => {
    postEdgeFn('award-xp', { message_id: msgId, crew_id: crewId, user_id: userId, username: userProfile.username, message_type: messageType, content, mentioned_user_ids: mentionedUserIds, reply_to_id: replyToId ?? null })
      .then((r) => { if (!r) throw new Error('no session'); return r.json() })
      .then((data: { xp_earned?: number; new_total_xp?: number; coins_earned?: number }) => {
        if (typeof data.xp_earned === 'number') updateMessage(msgId, { xp_awarded: data.xp_earned })
        if (typeof data.new_total_xp === 'number') {
          setCrewXP(data.new_total_xp)
          broadcastXpUpdate({ xp_earned: data.xp_earned ?? 0, new_total_xp: data.new_total_xp, sender_id: userId })
        }
        if (typeof data.coins_earned === 'number' && data.coins_earned > 0) addUserCoins(data.coins_earned)
      })
      .catch(() => {})
  }, [crewId, userId, userProfile, updateMessage, setCrewXP, addUserCoins, broadcastXpUpdate])

  // Shared "message successfully persisted" side effects — same for a fresh send and
  // a retried one, so text/image/gif/retry all get identical broadcast/XP/friendship-xp
  // behavior instead of four subtly-diverging inline copies of this logic.
  const handleSendSuccess = useCallback((raw: Message, job: OutboxJob) => {
    setHomeLastMessage(crewId, { content: job.content || raw.content, created_at: raw.created_at, sender: userProfile.username })

    broadcastNewMessage(raw)
    // Piggyback heartbeat on send — proves liveness, keeps DB timestamp fresh between
    // intervals. Self-gates on channel readiness internally, same as broadcastNewMessage.
    pingPresence()

    tryClaimDailyGem(createClient(), showGemToast)
    settleXp(raw.id, job.messageType, job.content, job.mentionedUserIds, job.replyToId)

    if (fxpEnabled && job.messageType === 'text') {
      // Friendship XP — shared helper: fade-in 200ms, hold 2000ms, then exit animation (400ms) runs
      const showFriendshipToast = (totalXP: number, xpAwarded: number, partnerName: string, dailyCount: number) => {
        if (friendshipToastTimerRef.current) clearTimeout(friendshipToastTimerRef.current)
        setFriendshipToast({ totalXP, xpAwarded, partnerName, dailyCount })
        friendshipToastTimerRef.current = setTimeout(() => setFriendshipToast(null), 2200)
      }

      // Local midnight as UTC ISO string — used by the server to compute the daily limit window
      const now = new Date()
      const localMidnightUTC = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString()

      // Friendship XP — DM send
      if (isDM && dmPartnerId) {
        const dmPartnerName = liveCrewName
        postEdgeFn('award-friendship-xp', { user_a_id: userId, user_b_id: dmPartnerId, source: 'dm', local_midnight_utc: localMidnightUTC })
          .then((r) => { if (!r) throw new Error('no session'); return r.json() })
          .then((data: { total_xp?: number; xp_awarded?: number; skipped?: boolean; daily_count?: number }) => {
            if (typeof data.total_xp === 'number' && (data.xp_awarded ?? 0) > 0) {
              showFriendshipToast(data.total_xp, data.xp_awarded!, dmPartnerName, data.daily_count ?? 1)
            }
          })
          .catch(() => {})
      }

      // Friendship XP — @mention in group chat (toast for first awarded pair)
      if (!isDM && job.mentionedUserIds.length > 0) {
        let toastShown = false
        job.mentionedUserIds.forEach((friendId) => {
          const partnerName = profilesRef.current[friendId]?.username ?? 'Friend'
          postEdgeFn('award-friendship-xp', { user_a_id: userId, user_b_id: friendId, source: 'mention', local_midnight_utc: localMidnightUTC })
            .then((r) => { if (!r) throw new Error('no session'); return r.json() })
            .then((data: { total_xp?: number; xp_awarded?: number; skipped?: boolean; daily_count?: number }) => {
              if (!toastShown && typeof data.total_xp === 'number' && (data.xp_awarded ?? 0) > 0) {
                toastShown = true
                showFriendshipToast(data.total_xp, data.xp_awarded!, partnerName, data.daily_count ?? 1)
              }
            })
            .catch(() => {})
        })
      }
    }
  }, [crewId, userId, userProfile, fxpEnabled, isDM, dmPartnerId, liveCrewName, broadcastNewMessage, pingPresence, settleXp, profilesRef])

  async function handleChatImagesPick(files: File[]) {
    if (files.length === 0) return

    const networkQuality = getNetworkQuality()
    const qualityScale   = networkQuality === 'slow' ? 0.7 : networkQuality === 'medium' ? 0.85 : 1
    const quality        = IMAGE_CONFIG.CHAT_IMAGE_QUALITY * qualityScale
    const supabase       = createClient()

    // Create entries with blob URLs immediately — instant preview before upload
    const entries: PendingImage[] = files.map((file, i) => ({
      id:        `img_${Date.now()}_${i}`,
      localUrl:  URL.createObjectURL(file),
      publicUrl: null,
      lqip:      null,
      uploading: true,
      error:     null,
    }))

    setPendingImages((prev) => [...prev, ...entries].slice(0, 4))

    // Upload all in parallel
    await Promise.all(entries.map(async (entry, i) => {
      const file = files[i]
      const patch = (p: Partial<PendingImage>) =>
        setPendingImages((prev) => prev.map((img) => img.id === entry.id ? { ...img, ...p } : img))

      try {
        const validation = validateImageUpload(file)
        if (!validation.ok) { patch({ uploading: false, error: validation.error }); return }

        const [lqip, compressed] = await Promise.all([
          generateLQIP(file),
          compressImage(file, { maxWidthOrHeight: IMAGE_CONFIG.CHAT_IMAGE_MAX_WIDTH_PX, quality }),
        ])
        patch({ lqip })

        const ext  = file.type === 'image/gif' ? 'gif' : compressed.type.includes('jpeg') ? 'jpg' : 'webp'
        const path = `${crewId}/${userId}/${Date.now()}_${i}.${ext}`
        const { error: uploadError } = await supabase.storage.from('chat-images').upload(path, compressed, {
          contentType:  file.type === 'image/gif' ? 'image/gif' : compressed.type,
          cacheControl: '31536000',
        })
        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(path)
        patch({ publicUrl, uploading: false })
      } catch (err) {
        patch({ uploading: false, error: err instanceof Error ? err.message : 'Upload failed.' })
      }
    }))
  }

  const sendImages = useCallback(() => {
    const readyImages = pendingImagesRef.current.filter((img) => !!img.publicUrl)
    if (readyImages.length === 0) return

    const snapshots   = readyImages.map((img) => ({ publicUrl: img.publicUrl!, lqip: img.lqip }))
    const textContent = sanitizeMessage(textRef.current)

    setSendError(null)
    clearPendingImages()

    // Clear text field when images and text are sent together
    if (textContent) {
      setReplyTo(null)
      clearComposerText()
    }

    haptic(10)

    const urls  = snapshots.map((s) => s.publicUrl)
    const lqips = snapshots.map((s) => s.lqip ?? null)
    // Pack all URLs + LQIPs as JSON so the server stores one message regardless of count.
    // MessageBubble detects this by JSON.parse(image_url) → array.
    const imageUrlJson  = JSON.stringify(urls)
    const imageBlurJson = JSON.stringify(lqips)
    // content = typed text (shown below images); fall back to first URL for home preview compat
    const msgContent = textContent || urls[0]

    // Client-generated id doubles as the outbox job key — random suffix (not just
    // Date.now()) avoids a collision if multiple sends fire within the same millisecond,
    // which concurrent (non-blocking) sends make possible.
    const tempId = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const optimisticMsg: MessageWithProfile = {
      id:              tempId,
      crew_id:         crewId,
      user_id:         userId,
      content:         msgContent,
      message_type:    'image',
      element_type:    null,
      xp_awarded:      1,
      reactions:       {},
      created_at:      new Date().toISOString(),
      image_url:       imageUrlJson,
      image_blur_hash: imageBlurJson,
      profile:         userProfile,
      tempId,
      sendStatus:      'sending',
    }
    addMessage(optimisticMsg)
    if (!isDM) bumpCrewXP()

    const job: OutboxJob = {
      tempId, crewId, userId, username: userProfile.username, content: msgContent,
      messageType: 'image', imageUrl: imageUrlJson, imageBlurHash: imageBlurJson,
      mentionedUserIds: [], createdAt: optimisticMsg.created_at,
    }
    addToOutbox(job).catch(() => {})
    void sendWithRetry(job, (raw) => handleSendSuccess(raw, job))

    focusField()
  }, [crewId, userId, userProfile, isDM, addMessage, bumpCrewXP, clearPendingImages, handleSendSuccess, clearComposerText, setReplyTo, focusField, textRef])

  const sendGif = useCallback((gifUrl: string) => {
    const tempId = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    setSendError(null)
    haptic(10)

    const optimisticMsg: MessageWithProfile = {
      id:              tempId,
      crew_id:         crewId,
      user_id:         userId,
      content:         gifUrl,
      message_type:    'image',
      element_type:    'nature',
      xp_awarded:      1,
      reactions:       {},
      created_at:      new Date().toISOString(),
      image_url:       gifUrl,
      image_blur_hash: undefined,
      profile:         userProfile,
      tempId,
      sendStatus:      'sending',
    }
    addMessage(optimisticMsg)
    if (!isDM) bumpCrewXP()

    const job: OutboxJob = {
      tempId, crewId, userId, username: userProfile.username, content: gifUrl,
      messageType: 'image', imageUrl: gifUrl, imageBlurHash: null,
      mentionedUserIds: [], createdAt: optimisticMsg.created_at,
    }
    addToOutbox(job).catch(() => {})
    void sendWithRetry(job, (raw) => handleSendSuccess(raw, job))

    focusField()
  }, [crewId, userId, userProfile, isDM, addMessage, bumpCrewXP, handleSendSuccess, focusField])

  const send = useCallback(() => {
    const content = sanitizeMessage(text)
    if (!content) return

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

    setSendError(null)
    setReplyTo(null)
    clearComposerText()
    haptic(10)
    // Refocus immediately (not after the network round trip) — the compose box is
    // already clear, so the user can keep typing the next message right away instead
    // of waiting for this one to be confirmed by the server.
    inputRef.current?.focus()

    const replyToId     = currentReply?.id ?? null
    const replyPreview  = currentReply ? currentReply.content.slice(0, 100) : null
    const replyUsername = currentReply?.profile?.username ?? null

    // Optimistic: add the message instantly so it appears before the RPC round-trip.
    // Client-generated id doubles as the outbox job key — random suffix avoids a
    // collision if multiple sends fire within the same millisecond, which concurrent
    // (non-blocking) sends make possible.
    const tempId = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const optimisticMsg: MessageWithProfile = {
      id: tempId, crew_id: crewId, user_id: userId, content,
      message_type: 'text', element_type: null,
      xp_awarded: 1, reactions: {}, created_at: new Date().toISOString(),
      profile: userProfile,
      reply_to_id: replyToId, reply_preview: replyPreview, reply_username: replyUsername,
      tempId, sendStatus: 'sending',
    }
    addMessage(optimisticMsg)
    if (!isDM) bumpCrewXP()

    const job: OutboxJob = {
      tempId, crewId, userId, username: userProfile.username, content,
      messageType: 'text', replyToId, replyPreview, replyUsername,
      mentionedUserIds, createdAt: optimisticMsg.created_at,
    }
    addToOutbox(job).catch(() => {})
    // Fire-and-forget — sendWithRetry owns retries/backoff and never blocks the
    // compose box, so the user is free to send more messages immediately, even on
    // a connection slow enough that this particular send takes several seconds.
    void sendWithRetry(job, (raw) => handleSendSuccess(raw, job))
  }, [text, crewId, userId, userProfile, isDM, addMessage, bumpCrewXP, setReplyTo, handleSendSuccess, clearComposerText, inputRef, profilesRef])

  // Retries a previously-failed send. Reads the original job back from the outbox by
  // tempId (persists across reloads, so this also works for a failed send resumed in
  // a later session) and resumes it through the exact same success path as a fresh send.
  const retrySend = useCallback((tempId: string) => {
    readOutbox(crewId).then((jobs) => {
      const job = jobs.find((j) => j.tempId === tempId)
      if (!job) return
      void sendWithRetry(job, (raw) => handleSendSuccess(raw, job))
    })
  }, [crewId, handleSendSuccess])

  // Register this crew's retry dispatcher so MessageBubble's "failed — tap to retry"
  // affordance can reach it despite living in a sibling component (MessageList).
  useEffect(() => {
    useChatStore.getState().setRequestRetrySend(retrySend)
    return () => {
      if (useChatStore.getState().requestRetrySend === retrySend) {
        useChatStore.getState().setRequestRetrySend(null)
      }
    }
  }, [retrySend])

  // Resume any sends still pending from a previous session (app killed or tab closed
  // mid-send) — reconstructs the optimistic bubble if it isn't already in the store
  // (a fresh page load never persisted it), then re-attempts exactly like a manual retry.
  useEffect(() => {
    let cancelled = false
    readOutbox(crewId).then((jobs) => {
      if (cancelled) return
      for (const job of jobs) {
        const exists = useChatStore.getState().messages.some((m) => m.id === job.tempId)
        if (!exists) {
          const optimisticMsg: MessageWithProfile = {
            id: job.tempId, crew_id: job.crewId, user_id: job.userId, content: job.content,
            message_type: job.messageType, element_type: null,
            xp_awarded: 1, reactions: {}, created_at: job.createdAt,
            profile: userProfile,
            reply_to_id: job.replyToId ?? null, reply_preview: job.replyPreview ?? null, reply_username: job.replyUsername ?? null,
            image_url: job.imageUrl ?? undefined, image_blur_hash: job.imageBlurHash ?? undefined,
            tempId: job.tempId, sendStatus: 'sending',
          }
          addMessage(optimisticMsg)
        }
        void sendWithRetry(job, (raw) => handleSendSuccess(raw, job))
      }
    })
    return () => { cancelled = true }
  }, [crewId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleEditSend = useCallback(async () => {
    const currentEdit = useChatStore.getState().editTo
    if (!currentEdit) return
    const newContent = sanitizeMessage(text)

    // Close edit mode immediately regardless of outcome
    setEditTo(null)
    clearComposerText()

    if (!newContent || newContent === currentEdit.content) return

    const prevContent = currentEdit.content
    const msgId       = currentEdit.id

    // Optimistic update
    updateMessage(msgId, { content: newContent })

    const supabase = createClient()
    const { error } = await supabase
      .from('messages')
      .update({ content: newContent })
      .eq('id', msgId)
      .eq('user_id', userId)

    if (error) {
      updateMessage(msgId, { content: prevContent })
      setSendError('Failed to edit message.')
    }
  }, [text, userId, updateMessage, setEditTo, clearComposerText])

  return {
    sendError, setSendError,
    pendingImages, pendingImagesRef, removePendingImage,
    chatImageInputRef, handleChatImagesPick,
    friendshipToast, gemToastVisible,
    send, sendImages, sendGif, handleEditSend,
  }
}
