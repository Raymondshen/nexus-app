'use client'

import { useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useChatRoomPeekStore } from '@/features/chat/store/chatRoomPeekStore'
import { readCachedRoomMessages } from '@/features/chat/utils/readCachedRoomMessages'
import { GroupAvatar } from '@/shared/components/ui/GroupAvatar'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import type { MessageWithProfile } from '@/types'

// ─── ChatRoomPeekLayer ──────────────────────────────────────────────────────
// Rendered once by chat/[crewId]/layout.tsx, a sibling of {children} (the room's own
// page.tsx) rather than a descendant — that's what lets it persist across room-to-room
// navigation instead of remounting on every crewId change like page.tsx/ChatInput do.
// It paints *underneath* the current room (plain DOM order: this component is placed
// before {children} in the layout, and position:fixed siblings with no explicit
// z-index stack in DOM order — same reasoning ProfileClient's fixed overlays rely on).
//
// While ChatInput drags the current room's SlidePage away via the swipe-nav gesture
// (see ChatInput's handleTopPan/handleTopPanEnd), this reveals a read-only "peek" of
// the neighboring room being swiped to, sourced from whatever's already cached locally
// (chatRoomPeekStore's roomMeta + this room's sessionStorage message snapshot) —
// deliberately not a live/interactive room, just enough to avoid a blank flash while
// the real navigation completes. Renders nothing outside an active gesture.
export function ChatRoomPeekLayer() {
  const peek          = useChatRoomPeekStore((s) => s.peek)
  const currentCrewId = useChatRoomPeekStore((s) => s.currentCrewId)
  const setPeek        = useChatRoomPeekStore((s) => s.setPeek)
  const targetMeta     = useChatRoomPeekStore((s) => (peek ? s.roomMeta[peek.targetCrewId] : undefined))

  // Real navigation landed on the room being peeked — the actual page has taken over.
  // It mounts silently already-at-rest at x:0 (ChatInput calls SlidePage's
  // skipNextSlideEnter() right before navigating, precisely so it doesn't re-play its
  // own entrance on top of what this layer already revealed), fully covering this
  // layer immediately, so the preview's job is done.
  useEffect(() => {
    if (peek && currentCrewId === peek.targetCrewId) setPeek(null)
  }, [peek, currentCrewId, setPeek])

  // Re-read the cached snapshot only when the peeked room changes (e.g. the user
  // reverses drag direction mid-swipe), not on every drag tick. A synchronous
  // sessionStorage read, so this is derived directly rather than synced via an effect.
  const targetCrewId = peek?.targetCrewId
  const messages = useMemo<MessageWithProfile[] | null>(
    () => (targetCrewId ? readCachedRoomMessages(targetCrewId) : null),
    [targetCrewId]
  )

  if (!peek) return null

  // dragging: live 1:1 tracking of the real page's drag, mirrored onto this layer's
  // own edge-relative offset. committing: the destination room's resting position —
  // fully revealed at x:0, matching where the real room will land on top of it.
  // cancelling: back to fully off-screen, matching where this layer started before
  // the gesture began (peek.x would have been 0 at that point).
  const vw = typeof window === 'undefined' ? 0 : window.innerWidth
  const offscreenX = peek.direction === 'left' ? vw : -vw
  const x = peek.phase === 'committing'
    ? 0
    : peek.phase === 'cancelling'
      ? offscreenX
      : peek.x + offscreenX

  return (
    <div
      className="flex flex-col bg-black"
      style={{
        position: 'fixed', top: 0, bottom: 0, left: 0, right: 0,
        maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden',
      }}
    >
      <motion.div
        className="flex flex-col h-full"
        animate={{ x }}
        transition={
          peek.phase === 'dragging'
            ? { duration: 0 }
            : peek.phase === 'committing'
              ? { type: 'tween', ease: [0.32, 0, 0.67, 0], duration: 0.15 }
              : { type: 'spring', stiffness: 500, damping: 40 }
        }
        onAnimationComplete={() => {
          // Cancelled gesture — the spring-back finished, nothing left to show.
          // A *committed* swipe deliberately does NOT clear here: this layer needs to
          // stay frozen at x:0 (still showing the cached snapshot) for however long the
          // real navigation takes beyond this 150ms tween — the "currentCrewId landed"
          // effect above is what actually hands off to the real room. Clearing on this
          // tween's completion instead would drop back to a blank view for the rest of
          // the load, reintroducing the exact flash this layer exists to prevent.
          if (peek.phase === 'cancelling') setPeek(null)
        }}
      >
        {/* Header */}
        <div className="flex items-center flex-shrink-0" style={{ gap: 8, padding: 16 }}>
          <GroupAvatar imageUrl={targetMeta?.imageUrl ?? null} name={targetMeta?.name ?? ''} size={32} />
          <p
            className="font-body font-black text-secondary truncate"
            style={{ fontSize: 16, fontVariationSettings: '"opsz" 14' }}
          >
            {(targetMeta?.name ?? '').toUpperCase()}
          </p>
        </div>

        {/* Messages — cached snapshot, bottom-anchored, read-only. Falls back to a
            loading skeleton (no delay — this whole layer is only ever on screen for the
            span of a drag/transition) when nothing's cached for this room yet. */}
        <div
          className="flex-1 min-h-0 flex flex-col justify-end overflow-hidden"
          style={{ padding: '0 16px 16px', gap: 12 }}
        >
          {messages
            ? messages.map((m) => <PeekMessageRow key={m.id} message={m} />)
            : SKELETON_ROW_WIDTHS.map((w, i) => (
                <div key={i} className="flex items-end" style={{ gap: 8 }}>
                  <div className="w-8 h-8 flex-shrink-0 bg-border animate-pulse" />
                  <div className="h-8 bg-border animate-pulse" style={{ width: `${w}%`, maxWidth: 260 }} />
                </div>
              ))}
        </div>

        {/* Input area placeholder — static, matches ChatLoading's shape so the handoff
            to the real input doesn't visibly jump once the real room mounts. */}
        <div
          className="bg-black border-t border-border flex-shrink-0"
          style={{ padding: '16px 16px max(env(safe-area-inset-bottom), 32px)' }}
        >
          <div className="border border-border" style={{ height: 48 }} />
        </div>
      </motion.div>
    </div>
  )
}

const SKELETON_ROW_WIDTHS = [72, 48, 60]

function PeekMessageRow({ message }: { message: MessageWithProfile }) {
  const body = message.message_type === 'image' ? '📷 Photo' : message.content
  return (
    <div className="flex items-start" style={{ gap: 8 }}>
      <UserAvatar avatarUrl={message.profile.avatar_url} username={message.profile.username} size={28} />
      <div className="flex flex-col min-w-0" style={{ gap: 2 }}>
        <p className="font-body font-black text-secondary" style={{ fontSize: 12 }}>
          {message.profile.username}
        </p>
        <p className="font-body text-primary truncate" style={{ fontSize: 14 }}>
          {body}
        </p>
      </div>
    </div>
  )
}
