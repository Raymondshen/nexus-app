'use client'

import { useState, useRef } from 'react'
import { format, isToday, isYesterday } from 'date-fns'
import type { MessageWithProfile, ElementType } from '@/types'

const ELEMENT_COLORS: Record<ElementType, string> = {
  fire:      '#ff4444',
  water:     '#00e5ff',
  lightning: '#ffd700',
  nature:    '#66bb6a',
  shadow:    '#bf5fff',
  arcane:    '#00e5ff',
}

const ELEMENT_LABELS: Record<ElementType, string> = {
  fire:      'FIRE',
  water:     'WATER',
  lightning: 'LIGHTNING',
  nature:    'NATURE',
  shadow:    'SHADOW',
  arcane:    'ARCANE',
}

const REACTIONS = ['⚔️', '🔥', '💀', '✨']

function formatTimestamp(date: Date): string {
  const timeStr = format(date, 'h:mm a')
  if (isToday(date))     return `Today at ${timeStr}`
  if (isYesterday(date)) return `Yesterday at ${timeStr}`
  return `${format(date, 'EEE')} at ${timeStr}`
}

interface MessageBubbleProps {
  message: MessageWithProfile
  isOwn: boolean
  showHeader: boolean
}

export function MessageBubble({ message, isOwn, showHeader }: MessageBubbleProps) {
  const [showTime,      setShowTime]      = useState(false)
  const [showReactions, setShowReactions] = useState(false)
  const [copied,        setCopied]        = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleTouchStart() {
    longPressTimer.current = setTimeout(() => setShowReactions(true), 500)
  }

  function handleTouchEnd() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard unavailable
    }
    setShowReactions(false)
  }

  if (message.message_type === 'system') {
    return <SystemMessage message={message} />
  }

  const initial = message.profile.username[0]?.toUpperCase() ?? '?'
  const elementColor = message.element_type ? ELEMENT_COLORS[message.element_type] : null

  return (
    <div
      className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
      onContextMenu={(e) => { e.preventDefault(); setShowReactions(true) }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
    >
      {/* Avatar — only shown for received messages */}
      {!isOwn && (
        <div
          className="w-7 h-7 flex-shrink-0 flex items-center justify-center bg-[#2a1545] border border-[#3d2660] font-pixel text-[9px] text-[#bf5fff]"
          style={{ visibility: showHeader ? 'visible' : 'hidden' }}
        >
          {initial}
        </div>
      )}

      <div className={`flex flex-col gap-1 max-w-[72%] ${isOwn ? 'items-end' : 'items-start'}`}>
        {showHeader && !isOwn && (
          <span className="font-pixel text-[8px] text-[#6b4f8f] px-1">
            {message.profile.username}
          </span>
        )}

        <div className="relative group">
          <div
            className={`
              px-3 py-2 text-sm leading-relaxed font-sans text-white
              ${isOwn
                ? 'bg-[#2d1b69] border border-[#4a2d9e]'
                : 'bg-[#1a1a2e] border border-[#2a2a4a]'
              }
            `}
            onClick={() => setShowTime((v) => !v)}
          >
            {message.content}

            {/* Element dot */}
            {elementColor && (
              <span
                className="inline-block w-1.5 h-1.5 rounded-full ml-2 align-middle flex-shrink-0"
                style={{ backgroundColor: elementColor }}
                title={message.element_type ? ELEMENT_LABELS[message.element_type] : ''}
              />
            )}
          </div>

          {/* Timestamp on tap */}
          {showTime && (
            <div className={`absolute -bottom-5 ${isOwn ? 'right-0' : 'left-0'} whitespace-nowrap`}>
              <span className="font-pixel text-[7px] text-[#3d2660]">
                {formatTimestamp(new Date(message.created_at))}
              </span>
            </div>
          )}
        </div>

        {/* Reaction + copy picker */}
        {showReactions && (
          <div className="flex gap-1 bg-[#0f0820] border border-[#2a1545] px-2 py-1">
            {REACTIONS.map((r) => (
              <button
                key={r}
                className="text-base hover:scale-110 transition-transform"
                onClick={() => setShowReactions(false)}
              >
                {r}
              </button>
            ))}
            <button
              className="font-pixel text-[7px] text-[#3d2660] hover:text-[#00e5ff] ml-1 px-1 transition-colors"
              onClick={handleCopy}
            >
              {copied ? '✓' : 'COPY'}
            </button>
            <button
              className="font-pixel text-[8px] text-[#3d2660] ml-1"
              onClick={() => setShowReactions(false)}
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function SystemMessage({ message }: { message: MessageWithProfile }) {
  const content = message.content

  let bg = 'bg-[#1a1a2e] border-[#2a2a4a]'
  let icon = '⚙️'

  if (content.includes('VOID') || content.includes('BOSS') || content.includes('boss')) {
    bg = 'bg-[#2d0a0a] border-[#ff4444]/40'
    icon = '💀'
  } else if (content.includes('XP') || content.includes('xp')) {
    bg = 'bg-[#1a1400] border-[#ffd700]/40'
    icon = '⭐'
  } else if (content.includes('artifact') || content.includes('ARTIFACT')) {
    bg = 'bg-[#1a0d2e] border-[#bf5fff]/40'
    icon = '💎'
  }

  return (
    <div className="flex justify-center my-2">
      <div className={`border px-4 py-2 max-w-[85%] text-center ${bg}`}>
        <p className="font-pixel text-[9px] text-[#9b8ab0] leading-relaxed">
          {icon} {content}
        </p>
      </div>
    </div>
  )
}
