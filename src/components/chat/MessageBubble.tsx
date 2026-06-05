'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { format } from 'date-fns'
import { useChatStore } from '@/store/chatStore'
import { spriteIdFor } from '@/components/game/PixelSprite'
import type { MessageWithProfile, AvatarClass } from '@/types'

const CLASS_NAMES: Record<AvatarClass, string> = {
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

const REACTIONS = ['⚔️', '🔥', '💀', '✨']

interface MessageBubbleProps {
  message:     MessageWithProfile
  isOwn:       boolean
  showHeader:  boolean
  xpOverride?: number  // accumulated group XP for the group-leader bubble
}

export function MessageBubble({ message, isOwn, showHeader, xpOverride }: MessageBubbleProps) {
  const [showReactions, setShowReactions] = useState(false)
  const [copied,        setCopied]        = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onlineUserIds = useChatStore((s) => s.onlineUserIds)

  // XP to display — group-accumulated value when available
  const xpTarget = xpOverride ?? message.xp_awarded ?? 0
  const [displayXP, setDisplayXP] = useState(xpTarget)
  const displayXPRef = useRef(xpTarget)

  // Count-up animation when accumulated group XP increases
  useEffect(() => {
    const start = displayXPRef.current
    const end   = xpTarget
    if (start === end) return
    const duration  = 500
    const startTime = performance.now()
    let raf: number
    function step(now: number) {
      const t = Math.min((now - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      const val = Math.round(start + (end - start) * eased)
      displayXPRef.current = val
      setDisplayXP(val)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [xpTarget]) // eslint-disable-line react-hooks/exhaustive-deps

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
    } catch { /* clipboard unavailable */ }
    setShowReactions(false)
  }

  if (message.message_type === 'system') {
    return <SystemMessage message={message} />
  }

  const initial   = message.profile.username[0]?.toUpperCase() ?? '?'
  const avatarUrl = message.profile.avatar_url as string | null | undefined
  const className = message.profile.avatar_class ? CLASS_NAMES[message.profile.avatar_class] : null
  const spriteId  = spriteIdFor(message.profile.avatar_class)
  const isOnline  = onlineUserIds.has(message.user_id)
  // "9:30pm" — lowercase, no space
  const timeStr   = format(new Date(message.created_at), 'h:mma').toLowerCase()

  return (
    <div
      className={`flex gap-2 items-start w-full ${showHeader ? 'pt-[var(--space-5)] pb-0' : 'pt-[var(--space-2)] pb-0'}`}
      onContextMenu={(e) => { e.preventDefault(); setShowReactions(true) }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
    >
      {/* Avatar — only rendered for the first message in a group */}
      {showHeader && (
        <div className="relative flex-shrink-0">
          <div className="w-8 h-8 bg-surface flex items-center justify-center overflow-hidden">
            {avatarUrl ? (
              <div className="relative w-full h-full">
                <Image src={avatarUrl} alt={message.profile.username} fill sizes="32px" className="object-cover" />
              </div>
            ) : (
              <span className="font-pixel text-[8px] text-purple">{initial}</span>
            )}
          </div>
          {isOnline && (
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#66bb6a] border-[1.5px] border-black" />
          )}
        </div>
      )}

      {/* Message content — pl-10 (32px avatar + 8px gap) aligns continuation text */}
      <div className={`flex-1 min-w-0 flex flex-col gap-0 ${!showHeader ? 'pl-10' : ''}`}>

        {/* Header row: [username · class · xp] [timestamp] */}
        {showHeader && (
          <div className="flex items-center justify-between w-full">

            {/* Left meta: username · sprite · class · xp */}
            <div className="flex items-center gap-1 flex-1 min-w-0">
              {/* Username — DM Sans Medium 12px, leading: normal */}
              <span
                className={`font-body font-medium text-[12px] tracking-[0.1px] shrink-0 leading-[normal] whitespace-nowrap ${
                  isOwn ? 'text-purple' : 'text-primary'
                }`}
                style={{ fontVariationSettings: '"opsz" 14' }}
              >
                {message.profile.username}
              </span>

              {(spriteId || className) && (
                <>
                  {/* 2×2 purple dot separator */}
                  <span className="w-[2px] h-[2px] bg-purple shrink-0" />
                  {/* Sprite + class name grouped with gap-0 — Figma node 48:105 */}
                  <div className="flex items-center gap-0 shrink-0">
                    {/* Sprite: 24×24px layout slot, 36×36px render — Figma node 48:106 / 48:103 */}
                    {spriteId && (
                      <div className="relative shrink-0 size-[24px]">
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[36px]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/sprites/${spriteId}/south.png`}
                            alt=""
                            className="absolute inset-0 size-full max-w-none pointer-events-none"
                            style={{ imageRendering: 'pixelated' }}
                          />
                        </div>
                      </div>
                    )}
                    {/* Class name — DM Sans Regular 10px, leading: normal */}
                    {className && (
                      <span
                        className="font-body font-normal text-[10px] tracking-[0.1px] shrink-0 leading-[normal] whitespace-nowrap"
                        style={{ color: 'var(--color-paper-150)', fontVariationSettings: '"opsz" 14' }}
                      >
                        {className}
                      </span>
                    )}
                  </div>
                </>
              )}

              {displayXP > 0 && (
                <>
                  <span className="w-[2px] h-[2px] bg-purple shrink-0" />
                  {/* Outer leading-[0] collapses the block; inner spans use leading-[normal] */}
                  <p className="font-silkscreen tracking-[0.1px] whitespace-nowrap leading-[0] text-[0px] shrink-0">
                    <span className="text-[8px] leading-[normal]" style={{ color: '#f59e0b' }}>
                      +{displayXP} XP
                    </span>
                  </p>
                </>
              )}
            </div>

            {/* Timestamp — DM Sans Regular 8px paper-200, leading: normal */}
            <span
              className="font-body font-normal text-[8px] tracking-[0.2px] shrink-0 leading-[normal] whitespace-nowrap ml-1"
              style={{ color: 'var(--color-paper-200)', fontVariationSettings: '"opsz" 14' }}
            >
              {timeStr}
            </span>
          </div>
        )}

        {/* Message text — DM Sans Regular 14px white */}
        {message.message_type === 'image' ? (
          <div className="relative w-[220px] h-[165px] mt-1">
            <Image src={message.content} alt="shared image" fill sizes="220px" className="object-cover" />
          </div>
        ) : (
          <p
            className="font-body font-normal text-[14px] text-white leading-[normal] w-full"
            style={{ fontVariationSettings: '"opsz" 14' }}
          >
            {message.content}
          </p>
        )}

        {/* Long-press reaction/copy picker */}
        {showReactions && (
          <div className="flex gap-1 bg-surface border border-border px-2 py-1 mt-1">
            {REACTIONS.map((r) => (
              <button key={r} className="text-base hover:scale-110 transition-transform" onClick={() => setShowReactions(false)}>
                {r}
              </button>
            ))}
            <button className="font-pixel text-[7px] text-tertiary hover:text-[#00e5ff] ml-1 px-1 transition-colors" onClick={handleCopy}>
              {copied ? '✓' : 'COPY'}
            </button>
            <button className="font-pixel text-[8px] text-tertiary ml-1" onClick={() => setShowReactions(false)}>✕</button>
          </div>
        )}
      </div>
    </div>
  )
}

function SystemMessage({ message }: { message: MessageWithProfile }) {
  const content = message.content
  let bg   = 'bg-surface border-border'
  let icon = '⚙️'
  if (content.includes('VOID') || content.includes('BOSS') || content.includes('boss')) { bg = 'bg-[#2d0a0a] border-[#ff4444]/40'; icon = '💀' }
  else if (content.includes('XP') || content.includes('xp'))                            { bg = 'bg-[#1a1400] border-[#ffd700]/40'; icon = '⭐' }
  else if (content.includes('artifact') || content.includes('ARTIFACT'))                { bg = 'bg-[#1a0d2e] border-[#bf5fff]/40'; icon = '💎' }
  return (
    <div className="flex justify-center my-2">
      <div className={`border px-4 py-2 max-w-[85%] text-center ${bg}`}>
        <p className="font-pixel text-[9px] text-tertiary leading-relaxed">{icon} {content}</p>
      </div>
    </div>
  )
}
