'use client'

import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { format } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import { useChatStore } from '@/store/chatStore'
import { useCombatStore } from '@/store/combatStore'
import { createClient } from '@/shared/supabase/client'
import type { MessageWithProfile, Profile, SquadDefinitionWithCreator } from '@/types'
import { supabaseImageLoader, avatarImageLoader } from '@/shared/supabase/imageLoader'
import { extractFirstUrl } from '@/shared/utils'
import { useOGPreview } from '@/shared/hooks/useOGPreview'
import { LinkPreviewCard } from '@/features/chat/components/messages/LinkPreviewCard'
import { PollCard } from '@/features/chat/components/polls/PollCard'
import { EventCardMessage } from '@/features/events/components/EventCardMessage'
import { SuggestDefinitionSheet } from '@/features/chat/components/sheets/SuggestDefinitionSheet'
import { PinDurationSheet } from '@/features/chat/components/sheets/PinDurationSheet'
import { ChatSheetReact } from '@/features/chat/components/sheets/ChatSheetReact'
import { ImagePreviewOverlay } from '@/shared/components/overlays/ImagePreviewOverlay'
import { Button } from '@/shared/components/ui/Button'
import { CornerDownRight } from 'pixelarticons/react/CornerDownRight'
import { CornerUpLeft } from 'pixelarticons/react/CornerUpLeft'
import { Cake } from 'pixelarticons/react/Cake'
import { PartyPopper } from 'pixelarticons/react/PartyPopper'

function ImageBubble({
  src, blurDataURL, onTouchStart, onTouchEnd, onTouchMove, onClick,
}: {
  src:          string
  blurDataURL?: string
  onTouchStart: (e: React.TouchEvent) => void
  onTouchEnd:   (e: React.TouchEvent) => void
  onTouchMove:  () => void
  onClick:      (e: React.MouseEvent) => void
}) {
  const isGif = /\.gif(\?|$)/i.test(src) || src.includes('static.klipy.com')
  return (
    <div
      className="relative w-[220px] h-[165px] mt-1 overflow-hidden"
      style={{ cursor: 'pointer' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchMove}
      onClick={onClick}
    >
      {isGif ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt="shared GIF"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <Image
          src={src}
          alt="shared image"
          fill
          sizes="220px"
          className="object-cover"
          loader={supabaseImageLoader}
          placeholder={blurDataURL ? 'blur' : 'empty'}
          blurDataURL={blurDataURL}
        />
      )}
    </div>
  )
}

type ReactResponse = {
  reactions:     Record<string, string[]>
  hype_man_heal: boolean
  heal_amount:   number
  error?:        string
}

interface MessageBubbleProps {
  message:          MessageWithProfile
  isOwn:            boolean
  showHeader:       boolean
  groupId?:         string
  currentUserId:    string
  crewId?:          string
  xpOverride?:      number
  coinOverride?:    number
  onAvatarTap?:     (userId: string) => void
  definitions?:     SquadDefinitionWithCreator[]
  memberUsernames?: Set<string>
  replyProfile?:    Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url'> | null
  isCreator?:       boolean
  pinnedVinyl?:     { imageUrl: string | null; title: string | null } | null
}

// Targeted field comparison — prevents re-renders from unrelated store updates
// (online sweeps, XP ticks, etc.) without deep-equality overhead.
function areEqual(prev: MessageBubbleProps, next: MessageBubbleProps): boolean {
  if (prev.message.id               !== next.message.id)               return false
  if (prev.isOwn                    !== next.isOwn)                    return false
  if (prev.showHeader               !== next.showHeader)               return false
  if (prev.groupId                  !== next.groupId)                  return false
  if (prev.xpOverride               !== next.xpOverride)               return false
  if (prev.coinOverride             !== next.coinOverride)             return false
  if (prev.isCreator                !== next.isCreator)                return false
  if (prev.message.reactions        !== next.message.reactions)        return false
  if (prev.message.xp_awarded       !== next.message.xp_awarded)       return false
  if (prev.message.element_type     !== next.message.element_type)     return false
  if (prev.message.content          !== next.message.content)          return false
  if (prev.message.pinned           !== next.message.pinned)           return false
  if (prev.message.pin_expires_at   !== next.message.pin_expires_at)   return false
  if (prev.message.profile.avatar_url !== next.message.profile.avatar_url) return false
  if (prev.message.profile.username   !== next.message.profile.username)   return false
  if (prev.definitions     !== next.definitions)     return false
  if (prev.memberUsernames !== next.memberUsernames) return false
  if (prev.replyProfile    !== next.replyProfile)    return false
  if (prev.pinnedVinyl     !== next.pinnedVinyl)     return false
  return true
}

// ─── Definition highlight renderer ──────────────────────────────────────────

function parseAliases(word: string): string[] {
  return word.split(',').map((w) => w.trim()).filter(Boolean)
}

function renderWithDefinitions(
  content: string,
  definitions: SquadDefinitionWithCreator[],
  onTap: (def: SquadDefinitionWithCreator) => void,
): React.ReactNode {
  if (!definitions.length) return content

  // Expand each definition into (alias, def) pairs; sort by alias length desc
  // so longer aliases are matched before shorter substrings.
  const pairs: { alias: string; def: SquadDefinitionWithCreator }[] = []
  for (const def of definitions) {
    for (const alias of parseAliases(def.word)) {
      pairs.push({ alias, def })
    }
  }
  if (!pairs.length) return content
  pairs.sort((a, b) => b.alias.length - a.alias.length)

  const escaped = pairs.map((p) => p.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  let regex: RegExp
  try {
    regex = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi')
  } catch {
    return content
  }

  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) parts.push(content.slice(lastIndex, match.index))
    const hit = match[1]
    const pair = pairs.find((p) => p.alias.toLowerCase() === hit.toLowerCase())
    if (pair) {
      parts.push(
        <span
          key={`${pair.def.id}-${match.index}`}
          style={{ color: 'var(--color-blue)' }}
          onClick={(e) => { e.stopPropagation(); onTap(pair.def) }}
        >
          {hit}
        </span>
      )
    } else {
      parts.push(hit)
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < content.length) parts.push(content.slice(lastIndex))
  return parts.length ? parts : content
}

// ─── URL + definition renderer ───────────────────────────────────────────────

const URL_RE_G = /https?:\/\/[^\s<>"']+/g

function renderWithLinks(
  text: string,
  definitions: SquadDefinitionWithCreator[],
  onTap: (def: SquadDefinitionWithCreator) => void,
): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const re = new RegExp(URL_RE_G.source, 'g')
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index)
      const nodes = renderWithDefinitions(before, definitions, onTap)
      if (Array.isArray(nodes)) parts.push(...nodes)
      else parts.push(nodes)
    }
    parts.push(
      <a
        key={`url-${match.index}`}
        href={match[0]}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'var(--color-blue)', textDecoration: 'underline', wordBreak: 'break-all' }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {match[0]}
      </a>
    )
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    const after = text.slice(lastIndex)
    const nodes = renderWithDefinitions(after, definitions, onTap)
    if (Array.isArray(nodes)) parts.push(...nodes)
    else parts.push(nodes)
  }

  return parts
}

// ─── Combined mentions + definition + link renderer ──────────────────────────

function renderMessageContent(
  content: string,
  definitions: SquadDefinitionWithCreator[],
  memberUsernames: Set<string>,
  onTapDef: (def: SquadDefinitionWithCreator) => void,
): React.ReactNode {
  // Pass 1: split on @mention tokens, preserving non-mention text as strings
  const mentionRx = /@(\w+)/g
  const pass1: Array<{ kind: 'text'; value: string } | { kind: 'mention'; value: string }> = []
  let lastIdx = 0
  let mx: RegExpExecArray | null
  while ((mx = mentionRx.exec(content)) !== null) {
    if (memberUsernames.has(mx[1].toLowerCase())) {
      if (mx.index > lastIdx) pass1.push({ kind: 'text', value: content.slice(lastIdx, mx.index) })
      pass1.push({ kind: 'mention', value: mx[1] })
      lastIdx = mx.index + mx[0].length
    }
  }
  if (lastIdx < content.length) pass1.push({ kind: 'text', value: content.slice(lastIdx) })
  if (!pass1.length) pass1.push({ kind: 'text', value: content })

  // Pass 2: apply URL links + definition highlights to each text segment
  const result: React.ReactNode[] = []
  for (let i = 0; i < pass1.length; i++) {
    const part = pass1[i]
    if (part.kind === 'mention') {
      result.push(
        <span key={`mn-${i}`} style={{ color: 'var(--color-purple)' }}>
          @{part.value}
        </span>
      )
    } else if (part.value) {
      const nodes = renderWithLinks(part.value, definitions, onTapDef)
      result.push(...nodes.map((n, j) => <React.Fragment key={`tx-${i}-${j}`}>{n}</React.Fragment>))
    }
  }
  return result.length ? result : content
}

// ─── VinylPill — pinned vinyl displayed in the message header ────────────────

function VinylPill({ imageUrl, title }: { imageUrl: string | null; title: string | null }) {
  const measureRef = useRef<HTMLSpanElement>(null)
  const [textWidth, setTextWidth] = useState(0)
  const TITLE_W = 32

  useLayoutEffect(() => {
    if (!measureRef.current || !title) return
    setTextWidth(measureRef.current.scrollWidth)
  }, [title])

  const needsTicker = textWidth > TITLE_W
  const tickerDur   = Math.max(3, (textWidth / TITLE_W) * 2.5)

  return (
    <div
      style={{
        display:       'inline-flex',
        alignItems:    'center',
        gap:           4,
        background:    'var(--color-surface-sheet)',
        borderRadius:  56,
        padding:       4,
        flexShrink:    0,
        position:      'relative',
      }}
    >
      {/* 12×12 spinning vinyl disc */}
      <div
        className="animate-vinyl"
        style={{ width: 12, height: 12, borderRadius: 8, overflow: 'hidden', position: 'relative', flexShrink: 0 }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            aria-hidden
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', maxWidth: 'none' }}
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: 'var(--color-surface)' }} />
        )}
        {/* Center hole */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 1, height: 1, borderRadius: '50%', background: 'black', border: '0.5px solid var(--color-border)', flexShrink: 0 }} />
        </div>
      </div>

      {/* Music note icon + scrolling title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {/* 8×8 pixel-art play icon (▶) — matches Figma node 377:5120 */}
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden style={{ flexShrink: 0 }}>
          <rect x="0" y="0" width="1" height="1" fill="var(--color-tertiary)" />
          <rect x="0" y="1" width="2" height="1" fill="var(--color-tertiary)" />
          <rect x="0" y="2" width="3" height="1" fill="var(--color-tertiary)" />
          <rect x="0" y="3" width="4" height="2" fill="var(--color-tertiary)" />
          <rect x="0" y="5" width="3" height="1" fill="var(--color-tertiary)" />
          <rect x="0" y="6" width="2" height="1" fill="var(--color-tertiary)" />
          <rect x="0" y="7" width="1" height="1" fill="var(--color-tertiary)" />
        </svg>

        {title && (
          <>
            {/* Off-viewport span used only for measuring rendered text width */}
            <span
              ref={measureRef}
              aria-hidden
              className="font-silkscreen"
              style={{
                fontSize:      8,
                whiteSpace:    'nowrap',
                letterSpacing: '0.1px',
                position:      'fixed',
                left:          -9999,
                top:           0,
                visibility:    'hidden',
                pointerEvents: 'none',
                zIndex:        -1,
              }}
            >
              {title}
            </span>

            {/* 32px wide clipping container */}
            <div style={{ width: TITLE_W, overflow: 'hidden', flexShrink: 0 }}>
              {needsTicker ? (
                <motion.div
                  className="flex"
                  animate={{ x: [0, -(textWidth + 16)] }}
                  transition={{ duration: tickerDur, repeat: Infinity, ease: 'linear', repeatType: 'loop' }}
                >
                  <span className="font-silkscreen leading-none" style={{ fontSize: 8, color: 'var(--color-tertiary)', whiteSpace: 'nowrap', letterSpacing: '0.1px', flexShrink: 0 }}>
                    {title}
                  </span>
                  <span className="font-silkscreen leading-none" style={{ fontSize: 8, color: 'var(--color-tertiary)', whiteSpace: 'nowrap', letterSpacing: '0.1px', paddingLeft: 16, flexShrink: 0 }}>
                    {title}
                  </span>
                </motion.div>
              ) : (
                <span className="font-silkscreen leading-none" style={{ fontSize: 8, color: 'var(--color-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', letterSpacing: '0.1px' }}>
                  {title}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Stable fallback constants — avoids new array/Set allocations when caller omits optional props
const EMPTY_DEFINITIONS: SquadDefinitionWithCreator[] = []
const EMPTY_USERNAMES   = new Set<string>()

function MessageBubbleImpl({
  message,
  isOwn,
  showHeader,
  groupId,
  currentUserId,
  crewId,
  xpOverride,
  coinOverride,
  onAvatarTap,
  definitions    = EMPTY_DEFINITIONS,
  memberUsernames = EMPTY_USERNAMES,
  replyProfile   = null,
  isCreator      = false,
  pinnedVinyl    = null,
}: MessageBubbleProps) {
  const [sheetOpen,          setSheetOpen]          = useState(false)
  const [copied,             setCopied]             = useState(false)
  const [healFloat,          setHealFloat]          = useState<{ id: number; amount: number } | null>(null)
  const [mounted,            setMounted]            = useState(false)
  const [activeDefinition,   setActiveDefinition]   = useState<SquadDefinitionWithCreator | null>(null)
  const [suggestTarget,      setSuggestTarget]      = useState<SquadDefinitionWithCreator | null>(null)
  const [previewOpen,        setPreviewOpen]        = useState(false)
  const [pinSheetOpen,       setPinSheetOpen]       = useState(false)
  // Local optimistic reactions — overrides message.reactions prop while an API call is
  // in-flight. This prevents Realtime UPDATEs (e.g. award-xp patching xp_awarded) from
  // racing with the optimistic update and causing the reaction pill to flicker out.
  const [optimisticReactions, setOptimisticReactions] = useState<Record<string, string[]> | null>(null)

  const longPressTimer       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasMoved             = useRef(false)
  const imgTouchStartTimeRef = useRef(0)
  const imgLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Prevents the double-fire (touchend + synthetic click) on iOS from calling
  // handleReaction twice — which would add then immediately remove the reaction.
  const reactionInFlightRef  = useRef(false)
  // Always-current reactions value — avoids stale closure in handleReaction without
  // needing message.reactions as a useCallback dep (which recreates it on every change).
  const reactionsRef         = useRef(message.reactions)

  // Swipe-to-reply (other messages only)
  const SWIPE_THRESHOLD    = 64
  const touchStartXRef     = useRef(0)
  const touchStartYRef     = useRef(0)
  const isDraggingXRef     = useRef(false)
  const swipeCommittedRef  = useRef(false)
  const contentRef         = useRef<HTMLDivElement>(null)
  const replyIconRef       = useRef<HTMLDivElement>(null)
  // Cached per-gesture list of all slide wrappers in this message's group
  const groupElsRef        = useRef<HTMLElement[]>([])

  // Boolean selector — only re-renders this bubble when THIS user's status changes,
  // not when any other user's online status changes or the sweep runs every 15s.
  const isOnline      = useChatStore((s) => s.onlineUserIds.has(message.user_id))
  const updateMessage = useChatStore((s) => s.updateMessage)
  const setReplyTo    = useChatStore((s) => s.setReplyTo)
  const setEditTo     = useChatStore((s) => s.setEditTo)

  // Keep ref in sync with the latest prop value on every render.
  reactionsRef.current = message.reactions

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

  // ─── Reply tap — scroll to original message with a brief purple flash ───────
  function handleReplyTap() {
    if (!message.reply_to_id) return
    const el = document.getElementById(`msg-${message.reply_to_id}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.style.transition = 'background-color 0.2s ease'
    el.style.backgroundColor = 'rgba(191,95,255,0.12)'
    setTimeout(() => {
      el.style.backgroundColor = ''
      setTimeout(() => { el.style.transition = '' }, 300)
    }, 700)
  }

  // ─── Long-press + swipe-to-reply handlers ───────────────────────────────────

  // Apply transform to every slide wrapper in this message's group.
  function applyGroupTransform(x: number) {
    const transition = x === 0
      ? 'transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)'
      : 'none'
    for (const el of groupElsRef.current) {
      el.style.transition = transition
      el.style.transform  = x === 0 ? 'translateX(0)' : `translateX(${x}px)`
    }
  }

  function resetSwipeDOM() {
    applyGroupTransform(0)
    if (replyIconRef.current) {
      replyIconRef.current.style.transition = 'opacity 0.22s ease-out, transform 0.22s ease-out'
      replyIconRef.current.style.opacity    = '0'
      replyIconRef.current.style.transform  = 'scale(0.5)'
    }
  }

  function handleTouchStart(e: React.TouchEvent) {
    hasMoved.current = false
    longPressTimer.current = setTimeout(() => {
      if (!hasMoved.current) setSheetOpen(true)
    }, 500)
    if (!isOwn) {
      // Cache all slide wrappers for this group once per gesture — avoids
      // repeated querySelector calls during high-frequency touchmove events.
      groupElsRef.current = groupId
        ? Array.from(document.querySelectorAll<HTMLElement>(`[data-group="${groupId}"]`))
        : (contentRef.current ? [contentRef.current] : [])

      // Snap all group elements back to origin before tracking the new gesture
      // so a stuck bubble never corrupts the dx calculation.
      for (const el of groupElsRef.current) {
        el.style.transition = 'none'
        el.style.transform  = 'translateX(0)'
      }
      if (replyIconRef.current) {
        replyIconRef.current.style.transition = 'none'
        replyIconRef.current.style.opacity    = '0'
        replyIconRef.current.style.transform  = 'scale(0.5)'
      }
      const t = e.touches[0]
      touchStartXRef.current    = t.clientX
      touchStartYRef.current    = t.clientY
      isDraggingXRef.current    = false
      swipeCommittedRef.current = false
    }
  }
  function handleTouchEnd() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
    if (!isOwn && isDraggingXRef.current) {
      const wasCommitted        = swipeCommittedRef.current
      isDraggingXRef.current    = false
      swipeCommittedRef.current = false
      resetSwipeDOM()
      if (wasCommitted) setReplyTo({ ...message }, groupId)
    }
  }
  function handleTouchCancel() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
    if (!isOwn && isDraggingXRef.current) {
      const wasCommitted        = swipeCommittedRef.current
      isDraggingXRef.current    = false
      swipeCommittedRef.current = false
      resetSwipeDOM()
      if (wasCommitted) setReplyTo({ ...message }, groupId)
    }
  }
  function handleTouchMove(e: React.TouchEvent) {
    hasMoved.current = true
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
    if (!isOwn) {
      const t  = e.touches[0]
      const dx = t.clientX - touchStartXRef.current
      const dy = Math.abs(t.clientY - touchStartYRef.current)
      if (!isDraggingXRef.current) {
        if (Math.abs(dx) < 5 && dy < 5) return
        if (dy > Math.abs(dx) || dx > 0) return   // vertical scroll or right swipe
        isDraggingXRef.current = true
        // Clear a stale reply the instant a swipe starts on a different group
        const s = useChatStore.getState()
        if (s.replyTo && s.replyGroupId && groupId && s.replyGroupId !== groupId) {
          setReplyTo(null)
        }
      }
      // Rubber-band past threshold
      const clamped = Math.min(0, dx)
      const x = clamped > -SWIPE_THRESHOLD
        ? clamped
        : -SWIPE_THRESHOLD + (clamped + SWIPE_THRESHOLD) * 0.3
      applyGroupTransform(x)

      // Smooth icon: invisible for first 30% of swipe, then ease-in quadratically
      const progress = Math.min(1, Math.abs(dx) / SWIPE_THRESHOLD)
      const delayed  = Math.max(0, (progress - 0.3) / 0.7)
      const eased    = delayed * delayed
      if (replyIconRef.current) {
        replyIconRef.current.style.transition = 'opacity 0.1s ease-out, transform 0.1s ease-out'
        replyIconRef.current.style.opacity    = String(eased)
        replyIconRef.current.style.transform  = `scale(${0.5 + eased * 0.5})`
      }
      if (dx <= -SWIPE_THRESHOLD && !swipeCommittedRef.current) {
        swipeCommittedRef.current = true
        try { navigator.vibrate(10) } catch {}
      } else if (dx > -SWIPE_THRESHOLD) {
        swipeCommittedRef.current = false
      }
    }
  }

  // ─── Image tap / long-press handlers ────────────────────────────────────────
  function handleImageTouchStart(e: React.TouchEvent) {
    e.stopPropagation()
    hasMoved.current = false
    imgTouchStartTimeRef.current = Date.now()
    imgLongPressTimerRef.current = setTimeout(() => {
      if (!hasMoved.current) setSheetOpen(true)
    }, 500)
  }
  function handleImageTouchEnd(e: React.TouchEvent) {
    if (imgLongPressTimerRef.current) { clearTimeout(imgLongPressTimerRef.current); imgLongPressTimerRef.current = null }
    const elapsed = Date.now() - imgTouchStartTimeRef.current
    if (elapsed < 250 && !hasMoved.current) {
      e.stopPropagation()
      setPreviewOpen(true)
    }
  }
  function handleImageTouchMove() {
    hasMoved.current = true
    if (imgLongPressTimerRef.current) { clearTimeout(imgLongPressTimerRef.current); imgLongPressTimerRef.current = null }
  }
  function handleImageClick(e: React.MouseEvent) {
    e.stopPropagation()
    setPreviewOpen(true)
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

  // ─── Reaction toggle (optimistic + selective rollback) ───────────────────────
  const handleReaction = useCallback(async (emoji: string) => {
    // Prevent double-fire (iOS touchend → synthetic click) from toggling twice.
    if (reactionInFlightRef.current) return
    reactionInFlightRef.current = true

    setSheetOpen(false)

    // Read current reactions via ref — always up-to-date without being a dep.
    const prev      = reactionsRef.current ?? {}
    const users     = prev[emoji] ?? []
    const isActive  = users.includes(currentUserId)
    const wasAdding = !isActive

    const nextUsers = isActive
      ? users.filter((id) => id !== currentUserId)
      : [...users, currentUserId]

    const next = { ...prev }
    if (nextUsers.length === 0) delete next[emoji]
    else next[emoji] = nextUsers

    // Local optimistic override — shields the pill from any Realtime UPDATEs that
    // arrive while the request is in-flight (e.g. award-xp patching xp_awarded on
    // the same message row, which triggers a Postgres Changes UPDATE with stale
    // reactions before react-to-message has written the new value).
    setOptimisticReactions(next)
    updateMessage(message.id, { reactions: next })

    // Use browser client so the user's live session JWT is sent — prevents 401s
    // when the edge function has JWT verification enabled.
    const supabase = createClient()
    const { data, error } = await supabase.functions.invoke<ReactResponse>('react-to-message', {
      body: { message_id: message.id, emoji, user_id: currentUserId, crew_id: message.crew_id },
    })

    reactionInFlightRef.current = false

    if (error) {
      console.error('[react-to-message]', error)
      // Only rollback on a confirmed HTTP rejection (4xx/5xx).
      // Network failures keep the optimistic state; Postgres Changes will sync.
      if (error.name === 'FunctionsHttpError') {
        setOptimisticReactions(null)
        updateMessage(message.id, { reactions: prev })
      } else {
        setOptimisticReactions(null)
      }
      return
    }

    if (data?.reactions != null) {
      // Guard: if we were ADDING but the server didn't include our emoji, the RPC
      // saw stale state and toggled us back off. Discard and let Postgres Changes sync.
      if (wasAdding && !(data.reactions[emoji] ?? []).includes(currentUserId)) {
        setOptimisticReactions(null)
        return
      }
      updateMessage(message.id, { reactions: data.reactions })
    }
    // Clear optimistic overlay — prop now has the server-reconciled value.
    setOptimisticReactions(null)
    if (data?.hype_man_heal && data.heal_amount > 0) {
      setHealFloat({ id: Date.now(), amount: data.heal_amount })
    }
  }, [message.id, message.crew_id, currentUserId, updateMessage])


  // ─── OG preview — must be called before early returns ───────────────────────
  const ogUrl = message.message_type === 'text' && !message.image_url
    ? extractFirstUrl(message.content)
    : undefined
  const { data: ogPreview, loading: ogLoading } = useOGPreview(ogUrl)

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
    const pollTimeStr   = format(new Date(message.created_at), 'h:mma').toLowerCase()

    return (
      <div className={`flex gap-[8px] items-start w-full ${showHeader ? 'pt-[var(--space-6)] pb-0' : 'pt-[var(--space-2)] pb-0'}`}>
        {showHeader && (
          <div
            className="relative flex-shrink-0"
            onClick={onAvatarTap ? () => onAvatarTap(message.user_id) : undefined}
            style={onAvatarTap ? { cursor: 'pointer' } : undefined}
          >
            <div className="relative w-8 h-8 rounded-full bg-surface overflow-hidden">
              {pollAvatarUrl ? (
                <Image src={pollAvatarUrl} alt={message.profile.username} fill sizes="32px" className="object-cover" loader={avatarImageLoader} />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center font-pixel text-[8px] text-purple">{pollInitial}</span>
              )}
            </div>
            {isOnline && (
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
              </div>
              <span className="font-body font-normal text-[8px] tracking-[0.2px] shrink-0 leading-[normal] whitespace-nowrap ml-1" style={{ color: 'var(--color-tertiary)', fontVariationSettings: '"opsz" 14' }}>
                {pollTimeStr}
              </span>
            </div>
          )}
          <PollCard pollId={pollId} currentUserId={currentUserId} />
        </div>
      </div>
    )
  }

  // ─── Event messages ──────────────────────────────────────────────────────────
  if (message.message_type === 'event' && message.event_id) {
    const eventAvatarUrl = message.profile.avatar_url as string | null | undefined
    const eventInitial   = message.profile.username[0]?.toUpperCase() ?? '?'
    const eventTimeStr   = format(new Date(message.created_at), 'h:mma').toLowerCase()

    return (
      <div className={`flex gap-[8px] items-start w-full ${showHeader ? 'pt-[var(--space-6)] pb-0' : 'pt-[var(--space-2)] pb-0'}`}>
        {showHeader && (
          <div
            className="relative flex-shrink-0"
            onClick={onAvatarTap ? () => onAvatarTap(message.user_id) : undefined}
            style={onAvatarTap ? { cursor: 'pointer' } : undefined}
          >
            <div className="relative w-8 h-8 rounded-full bg-surface overflow-hidden">
              {eventAvatarUrl ? (
                <Image src={eventAvatarUrl} alt={message.profile.username} fill sizes="32px" className="object-cover" loader={avatarImageLoader} />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center font-pixel text-[8px] text-purple">{eventInitial}</span>
              )}
            </div>
            {isOnline && (
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#66bb6a] border-[1.5px] border-black" />
            )}
          </div>
        )}
        <div className={`flex-1 min-w-0 flex flex-col gap-[4px] ${!showHeader ? 'pl-10' : ''}`}>
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
              </div>
              <span className="font-body font-normal text-[8px] tracking-[0.2px] shrink-0 leading-[normal] whitespace-nowrap ml-1" style={{ color: 'var(--color-tertiary)', fontVariationSettings: '"opsz" 14' }}>
                {eventTimeStr}
              </span>
            </div>
          )}
          <EventCardMessage eventId={message.event_id as string} crewId={crewId ?? message.crew_id} />
        </div>
      </div>
    )
  }

  const initial   = message.profile.username[0]?.toUpperCase() ?? '?'
  const avatarUrl = message.profile.avatar_url as string | null | undefined
  const timeStr   = format(new Date(message.created_at), 'h:mma').toLowerCase()

  // Use local optimistic overlay while in-flight so Realtime UPDATEs can't wipe the pill.
  const displayReactions = optimisticReactions ?? ((message.reactions ?? {}) as Record<string, string[]>)
  const sortedReactions = React.useMemo(
    () => Object.entries(displayReactions).filter(([, users]) => users.length > 0).sort(([, a], [, b]) => b.length - a.length),
    [displayReactions], // eslint-disable-line react-hooks/exhaustive-deps
  )

  return (
    <>
      <div
        className={`relative flex items-start w-full select-none ${showHeader ? 'pt-[var(--space-6)] pb-0' : 'pt-[var(--space-2)] pb-0'}`}
        onContextMenu={(e) => { e.preventDefault(); setSheetOpen(true) }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onTouchCancel={handleTouchCancel}
      >
        {/* Swipe-to-reply icon — stays anchored to outer container as slide wrapper moves left */}
        {!isOwn && (
          <div
            ref={replyIconRef}
            className="pointer-events-none absolute inset-0 flex items-center justify-end"
            style={{ paddingRight: 8, transform: 'scale(0.5)', opacity: 0, zIndex: 2 }}
          >
            <CornerUpLeft style={{ width: 20, height: 20, color: 'var(--color-purple)' }} />
          </div>
        )}

        {/* Slide wrapper — avatar and content move together so content never overlaps avatar */}
        <div ref={contentRef} data-group={groupId} className="flex flex-1 min-w-0 items-start gap-[8px]">

        {/* Avatar — only rendered for the first message in a group */}
        {showHeader && (
          <div
            className="relative flex-shrink-0"
            onClick={onAvatarTap ? () => onAvatarTap(message.user_id) : undefined}
            onTouchStart={onAvatarTap ? (e) => e.stopPropagation() : undefined}
            style={onAvatarTap ? { cursor: 'pointer' } : undefined}
          >
            <div className="relative w-8 h-8 rounded-full bg-surface overflow-hidden">
              {avatarUrl ? (
                <Image src={avatarUrl} alt={message.profile.username} fill sizes="32px" className="object-cover" loader={avatarImageLoader} />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center font-pixel text-[8px] text-purple">{initial}</span>
              )}
            </div>
            {isOnline && (
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#66bb6a] border-[1.5px] border-black" />
            )}
          </div>
        )}

        {/* Message content — pl-10 aligns continuation text with grouped messages */}
        <div className={`flex-1 min-w-0 flex flex-col gap-0 ${!showHeader ? 'pl-10' : ''}`}>

          {/* Header row: username · vinyl pill · timestamp */}
          {showHeader && (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-[4px] flex-1 min-w-0 overflow-hidden">
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

                {pinnedVinyl && (
                  <>
                    <div style={{ width: 2, height: 2, background: 'var(--color-border)', flexShrink: 0 }} />
                    <VinylPill imageUrl={pinnedVinyl.imageUrl} title={pinnedVinyl.title} />
                  </>
                )}
              </div>

              <span
                className="font-body font-normal text-[8px] tracking-[0.2px] shrink-0 leading-[normal] whitespace-nowrap ml-1"
                style={{ color: 'var(--color-tertiary)', fontVariationSettings: '"opsz" 14' }}
              >
                {timeStr}
              </span>
            </div>
          )}

          {/* Reply row — Figma: icon + avatar + @username + preview (single line) */}
          {message.reply_to_id && (message.reply_preview || message.reply_username) && (() => {
            const replyAvatarUrl = replyProfile?.avatar_url ?? null
            const replyInitial   = message.reply_username?.[0]?.toUpperCase() ?? '?'
            return (
              <button
                className="flex items-center gap-[4px] w-full overflow-hidden"
                style={{ background: 'none', border: 'none', paddingTop: 16, paddingBottom: 16, paddingLeft: 0, paddingRight: 0, textAlign: 'left', cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); handleReplyTap() }}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
              >
                <CornerDownRight style={{ width: 16, height: 16, color: 'var(--color-tertiary)', flexShrink: 0 }} />
                <div className="relative w-[16px] h-[16px] rounded-full bg-surface overflow-hidden flex-shrink-0">
                  {replyAvatarUrl ? (
                    <Image
                      src={replyAvatarUrl}
                      alt={message.reply_username ?? ''}
                      fill
                      sizes="16px"
                      className="object-cover"
                      loader={avatarImageLoader}
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center font-pixel text-[4px] text-purple">
                      {replyInitial}
                    </span>
                  )}
                </div>
                {message.reply_username && (
                  <span
                    className="font-body font-normal whitespace-nowrap shrink-0 leading-none"
                    style={{ fontSize: 12, color: 'var(--color-purple)', fontVariationSettings: '"opsz" 14' }}
                  >
                    @{message.reply_username}
                  </span>
                )}
                {message.reply_preview && (
                  <span
                    className="font-body font-normal flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap leading-none"
                    style={{ fontSize: 12, color: 'var(--color-tertiary)', fontVariationSettings: '"opsz" 14' }}
                  >
                    {message.reply_preview}
                  </span>
                )}
              </button>
            )
          })()}

          {/* Message body */}
          {message.message_type === 'image' ? (
            <ImageBubble
              src={(message.image_url as string | null | undefined) ?? message.content}
              blurDataURL={(message.image_blur_hash as string | undefined) ?? undefined}
              onTouchStart={handleImageTouchStart}
              onTouchEnd={handleImageTouchEnd}
              onTouchMove={handleImageTouchMove}
              onClick={handleImageClick}
            />
          ) : (
            <p
              className="font-body font-normal text-[14px] text-secondary leading-[normal] w-full select-none"
              style={{ fontVariationSettings: '"opsz" 14', WebkitUserSelect: 'none', overflowWrap: 'break-word', minWidth: 0 }}
            >
              {message.message_type === 'text' && (definitions.length || memberUsernames.size)
                ? renderMessageContent(message.content, definitions, memberUsernames, setActiveDefinition)
                : message.content
              }
            </p>
          )}

          {/* ── OG link preview ──────────────────────────────────────────────── */}
          {!ogLoading && ogPreview && (
            <div style={{ marginTop: 6 }}>
              <LinkPreviewCard preview={ogPreview} />
            </div>
          )}

          {/* ── Reaction chips ────────────────────────────────────────────────── */}
          <AnimatePresence>
            {sortedReactions.length > 0 && (
              <motion.div
                key="reaction-chips"
                className="relative flex flex-wrap gap-[6px] mt-[6px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
              >

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
                      onPointerDown={(e) => e.stopPropagation()}
                      onPointerUp={() => void handleReaction(emoji)}
                      className="flex items-center select-none active:opacity-70 transition-opacity"
                      style={{
                        gap: 6,
                        height: 28,
                        paddingLeft: 10,
                        paddingRight: 10,
                        border: `1px solid ${active ? '#bf5fff' : 'rgba(255,255,255,0.15)'}`,
                        background: active ? 'rgba(191,95,255,0.18)' : 'rgba(255,255,255,0.06)',
                      }}
                    >
                      <span style={{ fontSize: 15, lineHeight: 1 }}>{emoji}</span>
                      <span
                        className="font-body font-semibold tabular-nums leading-none"
                        style={{
                          fontSize: 12,
                          color: active ? '#bf5fff' : 'rgba(255,255,255,0.75)',
                          fontVariationSettings: '"opsz" 14',
                        }}
                      >
                        {users.length}
                      </span>
                    </button>
                  )
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        </div> {/* slide wrapper */}
      </div>

      {/* ── Full-screen image preview ─────────────────────────────────────── */}
      {mounted && createPortal(
        <AnimatePresence>
          {previewOpen && (
            <ImagePreviewOverlay
              src={(message.image_url as string | null | undefined) ?? message.content}
              blurDataURL={(message.image_blur_hash as string | undefined) ?? undefined}
              alt="Shared image"
              onClose={() => setPreviewOpen(false)}
            />
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* ── Definition view sheet ─────────────────────────────────────────── */}
      {mounted && createPortal(
        <AnimatePresence>
          {activeDefinition && (
            <>
              <motion.div
                key="def-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="fixed inset-0 z-[70] bg-black/60"
                onClick={() => setActiveDefinition(null)}
              />
              <motion.div
                key="def-sheet"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 1 }}
                onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 400) setActiveDefinition(null) }}
                className="fixed bottom-0 left-0 right-0 z-[80] bg-[var(--color-surface-sheet)] rounded-tl-[16px] rounded-tr-[16px] flex flex-col px-4"
                style={{ gap: 'var(--space-7)', paddingTop: 12, paddingBottom: 'max(env(safe-area-inset-bottom), 28px)' }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Content — flex-col gap-[--space-5] items-start */}
                <div className="flex flex-col items-start w-full" style={{ gap: 'var(--space-5)' }}>
                  {/* Details — flex-col gap-[--space-3] items-start justify-center */}
                  <div className="flex flex-col items-start justify-center w-full" style={{ gap: 'var(--space-3)' }}>
                    {/* Aliases — Silkscreen --mini tertiary */}
                    <p
                      className="font-silkscreen text-tertiary leading-none w-full"
                      style={{ fontSize: 'var(--text-mini)' }}
                    >
                      {parseAliases(activeDefinition.word).join(', ')}
                    </p>
                    {/* Inner — flex-col gap-[--space-2] */}
                    <div className="flex flex-col w-full" style={{ gap: 'var(--space-2)' }}>
                      {/* Word — DM Sans Bold --md blue */}
                      <p
                        className="font-body font-bold leading-none w-full"
                        style={{ fontSize: 'var(--text-md)', color: 'var(--color-blue)', fontVariationSettings: '"opsz" 14' }}
                      >
                        {(activeDefinition.actual_word as string | null) || parseAliases(activeDefinition.word)[0]}
                      </p>
                      {/* Definition body — DM Sans Regular 14px secondary */}
                      <p
                        className="font-body text-secondary leading-normal overflow-hidden w-full"
                        style={{ fontSize: '14px', fontVariationSettings: '"opsz" 14' }}
                      >
                        {activeDefinition.definition}
                      </p>
                    </div>
                  </div>
                  {/* Creator — DM Sans Regular --xxs; purple when own, tertiary otherwise */}
                  {activeDefinition.creator_username && (
                    <p
                      className="font-body leading-none"
                      style={{
                        fontSize: 'var(--text-xxs)',
                        color: activeDefinition.creator_id === currentUserId ? 'var(--color-purple)' : 'var(--color-tertiary)',
                        fontVariationSettings: '"opsz" 14',
                      }}
                    >
                      Created by : {activeDefinition.creator_username}
                    </p>
                  )}
                </div>

                {/* Bottom action */}
                {activeDefinition.creator_id !== currentUserId && crewId ? (
                  <Button
                    onClick={() => {
                      setSuggestTarget(activeDefinition)
                      setActiveDefinition(null)
                    }}
                    className="w-full"
                  >
                    Suggest new definition
                  </Button>
                ) : (
                  <button
                    onClick={() => setActiveDefinition(null)}
                    className="h-12 w-full font-pixel text-[8px] text-tertiary flex items-center justify-center transition-colors active:text-primary"
                  >
                    CLOSE
                  </button>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* ── Suggest new definition sheet ────────────────────────────────────── */}
      {mounted && crewId && createPortal(
        <AnimatePresence>
          {suggestTarget && (
            <SuggestDefinitionSheet
              crewId={crewId}
              definition={suggestTarget}
              onClose={() => setSuggestTarget(null)}
              zBase={90}
            />
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* ── Pin duration sheet ──────────────────────────────────────────────── */}
      {mounted && pinSheetOpen && createPortal(
        <PinDurationSheet
          message={message}
          onClose={() => setPinSheetOpen(false)}
          onPinned={(patch) => updateMessage(message.id, patch)}
        />,
        document.body
      )}

      {/* ── ChatSheetReact — reaction + action bottom sheet ─────────────────── */}
      {mounted && createPortal(
        <AnimatePresence>
          {sheetOpen && (
            <ChatSheetReact
              onClose={() => setSheetOpen(false)}
              reactions={displayReactions}
              currentUserId={currentUserId}
              onReact={(emoji) => void handleReaction(emoji)}
              onReply={() => { setSheetOpen(false); setReplyTo({ ...message }, groupId) }}
              isOwn={isOwn}
              onEdit={isOwn && message.message_type === 'text' ? () => { setSheetOpen(false); setEditTo({ ...message }) } : undefined}
              onCopy={handleCopy}
              copied={copied}
              canPin={isCreator}
              onOpenPin={() => { setSheetOpen(false); setPinSheetOpen(true) }}
            />
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}

export const MessageBubble = React.memo(MessageBubbleImpl, areEqual)

function BirthdayMessage({ content }: { content: string }) {
  const parts    = content.slice('BIRTHDAY:'.length).split(':')
  const username = parts[0] ?? ''
  const dateStr  = parts[1] ?? ''
  const label    = parts.slice(2).join(':')
  const dotIdx   = label.indexOf('·')
  const labelA   = dotIdx >= 0 ? label.slice(0, dotIdx + 1).trim() : label
  const labelB   = dotIdx >= 0 ? label.slice(dotIdx + 1).trim()    : ''
  return (
    <div style={{ marginTop: 'var(--space-6)' }}>
      <div
        className="flex items-center w-full rounded-[8px] overflow-hidden border border-[var(--color-purple)] bg-[rgba(17,17,17,0.9)] shadow-[0px_0px_20px_12px_rgba(0,0,0,0.10)]"
        style={{ padding: 16, gap: 16 }}
      >
        <Cake style={{ width: 16, height: 16, color: 'var(--color-secondary)', flexShrink: 0 }} />
        <div className="flex flex-1 flex-col" style={{ gap: 4, minWidth: 1 }}>
          <p className="font-silkscreen leading-none w-full" style={{ fontSize: 'var(--text-mini)' }}>
            <span style={{ color: 'var(--color-tertiary)' }}>{labelA}</span>
            {labelB && <span style={{ color: 'var(--color-secondary)' }}> {labelB}</span>}
          </p>
          <p
            className="font-body font-normal leading-none w-full overflow-hidden text-ellipsis whitespace-nowrap"
            style={{ fontSize: 'var(--text-sm)', color: 'var(--color-secondary)', fontVariationSettings: '"opsz" 14' }}
          >
            @{username}{dateStr && ` · ${dateStr}`}
          </p>
        </div>
      </div>
    </div>
  )
}

function JoinMessage({ content }: { content: string }) {
  const rest     = content.slice('JOIN:'.length)
  const sepIdx   = rest.indexOf(':')
  const username = sepIdx >= 0 ? rest.slice(0, sepIdx) : rest
  const inviter  = sepIdx >= 0 ? rest.slice(sepIdx + 1) : ''
  return (
    <div style={{ marginTop: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
      <div
        className="flex items-center w-full rounded-[8px] overflow-hidden border border-[var(--color-purple)] bg-[rgba(17,17,17,0.9)] shadow-[0px_0px_20px_12px_rgba(0,0,0,0.10)]"
        style={{ padding: 16, gap: 16 }}
      >
        <PartyPopper style={{ width: 16, height: 16, color: 'var(--color-secondary)', flexShrink: 0 }} />
        <div className="flex flex-col" style={{ gap: 4, minWidth: 1 }}>
          <p className="font-silkscreen leading-none" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-tertiary)' }}>
            New Squad Member Joined!
          </p>
          <p
            className="font-body font-normal leading-none w-full overflow-hidden text-ellipsis whitespace-nowrap"
            style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}
          >
            <span style={{ color: 'var(--color-purple)' }}>@{username}</span>
            {inviter ? (
              <>
                <span style={{ color: 'var(--color-secondary)' }}> invited by </span>
                <span style={{ color: 'var(--color-primary)' }}>@{inviter}</span>
              </>
            ) : (
              <span style={{ color: 'var(--color-secondary)' }}> joined the squad</span>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── BOSS_SPAWN message ───────────────────────────────────────────────────────
function BossSpawnMessage({ content }: { content: string }) {
  // BOSS_SPAWN:bossName:maxHp
  const parts    = content.slice('BOSS_SPAWN:'.length).split(':')
  const bossName = parts[0] ?? 'THE VOID'
  const maxHpMsg = parts[1] ? Number(parts[1]) : 0

  // Targeted selectors — only re-render when HP values change, not on every patchRaid call
  // (which updates last_boss_attack_at, guard/volley timestamps, etc. every attack).
  const liveHp = useCombatStore((s) => s.activeRaid?.current_hp ?? maxHpMsg)
  const maxHp  = useCombatStore((s) => s.activeRaid?.max_hp     ?? maxHpMsg)
  const hpPct       = maxHp > 0 ? (liveHp / maxHp) * 100 : 100
  const bossColor   = '#9333ea'

  return (
    <div style={{ marginTop: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
      <div
        className="flex flex-col items-center w-full border text-center"
        style={{ padding: '12px 16px', gap: 6, background: 'linear-gradient(135deg,#0f0820,#1a0d2e)', borderColor: `${bossColor}66` }}
      >
        <p className="font-pixel leading-none" style={{ fontSize: 7, color: bossColor }}>⚠ BOSS RAID BEGINS</p>
        <p className="font-pixel leading-none" style={{ fontSize: 11, color: '#bf5fff', textShadow: '0 0 16px #bf5fff88' }}>
          ◆ {bossName.toUpperCase()} ◆
        </p>
        <p className="font-silkscreen leading-none" style={{ fontSize: 8, color: 'var(--color-tertiary)' }}>
          {Math.round(liveHp).toLocaleString()} / {Math.round(maxHp).toLocaleString()} HP · 7-day window
        </p>
        {/* Live HP bar */}
        <div className="w-full" style={{ marginTop: 2 }}>
          <div className="relative w-full overflow-hidden" style={{ height: 8, background: '#2a1545', borderRadius: 2 }}>
            <div
              style={{
                position:   'absolute',
                inset:      '0 auto 0 0',
                width:      `${hpPct}%`,
                background: `linear-gradient(90deg, ${bossColor}88, ${bossColor})`,
                borderRadius: 2,
                transition: 'width 0.5s ease-out',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── COMBAT:* messages ────────────────────────────────────────────────────────
function CombatMessage({ content }: { content: string }) {
  // content = COMBAT:type:...
  const parts = content.split(':')
  const type  = parts[1] ?? ''

  let text  = content
  let color = 'var(--color-tertiary)'
  let bg    = '#0f0820'
  let border = '#2a1545'

  switch (type) {
    case 'attack': {
      // COMBAT:attack:username:dmg:newBossHP:isCrit
      const username = parts[2] ?? ''
      const dmg      = parts[3] ?? '0'
      const hp       = parts[4] ? Math.round(Number(parts[4])).toLocaleString() : '?'
      const isCrit   = parts[5] === '1'
      text   = isCrit
        ? `⚡ @${username} landed a CRIT — ${dmg} DMG  ▸ Boss HP: ${hp}`
        : `@${username} attacked — ${dmg} DMG  ▸ Boss HP: ${hp}`
      color  = isCrit ? 'var(--color-crit)' : 'var(--color-primary)'
      border = isCrit ? '#fbbf2444' : '#2a1545'
      break
    }
    case 'victory': {
      // COMBAT:victory:mvpUsername:rarity:artifactName
      const mvp      = parts[2] ?? ''
      const rarity   = parts[3] ?? 'common'
      const artifact = parts.slice(4).join(':')
      const rarityColor: Record<string, string> = { legendary: '#ffd700', epic: '#bf5fff', rare: '#3b82f6', common: '#71717a' }
      text   = `🏆 THE VOID DEFEATED! @${mvp} earned ${artifact}`
      color  = rarityColor[rarity] ?? '#ffd700'
      bg     = '#1a1000'
      border = (rarityColor[rarity] ?? '#ffd700') + '55'
      break
    }
    case 'escaped': {
      // COMBAT:escaped:crewName
      text   = '💀 THE VOID ESCAPED — consolation artifact awarded'
      color  = 'var(--color-tertiary)'
      border = '#2a1545'
      break
    }
    case 'guard': {
      // COMBAT:guard:username:mpRemaining/maxMP
      const username = parts[2] ?? ''
      text   = `🛡 @${username} activated GUARD — taunting the boss for 60s`
      color  = '#ef4444'
      border = '#ef444433'
      break
    }
    case 'mend': {
      // COMBAT:mend:username:healAmount:mpRemaining/maxMP
      const username = parts[2] ?? ''
      const heal     = parts[3] ?? '0'
      text   = `💚 @${username} cast MEND — healed crew for ${heal} HP`
      color  = '#22c55e'
      border = '#22c55e33'
      break
    }
    case 'volley': {
      // COMBAT:volley:username:dmg:newBossHP:mpRemaining/maxMP
      const username = parts[2] ?? ''
      const dmg      = parts[3] ?? '0'
      const hp       = parts[4] ? Math.round(Number(parts[4])).toLocaleString() : '?'
      text   = `🏹 @${username} volleyed — ${dmg} DMG + boss debuffed  ▸ HP: ${hp}`
      color  = '#ffd700'
      border = '#ffd70033'
      break
    }
    case 'backstab': {
      // COMBAT:backstab:username:dmg:newBossHP:mpRemaining/maxMP
      const username = parts[2] ?? ''
      const dmg      = parts[3] ?? '0'
      const hp       = parts[4] ? Math.round(Number(parts[4])).toLocaleString() : '?'
      text   = `🗡 @${username} BACKSTABBED — ${dmg} DMG  ▸ HP: ${hp}`
      color  = '#bf5fff'
      border = '#bf5fff33'
      break
    }
    case 'cast': {
      // COMBAT:cast:username:dmg:newBossHP:mpRemaining/maxMP
      const username = parts[2] ?? ''
      const dmg      = parts[3] ?? '0'
      const hp       = parts[4] ? Math.round(Number(parts[4])).toLocaleString() : '?'
      text   = `✨ @${username} cast — ${dmg} DMG  ▸ HP: ${hp}`
      color  = '#00e5ff'
      border = '#00e5ff33'
      break
    }
    case 'boss_attack': {
      // COMBAT:boss_attack:username:dmg:newHP
      const username = parts[2] ?? ''
      const dmg      = parts[3] ?? '0'
      text   = `💥 THE VOID struck @${username} for ${dmg} DMG`
      color  = '#ef4444'
      bg     = '#1a0505'
      border = '#ef444444'
      break
    }
    case 'downed': {
      // COMBAT:downed:username:dmg
      const username = parts[2] ?? ''
      const dmg      = parts[3] ?? '0'
      text   = `💀 @${username} was DOWNED by THE VOID (${dmg} DMG) — needs revive`
      color  = '#ef4444'
      bg     = '#1a0505'
      border = '#ef444466'
      break
    }
    default:
      text = content
  }

  return (
    <div className="flex justify-center" style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
      <div
        className="border px-3 py-2 max-w-[90%] text-center"
        style={{ background: bg, borderColor: border }}
      >
        <p className="font-pixel leading-relaxed" style={{ fontSize: 7, color }}>{text}</p>
      </div>
    </div>
  )
}

function SystemMessage({ message }: { message: MessageWithProfile }) {
  const content = message.content
  if (content.startsWith('BIRTHDAY:'))   return <BirthdayMessage content={content} />
  if (content.startsWith('JOIN:'))       return <JoinMessage content={content} />
  if (content.startsWith('BOSS_SPAWN:')) return <BossSpawnMessage content={content} />
  if (content.startsWith('COMBAT:'))     return <CombatMessage content={content} />
  let bg   = 'bg-surface border-border'
  let icon = '⚙️'
  if (content.startsWith('🎂'))                                                          { bg = 'bg-[#1a0d2e] border-purple/30'; icon = '' }
  else if (content.includes('XP') || content.includes('xp'))                            { bg = 'bg-[#1a1400] border-[#ffd700]/40'; icon = '⭐' }
  return (
    <div className="flex justify-center" style={{ marginTop: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
      <div className={`border px-4 py-2 max-w-[85%] text-center ${bg}`}>
        <p className="font-pixel text-[9px] text-tertiary leading-relaxed">{icon ? `${icon} ` : ''}{content}</p>
      </div>
    </div>
  )
}
