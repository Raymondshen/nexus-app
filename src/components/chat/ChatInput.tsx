'use client'

import { useState, useRef, useCallback } from 'react'
import { Send, Paperclip, Mic } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getElementType, calculateXP } from '@/lib/game/xp'
import { useChatStore } from '@/store/chatStore'

interface ChatInputProps {
  crewId: string
  userId: string
}

export function ChatInput({ crewId, userId }: ChatInputProps) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [micTooltip, setMicTooltip] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const addXP = useChatStore((s) => s.addXP)

  const send = useCallback(async () => {
    const content = text.trim()
    if (!content || sending) return

    setSending(true)
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    try {
      const supabase = createClient()
      const elementType = getElementType(content, 'text')

      const { data: message, error } = await supabase
        .from('messages')
        .insert({
          crew_id:      crewId,
          user_id:      userId,
          content,
          message_type: 'text',
          element_type: elementType,
          xp_awarded:   calculateXP('text'),
        })
        .select()
        .single()

      if (error) throw error

      // Fire-and-forget XP edge function
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      fetch(`${supabaseUrl}/functions/v1/award-xp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
        },
        body: JSON.stringify({
          message_id:   message.id,
          crew_id:      crewId,
          user_id:      userId,
          message_type: 'text',
          content,
        }),
      })
        .then((r) => r.json())
        .then((data) => { if (data.xp_awarded) addXP(data.xp_awarded) })
        .catch(() => { /* non-critical */ })
    } catch {
      setText(content)
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }, [text, sending, crewId, userId, addXP])

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
      className="border-t border-[#1a1a2e] bg-[#080514] px-3 py-2 safe-area-bottom"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
    >
      <div className="flex items-end gap-2">
        {/* Attachment */}
        <button
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-[#3d2660] hover:text-[#6b4f8f] transition-colors mb-0.5"
          aria-label="Attach image"
        >
          <Paperclip size={16} />
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Send a message..."
          rows={1}
          className="flex-1 bg-[#0f0820] border border-[#2a1545] text-white text-sm font-sans placeholder:text-[#3a2555] px-3 py-2 resize-none focus:outline-none focus:border-[#bf5fff]/60 transition-colors leading-relaxed"
          style={{ maxHeight: 120 }}
        />

        {/* Mic — disabled */}
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

        {/* Send */}
        <button
          onClick={send}
          disabled={!text.trim() || sending}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-[#bf5fff] text-[#0a0612] hover:bg-[#d080ff] disabled:opacity-40 disabled:cursor-not-allowed transition-colors mb-0.5 shadow-[2px_2px_0px_#7b2fa8] active:shadow-none active:translate-y-[1px]"
          aria-label="Send message"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}
