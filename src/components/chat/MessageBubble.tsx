'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { format } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import { useChatStore } from '@/store/chatStore'
import { spriteIdFor } from '@/components/game/PixelSprite'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/config'
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

// Six quick-pick emojis mapped to the element system
const QUICK_REACTIONS = ['🔥', '💧', '⚡', '🌿', '🌑', '🔮'] as const

type ReactResponse = {
  reactions:      Record<string, string[]>
  hype_man_heal:  boolean
  heal_amount:    number
  error?:         string
}

// Returns the first grapheme cluster — handles multi-codepoint emoji sequences.
function getFirstGrapheme(str: string): string {
  if (!str) return ''
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    return [...seg.segment(str)][0]?.segment ?? ''
  } catch {
    return [...str][0] ?? ''
  }
}

interface MessageBubbleProps {
  message:        MessageWithProfile
  isOwn:          boolean
  showHeader:     boolean
  currentUserId:  string
  xpOverride?:    number
  coinOverride?:  number
  onAvatarTap?:   (userId: string) => void
}

export function MessageBubble({
  message,
  isOwn,
  showHeader,
  currentUserId,
  xpOverride,
  coinOverride,
  onAvatarTap,
}: MessageBubbleProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [copied,     setCopied]     = useState(false)
  const [healFloat,  setHealFloat]  = useState<{ id: number; amount: number } | null>(null)

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pickerRef      = useRef<HTMLDivElement>(null)
  const emojiInputRef  = useRef<HTMLInputElement>(null)

  const onlineUserIds = useChatStore((s) => s.onlineUserIds)
  const updateMessage = useChatStore((s) => s.updateMessage)

  // Close picker when user taps outside it — delayed 100 ms so the same
  // long-press that opened it doesn't immediately close it.
  useEffect(() => {
    if (!pickerOpen) return
    let attached = false
    function onOutside(e: MouseEvent | TouchEvent) {
      if (!attached) return
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    const t = setTimeout(() => {
      attached = true
      document.addEventListener('mousedown', onOutside)
      document.addEventListener('touchstart', onOutside)
    }, 100)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('touchstart', onOutside)
    }
  }, [pickerOpen])

  // ─── XP count-up ────────────────────────────────────────────────────────────
  const xpTarget = xpOverride ?? message.xp_awarded ?? 0
  const [displayXP,  setDisplayXP]  = useState(xpTarget)
  const displayXPRef = useRef(xpTarget)

  useEffect(() => {
    const start = displayXPRef.current
    const end   = xpTarget
    if (start === end) return
    const duration  = 500
    const startTime = performance.now()
    let raf: number
    function step(now: number) {
      const t     = Math.min((now - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      const val   = Math.round(start + (end - start) * eased)
      displayXPRef.current = val
      setDisplayXP(val)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [xpTarget]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Coin count-up ──────────────────────────────────────────────────────────
  const coinTarget = coinOverride ?? ((message.xp_awarded ?? 0) > 0 ? 1 : 0)
  const [displayCoins,  setDisplayCoins]  = useState(coinTarget)
  const displayCoinsRef = useRef(coinTarget)

  useEffect(() => {
    const start = displayCoinsRef.current
    const end   = coinTarget
    if (start === end) return
    const duration  = 500
    const startTime = performance.now()
    let raf: number
    function step(now: number) {
      const t     = Math.min((now - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      const val   = Math.round(start + (end - start) * eased)
      displayCoinsRef.current = val
      setDisplayCoins(val)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [coinTarget]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Long-press handlers ────────────────────────────────────────────────────
  function handleTouchStart() {
    longPressTimer.current = setTimeout(() => setPickerOpen(true), 500)
  }
  function handleTouchEnd() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }

  // ─── Copy ───────────────────────────────────────────────────────────────────
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable */ }
    setPickerOpen(false)
  }

  // ─── Reaction toggle (optimistic + rollback) ─────────────────────────────────
  const handleReaction = useCallback(async (emoji: string) => {
    setPickerOpen(false)

    const prev     = message.reactions ?? {}
    const users    = prev[emoji] ?? []
    const isActive = users.includes(currentUserId)

    const nextUsers = isActive
      ? users.filter((id) => id !== currentUserId)
      : [...users, currentUserId]

    const next = { ...prev }
    if (nextUsers.length === 0) delete next[emoji]
    else next[emoji] = nextUsers

    // Optimistic
    updateMessage(message.id, { reactions: next })

    try {
      const res  = await fetch(`${SUPABASE_URL}/functions/v1/react-to-message`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body:    JSON.stringify({ message_id: message.id, emoji, user_id: currentUserId, crew_id: message.crew_id }),
      })
      const data = await res.json() as ReactResponse
      if (!res.ok) throw new Error(data.error ?? 'reaction failed')

      // Confirm with server state
      updateMessage(message.id, { reactions: data.reactions })

      if (data.hype_man_heal && data.heal_amount > 0) {
        setHealFloat({ id: Date.now(), amount: data.heal_amount })
      }
    } catch {
      // Rollback to pre-optimistic state
      updateMessage(message.id, { reactions: prev })
    }
  }, [message.id, message.crew_id, message.reactions, currentUserId, updateMessage])

  // ─── Native emoji picker (hidden input) ─────────────────────────────────────
  function handlePickEmoji() {
    emojiInputRef.current?.focus()
  }

  function handleNativeEmojiInput(e: React.FormEvent<HTMLInputElement>) {
    const value = (e.target as HTMLInputElement).value
    if (!value) return
    const grapheme = getFirstGrapheme(value)
    ;(e.target as HTMLInputElement).value = ''
    if (grapheme) void handleReaction(grapheme)
  }

  // ─── System messages ────────────────────────────────────────────────────────
  if (message.message_type === 'system') {
    return <SystemMessage message={message} />
  }

  const initial   = message.profile.username[0]?.toUpperCase() ?? '?'
  const avatarUrl = message.profile.avatar_url as string | null | undefined
  const className = message.profile.avatar_class ? CLASS_NAMES[message.profile.avatar_class] : null
  const spriteId  = spriteIdFor(message.profile.avatar_class)
  const isOnline  = onlineUserIds.has(message.user_id)
  const timeStr   = format(new Date(message.created_at), 'h:mma').toLowerCase()

  const reactions      = message.reactions ?? {}
  const sortedReactions = Object.entries(reactions)
    .filter(([, users]) => users.length > 0)
    .sort(([, a], [, b]) => b.length - a.length)

  return (
    <div
      className={`flex gap-2 items-start w-full ${showHeader ? 'pt-[var(--space-5)] pb-0' : 'pt-[var(--space-2)] pb-0'}`}
      onContextMenu={(e) => { e.preventDefault(); setPickerOpen(true) }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
    >
      {/* Avatar — only rendered for the first message in a group */}
      {showHeader && (
        <div
          className="relative flex-shrink-0"
          onClick={onAvatarTap ? () => onAvatarTap(message.user_id) : undefined}
          style={onAvatarTap ? { cursor: 'pointer' } : undefined}
        >
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
            <div className="flex items-start gap-1 flex-1 min-w-0">
              <span
                className={`font-body font-medium text-[12px] tracking-[0.1px] shrink-0 leading-[normal] whitespace-nowrap ${
                  isOwn ? 'text-purple' : 'text-primary'
                }`}
                style={{ fontVariationSettings: '"opsz" 14', cursor: onAvatarTap ? 'pointer' : undefined }}
                onClick={onAvatarTap ? () => onAvatarTap(message.user_id) : undefined}
              >
                {message.profile.username}
              </span>

              {(spriteId || className) && (
                <>
                  <span className="w-[2px] h-[2px] bg-purple shrink-0 mt-[5px]" />
                  <div className="flex items-center gap-0 shrink-0 mt-[-5px]">
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
                  <span className="w-[2px] h-[2px] bg-purple shrink-0 mt-[5px]" />
                  <p className="font-silkscreen tracking-[0.1px] whitespace-nowrap leading-[0] text-[0px] shrink-0">
                    <span className="text-[8px] leading-[normal]" style={{ color: '#f59e0b' }}>
                      +{displayXP} XP
                    </span>
                  </p>
                </>
              )}

              {displayCoins > 0 && (
                <>
                  <span className="w-[2px] h-[2px] bg-purple shrink-0 mt-[5px]" />
                  <p className="font-silkscreen tracking-[0.1px] whitespace-nowrap leading-[0] text-[0px] shrink-0">
                    <span className="text-[8px] leading-[normal]" style={{ color: '#ffd700' }}>
                      <i className="hn hn-coin" style={{ fontSize: 8 }} aria-hidden="true" />+{displayCoins}
                    </span>
                  </p>
                </>
              )}
            </div>

            {/* Timestamp */}
            <span
              className="font-body font-normal text-[8px] tracking-[0.2px] shrink-0 leading-[normal] whitespace-nowrap ml-1"
              style={{ color: 'var(--color-paper-200)', fontVariationSettings: '"opsz" 14' }}
            >
              {timeStr}
            </span>
          </div>
        )}

        {/* Message body */}
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

        {/* ── Reaction picker (long-press / right-click menu) ──────────────── */}
        {pickerOpen && (
          <div
            ref={pickerRef}
            className="flex flex-wrap items-center gap-1 bg-surface border border-border px-2 py-1.5 mt-1"
            style={{ maxWidth: 'calc(100vw - 2rem)' }}
          >
            {QUICK_REACTIONS.map((emoji) => {
              const active = (reactions[emoji] ?? []).includes(currentUserId)
              return (
                <button
                  key={emoji}
                  onClick={() => void handleReaction(emoji)}
                  className={`text-lg px-0.5 py-0 transition-transform active:scale-95 select-none ${
                    active ? 'scale-110' : 'opacity-70 hover:opacity-100 hover:scale-110'
                  }`}
                >
                  {emoji}
                </button>
              )
            })}

            {/* + button: opens native device emoji keyboard */}
            <button
              className="font-pixel text-[9px] text-[#00e5ff] px-1.5 py-0.5 border border-[#00e5ff]/30 hover:border-[#00e5ff] transition-colors ml-0.5"
              onClick={handlePickEmoji}
            >
              +
            </button>

            {/* Spacer */}
            <span className="flex-1" />

            {/* Copy */}
            <button
              className="font-pixel text-[7px] text-tertiary hover:text-[#00e5ff] px-1 transition-colors"
              onClick={handleCopy}
            >
              {copied ? '✓' : 'COPY'}
            </button>

            {/* Close */}
            <button
              className="font-pixel text-[8px] text-tertiary ml-1"
              onClick={() => setPickerOpen(false)}
            >
              ✕
            </button>

            {/* Hidden input — focused by handlePickEmoji to surface the native emoji keyboard */}
            <input
              ref={emojiInputRef}
              type="text"
              aria-hidden="true"
              tabIndex={-1}
              style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: 1, height: 1, opacity: 0.01 }}
              onInput={handleNativeEmojiInput}
            />
          </div>
        )}

        {/* ── Reaction chips ───────────────────────────────────────────────── */}
        {sortedReactions.length > 0 && (
          <div className="relative flex flex-wrap gap-1 mt-1">

            {/* Hype Man heal float — animates upward from chip row */}
            <AnimatePresence>
              {healFloat && (
                <motion.div
                  key={healFloat.id}
                  initial={{ opacity: 0, y: 0 }}
                  animate={{ opacity: [0, 1, 1, 0], y: [0, -8, -22, -36] }}
                  transition={{ duration: 1.2, ease: 'easeOut', times: [0, 0.15, 0.65, 1] }}
                  onAnimationComplete={() => setHealFloat(null)}
                  className="pointer-events-none absolute -top-3 left-0 z-10"
                >
                  <span
                    className="font-pixel text-[10px] font-bold"
                    style={{ color: '#66bb6a', textShadow: '0 0 8px rgba(102,187,106,0.8)' }}
                  >
                    +{healFloat.amount} HEAL
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {sortedReactions.map(([emoji, users]) => {
              const active = users.includes(currentUserId)
              return (
                <button
                  key={emoji}
                  onClick={() => void handleReaction(emoji)}
                  className={`flex items-center gap-1 px-2 py-0.5 border text-[13px] leading-none transition-colors select-none ${
                    active
                      ? 'bg-[rgba(191,95,255,0.15)] border-[#bf5fff]'
                      : 'bg-surface border-border'
                  }`}
                >
                  <span>{emoji}</span>
                  <span className={`font-silkscreen text-[9px] leading-none ${active ? 'text-[#bf5fff]' : 'text-tertiary'}`}>
                    {users.length}
                  </span>
                </button>
              )
            })}
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
