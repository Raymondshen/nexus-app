'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Send } from 'lucide-react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { getElementType, calculateXP } from '@/lib/game/xp'
import { useChatStore } from '@/store/chatStore'
import { DamageFloat } from '@/components/game/DamageFloat'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/config'
import { haptic } from '@/lib/sounds'
import type { MessageWithProfile, Profile } from '@/types'

const MAX_MESSAGE_LENGTH = 2000
const RATE_LIMIT_MAX     = 30
const RATE_LIMIT_WINDOW  = 60_000 // 1 minute

interface ChatInputProps {
  crewId:      string
  userId:      string
  userProfile: Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url'>
}

function sanitizeMessage(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').trim().slice(0, MAX_MESSAGE_LENGTH)
}

export function ChatInput({ crewId, userId, userProfile }: ChatInputProps) {
  const [text,        setText]        = useState('')
  const [sending,   setSending]   = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [spawning,    setSpawning]    = useState(false)
  const [spawnError,  setSpawnError]  = useState<string | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const rateRef     = useRef({ count: 0, resetAt: Date.now() + RATE_LIMIT_WINDOW })
  const typingTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingChannelRef = useRef<RealtimeChannel | null>(null)

  const { addMessage, addXP, activeRaid, damageFloats, addDamageFloat, dismissDamageFloat } = useChatStore()
  const inRaid = !!(activeRaid && !activeRaid.defeated_at)

  // Typing presence channel
  useEffect(() => {
    const supabase = createClient()
    const channel  = supabase.channel(`typing:${crewId}`, {
      config: { presence: { key: userId } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ username: string; typing: boolean }>()
        const others = Object.entries(state)
          .filter(([key]) => key !== userId)
          .flatMap(([, presences]) => presences)
          .filter((p) => p.typing)
          .map((p) => p.username)
        setTypingUsers(others)
      })
      .subscribe()

    typingChannelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [crewId, userId])

  function broadcastTyping(isTyping: boolean) {
    typingChannelRef.current?.track({ username: userProfile.username, typing: isTyping })
  }

  const send = useCallback(async () => {
    const content = sanitizeMessage(text)
    if (!content || sending) return

    // Rate limit check
    const now = Date.now()
    if (now >= rateRef.current.resetAt) {
      rateRef.current = { count: 0, resetAt: now + RATE_LIMIT_WINDOW }
    }
    rateRef.current.count++
    if (rateRef.current.count > RATE_LIMIT_MAX) {
      setSendError('Slow down, warrior.')
      return
    }

    if (!localStorage.getItem('nexus_first_message')) {
      localStorage.setItem('nexus_first_message', String(Date.now()))
    }

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
        p_crew_id:      crewId,
        p_content:      content,
        p_message_type: 'text',
      })
      if (error) throw error

      const newMessage: MessageWithProfile = {
        id:           raw.id,
        crew_id:      raw.crew_id,
        user_id:      raw.user_id,
        content:      raw.content,
        message_type: raw.message_type,
        element_type: raw.element_type,
        xp_awarded:   raw.xp_awarded,
        created_at:   raw.created_at,
        profile:      userProfile,
      }
      addMessage(newMessage)
      addXP(calculateXP('text'))

      // XP edge function (fire-and-forget)
      fetch(`${SUPABASE_URL}/functions/v1/award-xp`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ message_id: raw.id, crew_id: crewId, user_id: userId, message_type: 'text', content }),
      }).catch(() => {})

      // Attack boss if raid is active
      if (activeRaid && !activeRaid.defeated_at) {
        fetch(`${SUPABASE_URL}/functions/v1/attack-boss`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
          body: JSON.stringify({
            crew_id:      crewId,
            user_id:      userId,
            message_type: 'text',
            element_type: elementType,
            content,
          }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.damage) {
              addDamageFloat(data.damage, elementType)
              haptic([10, 50, 10])
            }
          })
          .catch(() => {})
      }

    } catch (err) {
      setText(content)
      setSendError(err instanceof Error ? err.message : 'Failed to send. Tap to retry.')
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }, [text, sending, crewId, userId, userProfile, addMessage, addXP, activeRaid, addDamageFloat]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSpawnBoss() {
    if (spawning || inRaid) return
    setSpawning(true)
    setSpawnError(null)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''

      const res = await fetch('/api/test/spawn-boss', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ crew_id: crewId }),
      })
      let data: { error?: string; ok?: boolean } = {}
      try {
        data = await res.json()
      } catch {
        setSpawnError(`Server error ${res.status}`)
        return
      }
      if (!res.ok) setSpawnError(data.error ?? `Error ${res.status}`)
    } catch (err) {
      setSpawnError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setSpawning(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value.slice(0, MAX_MESSAGE_LENGTH)
    setText(val)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'

    // Broadcast typing (debounced stop after 3s)
    if (val.trim()) {
      broadcastTyping(true)
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      typingTimerRef.current = setTimeout(() => broadcastTyping(false), 3000)
    } else {
      broadcastTyping(false)
    }
  }

  function handleBlur() {
    broadcastTyping(false)
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
  }

  const typingLabel = typingUsers.length === 1
    ? `${typingUsers[0]} is typing...`
    : typingUsers.length === 2
      ? `${typingUsers[0]} and ${typingUsers[1]} are typing...`
      : typingUsers.length > 2
        ? 'Several warriors are typing...'
        : null

  return (
    <div
      className="border-t border-[#1a1a2e] bg-[#080514] px-3 py-2 relative flex-shrink-0"
    >
      {/* Damage floats */}
      <DamageFloat floats={damageFloats} onDismiss={dismissDamageFloat} />

      {sendError && (
        <button
          className="w-full font-pixel text-[7px] text-[#ff4444] mb-1 px-1 text-left"
          onClick={send}
        >
          ↺ {sendError}
        </button>
      )}

      {/* Typing indicator (raid only) */}
      {inRaid && typingLabel && (
        <div className="flex items-center gap-1 mb-1 px-1">
          <span className="flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="inline-block w-1 h-1 rounded-full bg-[#bf5fff] animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </span>
          <span className="font-pixel text-[7px] text-[#6b4f8f]">{typingLabel}</span>
        </div>
      )}

      {/* Active raid indicator */}
      {inRaid && !typingLabel && (
        <div className="flex items-center gap-1 mb-1 px-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#ff2200] animate-pulse" />
          <span className="font-pixel text-[7px] text-[#ff4444]">
            ⚔ RAID ACTIVE — every message deals damage
          </span>
        </div>
      )}

      {/* Dev: spawn boss button — visible when no raid is active */}
      {!inRaid && (
        <div className="flex items-center gap-2 mb-1 px-1">
          <button
            onClick={handleSpawnBoss}
            disabled={spawning}
            className="font-pixel text-[7px] px-2 py-0.5 border border-[#ff4444]/40 text-[#ff4444]/70 hover:text-[#ff4444] hover:border-[#ff4444] transition-colors disabled:opacity-40"
          >
            {spawning ? 'SPAWNING...' : '⚔ SPAWN BOSS'}
          </button>
          {spawnError && (
            <span className="font-pixel text-[7px] text-[#ff4444]/60">{spawnError}</span>
          )}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={inRaid ? 'Attack The Void...' : 'Send a message...'}
          rows={1}
          className="flex-1 bg-[#0f0820] border text-white font-sans placeholder:text-[#3a2555] px-3 py-2 resize-none focus:outline-none transition-colors leading-relaxed"
          style={{
            fontSize:    16,
            maxHeight:   120,
            borderColor: inRaid ? 'rgba(255,34,0,0.4)' : '#2a1545',
          }}
        />

        <button
          onClick={send}
          disabled={!text.trim() || sending}
          className="flex-shrink-0 flex items-center justify-center text-[#0a0612] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all mb-0.5 active:translate-y-[1px]"
          style={{
            minWidth:  44,
            minHeight: 44,
            background: inRaid ? '#ff2200' : '#bf5fff',
            boxShadow:  inRaid ? '2px 2px 0px #880000' : '2px 2px 0px #7b2fa8',
          }}
          aria-label="Send message"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}
