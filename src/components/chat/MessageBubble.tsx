'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { isSupabaseStorage, resolveAvatarUrl } from '@/components/ui/Avatar'
import { format } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import { useChatStore } from '@/store/chatStore'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/config'
import type { MessageWithProfile, AvatarClass } from '@/types'
import { PollCard } from '@/components/chat/PollCard'

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

const QUICK_REACTIONS = ['🔥', '💧', '⚡', '🌿', '🌑', '🔮'] as const

type ReactResponse = {
  reactions:     Record<string, string[]>
  hype_man_heal: boolean
  heal_amount:   number
  error?:        string
}

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
  message:       MessageWithProfile
  isOwn:         boolean
  showHeader:    boolean
  currentUserId: string
  xpOverride?:   number
  coinOverride?:  number
  onAvatarTap?:  (userId: string) => void
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
  const [sheetOpen,  setSheetOpen]  = useState(false)
  const [copied,     setCopied]     = useState(false)
  const [healFloat,  setHealFloat]  = useState<{ id: number; amount: number } | null>(null)
  const [mounted,    setMounted]    = useState(false)

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasMoved       = useRef(false)
  const emojiInputRef  = useRef<HTMLInputElement>(null)

  const onlineUserIds = useChatStore((s) => s.onlineUserIds)
  const updateMessage = useChatStore((s) => s.updateMessage)

  useEffect(() => { setMounted(true) }, [])

  // ─── XP count-up ────────────────────────────────────────────────────────────
  const xpTarget    = xpOverride ?? message.xp_awarded ?? 0
  const [displayXP, setDisplayXP] = useState(xpTarget)
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
  const [_displayCoins, setDisplayCoins] = useState(coinTarget)
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

  // ─── Long-press handlers (500 ms, cancelled on scroll) ──────────────────────
  function handleTouchStart() {
    hasMoved.current = false
    longPressTimer.current = setTimeout(() => {
      if (!hasMoved.current) setSheetOpen(true)
    }, 300)
  }
  function handleTouchEnd() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }
  function handleTouchMove() {
    hasMoved.current = true
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }

  // ─── Copy ───────────────────────────────────────────────────────────────────
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => { setCopied(false); setSheetOpen(false) }, 800)
    } catch {
      setSheetOpen(false)
    }
  }

  // ─── Reaction toggle (optimistic + rollback) ─────────────────────────────────
  const handleReaction = useCallback(async (emoji: string) => {
    setSheetOpen(false)

    const prev     = message.reactions ?? {}
    const users    = prev[emoji] ?? []
    const isActive = users.includes(currentUserId)

    const nextUsers = isActive
      ? users.filter((id) => id !== currentUserId)
      : [...users, currentUserId]

    const next = { ...prev }
    if (nextUsers.length === 0) delete next[emoji]
    else next[emoji] = nextUsers

    updateMessage(message.id, { reactions: next })

    try {
      const res  = await fetch(`${SUPABASE_URL}/functions/v1/react-to-message`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body:    JSON.stringify({ message_id: message.id, emoji, user_id: currentUserId, crew_id: message.crew_id }),
      })
      const data = await res.json() as ReactResponse
      if (!res.ok) throw new Error(data.error ?? 'reaction failed')

      updateMessage(message.id, { reactions: data.reactions })

      if (data.hype_man_heal && data.heal_amount > 0) {
        setHealFloat({ id: Date.now(), amount: data.heal_amount })
      }
    } catch (err) {
      console.error('[react-to-message]', err)
      updateMessage(message.id, { reactions: prev })
    }
  }, [message.id, message.crew_id, message.reactions, currentUserId, updateMessage])

  // ─── Native emoji keyboard (hidden input) ───────────────────────────────────
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

  // ─── Poll messages ───────────────────────────────────────────────────────────
  if (message.message_type === 'poll') {
    const pollId = message.content.startsWith('POLL:') ? message.content.slice(5) : null
    if (!pollId) return null

    const pollAvatarUrl = message.profile.avatar_url as string | null | undefined
    const pollInitial   = message.profile.username[0]?.toUpperCase() ?? '?'
    const pollClassName = message.profile.avatar_class ? CLASS_NAMES[message.profile.avatar_class] : null
    const pollIsOnline  = onlineUserIds.has(message.user_id)
    const pollTimeStr   = format(new Date(message.created_at), 'h:mma').toLowerCase()

    return (
      <div className={`flex gap-[8px] items-start w-full ${showHeader ? 'pt-[var(--space-6)] pb-0' : 'pt-[var(--space-2)] pb-0'}`}>
        {showHeader && (
          <div
            className="relative flex-shrink-0"
            onClick={onAvatarTap ? () => onAvatarTap(message.user_id) : undefined}
            style={onAvatarTap ? { cursor: 'pointer' } : undefined}
          >
            <div className="w-8 h-8 bg-surface flex items-center justify-center overflow-hidden">
              {pollAvatarUrl ? (
                <div className="relative w-full h-full">
                  <Image src={resolveAvatarUrl(pollAvatarUrl, 32)} alt={message.profile.username} fill sizes="32px" className="object-cover" unoptimized={isSupabaseStorage(pollAvatarUrl)} />
                </div>
              ) : (
                <span className="font-pixel text-[8px] text-purple">{pollInitial}</span>
              )}
            </div>
            {pollIsOnline && (
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#66bb6a] border-[1.5px] border-black" />
            )}
          </div>
        )}
        <div className={`flex-1 min-w-0 flex flex-col gap-0 ${!showHeader ? 'pl-10' : ''}`}>
          {showHeader && (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-[4px] flex-1 min-w-0">
                <span
                  className={`font-body font-medium text-[12px] tracking-[0.1px] shrink-0 leading-[normal] whitespace-nowrap ${isOwn ? 'text-purple' : 'text-primary'}`}
                  style={{ fontVariationSettings: '"opsz" 14', cursor: onAvatarTap ? 'pointer' : undefined }}
                  onClick={onAvatarTap ? () => onAvatarTap(message.user_id) : undefined}
                >
                  {message.profile.username}
                </span>
                {pollClassName && (
                  <>
                    <span className="w-[2px] h-[2px] bg-purple shrink-0" />
                    <span className="font-body font-normal text-[10px] tracking-[0.1px] shrink-0 leading-[normal] whitespace-nowrap" style={{ color: '#b3b3b3', fontVariationSettings: '"opsz" 14' }}>
                      {pollClassName}
                    </span>
                  </>
                )}
              </div>
              <span className="font-body font-normal text-[8px] tracking-[0.2px] shrink-0 leading-[normal] whitespace-nowrap ml-1" style={{ color: 'var(--color-paper-200)', fontVariationSettings: '"opsz" 14' }}>
                {pollTimeStr}
              </span>
            </div>
          )}
          <PollCard pollId={pollId} currentUserId={currentUserId} />
        </div>
      </div>
    )
  }

  const initial   = message.profile.username[0]?.toUpperCase() ?? '?'
  const avatarUrl = message.profile.avatar_url as string | null | undefined
  const className = message.profile.avatar_class ? CLASS_NAMES[message.profile.avatar_class] : null
  const isOnline  = onlineUserIds.has(message.user_id)
  const timeStr   = format(new Date(message.created_at), 'h:mma').toLowerCase()

  const reactions       = message.reactions ?? {}
  const sortedReactions = Object.entries(reactions)
    .filter(([, users]) => users.length > 0)
    .sort(([, a], [, b]) => b.length - a.length)

  return (
    <>
      <div
        className={`flex gap-[8px] items-start w-full select-none ${showHeader ? 'pt-[var(--space-6)] pb-0' : 'pt-[var(--space-2)] pb-0'}`}
        onContextMenu={(e) => { e.preventDefault(); setSheetOpen(true) }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
      >
        {/* Avatar — only rendered for the first message in a group */}
        {showHeader && (
          <div
            className="relative flex-shrink-0"
            onClick={onAvatarTap ? () => onAvatarTap(message.user_id) : undefined}
            onTouchStart={onAvatarTap ? (e) => e.stopPropagation() : undefined}
            style={onAvatarTap ? { cursor: 'pointer' } : undefined}
          >
            <div className="w-8 h-8 bg-surface flex items-center justify-center overflow-hidden">
              {avatarUrl ? (
                <div className="relative w-full h-full">
                  <Image src={resolveAvatarUrl(avatarUrl, 32)} alt={message.profile.username} fill sizes="32px" className="object-cover" unoptimized={isSupabaseStorage(avatarUrl)} />
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

        {/* Message content — pl-10 aligns continuation text with grouped messages */}
        <div className={`flex-1 min-w-0 flex flex-col gap-0 ${!showHeader ? 'pl-10' : ''}`}>

          {/* Header row: username · class · xp · timestamp */}
          {showHeader && (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-[4px] flex-1 min-w-0">
                <span
                  className={`font-body font-medium text-[12px] tracking-[0.1px] shrink-0 leading-[normal] whitespace-nowrap ${
                    isOwn ? 'text-purple' : 'text-primary'
                  }`}
                  style={{ fontVariationSettings: '"opsz" 14', cursor: onAvatarTap ? 'pointer' : undefined }}
                  onClick={onAvatarTap ? () => onAvatarTap(message.user_id) : undefined}
                  onTouchStart={onAvatarTap ? (e) => e.stopPropagation() : undefined}
                >
                  {message.profile.username}
                </span>

                {className && (
                  <>
                    <span className="w-[2px] h-[2px] bg-purple shrink-0" />
                    <span
                      className="font-body font-normal text-[10px] tracking-[0.1px] shrink-0 leading-[normal] whitespace-nowrap"
                      style={{ color: '#b3b3b3', fontVariationSettings: '"opsz" 14' }}
                    >
                      {className}
                    </span>
                  </>
                )}

                {displayXP > 0 && (
                  <>
                    <span className="w-[2px] h-[2px] bg-purple shrink-0" />
                    <p className="font-silkscreen tracking-[0.1px] whitespace-nowrap leading-[0] text-[0px] shrink-0">
                      <span className="text-[8px] leading-[normal]" style={{ color: '#f59e0b' }}>
                        +{displayXP} XP
                      </span>
                    </p>
                  </>
                )}
              </div>

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
              className="font-body font-normal text-[14px] text-white leading-[normal] w-full select-none"
              style={{ fontVariationSettings: '"opsz" 14', WebkitUserSelect: 'none' }}
            >
              {message.content}
            </p>
          )}

          {/* ── Reaction chips ────────────────────────────────────────────────── */}
          {sortedReactions.length > 0 && (
            <div className="relative flex flex-wrap gap-1 mt-1">

              {/* Hype Man heal float */}
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
                    onTouchStart={(e) => e.stopPropagation()}
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

      {/* ── Reaction / action bottom sheet (Discord-style) ──────────────────── */}
      {mounted && createPortal(
        <AnimatePresence>
          {sheetOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                key="msg-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="fixed inset-0 z-[70] bg-black/60"
                onTouchStart={(e) => { e.stopPropagation(); setSheetOpen(false) }}
                onClick={() => setSheetOpen(false)}
              />

              {/* Sheet */}
              <motion.div
                key="msg-sheet"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                className="fixed bottom-0 left-0 right-0 z-[80] bg-[#0a0612] border-t border-border"
                style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
              >
                {/* ── Emoji quick-pick row ─────────────────────────────────── */}
                <div className="px-4 pt-4 pb-3 flex items-center">
                  {QUICK_REACTIONS.map((emoji) => {
                    const active = (reactions[emoji] ?? []).includes(currentUserId)
                    return (
                      <button
                        key={emoji}
                        onClick={() => void handleReaction(emoji)}
                        className={`flex-1 flex items-center justify-center py-3 text-[28px] select-none transition-transform active:scale-90 ${
                          active ? 'scale-110' : ''
                        }`}
                      >
                        {emoji}
                      </button>
                    )
                  })}

                  {/* Open native emoji keyboard */}
                  <button
                    onClick={handlePickEmoji}
                    className="flex-1 flex items-center justify-center py-3"
                    aria-label="More emojis"
                  >
                    <span className="w-9 h-9 rounded-full bg-[#1a1a2e] border border-border flex items-center justify-center text-[18px]">
                      😊
                    </span>
                  </button>
                </div>

                <div className="border-t border-border" />

                {/* ── Copy Text ────────────────────────────────────────────── */}
                <button
                  onClick={handleCopy}
                  className="w-full flex items-center gap-4 px-5 min-h-[52px] active:bg-[#111111] transition-colors"
                >
                  <span className="text-[20px]">📋</span>
                  <span className="font-body text-[15px] text-primary">
                    {copied ? 'Copied!' : 'Copy Text'}
                  </span>
                </button>

                {/* Hidden input — focus opens native emoji keyboard on mobile */}
                <input
                  ref={emojiInputRef}
                  type="text"
                  aria-hidden="true"
                  tabIndex={-1}
                  style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: 1, height: 1, opacity: 0.01 }}
                  onInput={handleNativeEmojiInput}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
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
