'use client'

import { useEffect, useRef, useCallback } from 'react'
import { format, isToday, isYesterday, isSameDay } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { useChatStore } from '@/store/chatStore'
import { MessageBubble } from './MessageBubble'
import type { MessageWithProfile, Profile } from '@/types'

interface MessageListProps {
  crewId: string
  currentUserId: string
  initialMessages: MessageWithProfile[]
  memberProfiles: Record<string, Pick<Profile, 'id' | 'username' | 'avatar_class'>>
}

function dayLabel(date: Date): string {
  if (isToday(date))     return 'TODAY'
  if (isYesterday(date)) return 'YESTERDAY'
  return format(date, 'MMM d, yyyy').toUpperCase()
}

export function MessageList({
  crewId,
  currentUserId,
  initialMessages,
  memberProfiles,
}: MessageListProps) {
  const { messages, setMessages, addMessage } = useChatStore()
  const bottomRef = useRef<HTMLDivElement>(null)
  const profilesRef = useRef(memberProfiles)
  profilesRef.current = memberProfiles

  useEffect(() => {
    setMessages(initialMessages)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const resolveProfile = useCallback(
    (userId: string): Pick<Profile, 'id' | 'username' | 'avatar_class'> =>
      profilesRef.current[userId] ?? { id: userId, username: '???', avatar_class: null },
    []
  )

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`messages:${crewId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'messages',
          filter: `crew_id=eq.${crewId}`,
        },
        (payload) => {
          const raw = payload.new as Parameters<typeof addMessage>[0]
          const withProfile: MessageWithProfile = {
            ...raw,
            profile: resolveProfile(raw.user_id),
          }
          addMessage(withProfile)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [crewId, addMessage, resolveProfile])

  // Build display list with date dividers and grouping metadata
  type DisplayItem =
    | { kind: 'divider'; label: string; key: string }
    | { kind: 'message'; message: MessageWithProfile; isOwn: boolean; showHeader: boolean }

  const items: DisplayItem[] = []
  let lastDate: Date | null = null
  let lastUserId: string | null = null

  for (const msg of messages) {
    const msgDate = new Date(msg.created_at)

    if (!lastDate || !isSameDay(lastDate, msgDate)) {
      items.push({ kind: 'divider', label: dayLabel(msgDate), key: `divider-${msg.id}` })
      lastUserId = null
    }

    const showHeader = msg.message_type !== 'system' && msg.user_id !== lastUserId
    items.push({
      kind:       'message',
      message:    msg as MessageWithProfile,
      isOwn:      msg.user_id === currentUserId,
      showHeader,
    })

    lastDate   = msgDate
    lastUserId = msg.user_id
  }

  return (
    <div
      className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-2"
      style={{
        backgroundImage:
          'radial-gradient(circle, rgba(191,95,255,0.03) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}
    >
      {messages.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 opacity-40">
          <p className="font-pixel text-[9px] text-[#6b4f8f] text-center leading-relaxed">
            The crew is silent.<br />Send the first message.
          </p>
        </div>
      )}

      {items.map((item) => {
        if (item.kind === 'divider') {
          return (
            <div key={item.key} className="flex items-center gap-3 my-2">
              <div className="flex-1 border-t border-[#1a1a2e]" />
              <span className="font-pixel text-[7px] text-[#2a1545]">{item.label}</span>
              <div className="flex-1 border-t border-[#1a1a2e]" />
            </div>
          )
        }
        return (
          <MessageBubble
            key={item.message.id}
            message={item.message}
            isOwn={item.isOwn}
            showHeader={item.showHeader}
          />
        )
      })}

      <div ref={bottomRef} />
    </div>
  )
}
