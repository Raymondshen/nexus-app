'use client'

import { useState, useRef, useCallback } from 'react'
import { Send, Paperclip, Mic } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getElementType, calculateXP } from '@/lib/game/xp'
import { useChatStore } from '@/store/chatStore'
import { DamageFloat } from '@/components/game/DamageFloat'
import type { MessageWithProfile, Profile } from '@/types'

interface ChatInputProps {
  crewId: string
  userId: string
  userProfile: Pick<Profile, 'id' | 'username' | 'avatar_class'>
}

export function ChatInput({ crewId, userId, userProfile }: ChatInputProps) {
  const [text, setText]         = useState('')
  const [sending, setSending]   = useState(false)
  const [micTooltip, setMicTooltip] = useState(false)
  const [sendError, setSendError]   = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { addMessage, addXP, activeRaid, damageFloats, addDamageFloat, dismissDamageFloat } = useChatStore()

  const send = useCallback(async () => {
    const content = text.trim()
    if (!content || sending) return

    // Mark first message sent (triggers InstallPrompt after 10s)
    if (!localStorage.getItem('nexus_first_message')) {
      localStorage.setItem('nexus_first_message', String(Date.now()))
    }

    setSending(true)
    setSendError(null)
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    try {
      const supabase    = createClient()
      const elementType = getElementType(content, 'text')

      const { data: raw, error } = await supabase.rpc('insert_message', {
        p_crew_id:      crewId,
        p_content:      content,
        p_message_type: 'text',
      })
      if (error) throw error

      // Optimistic add to store
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

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const anonKey     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

      // XP edge function (fire-and-forget)
      fetch(`${supabaseUrl}/functions/v1/award-xp`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
        body: JSON.stringify({ message_id: raw.id, crew_id: crewId, user_id: userId, message_type: 'text', content }),
      }).catch(() => {})

      // Attack boss if raid is active
      if (activeRaid && !activeRaid.defeated_at) {
        fetch(`${supabaseUrl}/functions/v1/attack-boss`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
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
            }
          })
          .catch(() => {})
      }

    } catch (err) {
      setText(content)
      setSendError(err instanceof Error ? err.message : 'Failed to send.')
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }, [text, sending, crewId, userId, userProfile, addMessage, addXP, activeRaid, addDamageFloat])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  return (
    <div
      className="border-t border-[#1a1a2e] bg-[#080514] px-3 py-2 relative"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
    >
      {/* Damage floats */}
      <DamageFloat floats={damageFloats} onDismiss={dismissDamageFloat} />

      {sendError && (
        <p className="font-pixel text-[7px] text-[#ff4444] mb-1 px-1">{sendError}</p>
      )}

      {/* Active raid indicator */}
      {activeRaid && !activeRaid.defeated_at && (
        <div className="flex items-center gap-1 mb-1 px-1">
            <span
            className="inline-block w-1.5 h-1.5 rounded-full bg-[#ff2200] animate-pulse"
          />
          <span className="font-pixel text-[7px] text-[#ff4444]">
            ⚔ RAID ACTIVE — every message deals damage
          </span>
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-[#3d2660] hover:text-[#6b4f8f] transition-colors mb-0.5"
          aria-label="Attach image"
        >
          <Paperclip size={16} />
        </button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={activeRaid && !activeRaid.defeated_at ? 'Attack The Void...' : 'Send a message...'}
          rows={1}
          className="flex-1 bg-[#0f0820] border text-white font-sans placeholder:text-[#3a2555] px-3 py-2 resize-none focus:outline-none transition-colors leading-relaxed"
          style={{
            fontSize:    16,
            maxHeight:   120,
            borderColor: activeRaid && !activeRaid.defeated_at ? 'rgba(255,34,0,0.4)' : '#2a1545',
          }}
        />

        <div className="relative flex-shrink-0 mb-0.5">
          <button
            className="w-8 h-8 flex items-center justify-center text-[#2a1545] cursor-not-allowed"
            aria-label="Voice note — coming soon"
            onMouseEnter={() => setMicTooltip(true)}
            onMouseLeave={() => setMicTooltip(false)}
          >
            <Mic size={16} />
          </button>
          {micTooltip && (
            <div className="absolute bottom-full right-0 mb-1 whitespace-nowrap bg-[#1a0d2e] border border-[#2a1545] px-2 py-1">
              <span className="font-pixel text-[7px] text-[#6b4f8f]">COMING SOON</span>
            </div>
          )}
        </div>

        <button
          onClick={send}
          disabled={!text.trim() || sending}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-[#0a0612] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all mb-0.5 shadow-[2px_2px_0px_#7b2fa8] active:shadow-none active:translate-y-[1px]"
          style={{
            background: activeRaid && !activeRaid.defeated_at ? '#ff2200' : '#bf5fff',
            boxShadow:  activeRaid && !activeRaid.defeated_at ? '2px 2px 0px #880000' : '2px 2px 0px #7b2fa8',
          }}
          aria-label="Send message"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}
