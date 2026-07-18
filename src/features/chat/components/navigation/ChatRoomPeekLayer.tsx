'use client'

import { useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useChatRoomPeekStore, type RoomMeta } from '@/features/chat/store/chatRoomPeekStore'
import { readCachedRoomMessages } from '@/features/chat/utils/readCachedRoomMessages'
import { UserAvatar } from '@/shared/components/ui/UserAvatar'
import { ChatSquadDetailBar } from '@/features/chat/components/header/ChatSquadDetailBar'
import { Send } from 'pixelarticons/react/Send'
import type { MessageWithProfile } from '@/types'
import type { MemberProfile } from '@/features/chat/components/input/ChatInput'

// Frozen fallbacks for ChatSquadDetailBar's member-only props — the peeked room's
// live member list/presence isn't available from here (this layer only ever has
// the lightweight RoomMeta snapshot), same reasoning as ChatInput's own
// EMPTY_MEMBERS/EMPTY_ONLINE_IDS for a barOverride.
const EMPTY_MEMBERS: MemberProfile[] = []
const EMPTY_ONLINE_IDS = new Set<string>()
function noop() {}

// ─── ChatRoomPeekLayer ──────────────────────────────────────────────────────
// Rendered once by chat/[crewId]/layout.tsx, a sibling of {children} (the room's own
// page.tsx) rather than a descendant — that's what lets it persist across room-to-room
// navigation instead of remounting on every crewId change like page.tsx/ChatInput do.
// It paints *underneath* the current room (plain DOM order: this component is placed
// before {children} in the layout, and position:fixed siblings with no explicit
// z-index stack in DOM order — same reasoning ProfileClient's fixed overlays rely on).
//
// Only the message-history log container transitions during a room-swipe (see
// ChatInput's handleTopPan* doc comment) — the squad bar, floating nav, and input box
// stay static for as long as the CURRENT room's page.tsx is mounted, and simply paint
// on top of this layer wherever they sit (later in DOM = on top). But a committed swipe
// triggers a real router.push(), and Next.js unmounts the outgoing page.tsx (taking its
// real ChatSquadDetailBar + input box with it) the instant navigation starts, well
// before the destination room's page.tsx has mounted to replace them — chat/[crewId]/
// loading.tsx bridges that gap for the message log by deferring to this layer's already-
// frozen preview (see its own doc comment), but nothing did the same for the bar/input,
// so they'd flash away to bare black and pop back in once the real page landed. This
// layer's static (non-animated, always at rest) `PeekBarAndInput` below closes that gap:
// a frozen, read-only replica of the destination room's squad bar + input shell, built
// from whatever's already cached in chatRoomPeekStore's roomMeta. It renders for the
// whole gesture, not just the post-commit gap — harmless during an active drag/cancel
// since the real bar/input's opaque `bg-black` (ChatInput's chatInputBoxRef wrapper)
// fully occludes it until the moment the real page actually unmounts.
//
// So this layer renders two independent pieces: a message-list-shaped preview (while
// ChatInput drags the current room's own MessageList container away via the swipe-nav
// gesture, this reveals a read-only "peek" of the neighboring room's messages, sourced
// from whatever's already cached locally — chatRoomPeekStore's roomMeta + this room's
// sessionStorage message snapshot, deliberately not a live/interactive room, just enough
// to avoid a blank flash while the real navigation completes) and the static bar/input
// shell described above. Renders nothing outside an active gesture.
export function ChatRoomPeekLayer() {
  const peek            = useChatRoomPeekStore((s) => s.peek)
  const currentCrewId   = useChatRoomPeekStore((s) => s.currentCrewId)
  const setPeek         = useChatRoomPeekStore((s) => s.setPeek)
  const chatInputHeight = useChatRoomPeekStore((s) => s.chatInputHeight)
  const roomMeta        = useChatRoomPeekStore((s) => s.roomMeta)

  // Real navigation landed on the room being peeked — the actual page has taken over.
  // It mounts silently already-at-rest (ChatInput calls SlidePage's skipNextSlideEnter()
  // right before navigating, and its own MessageList ignores `peek` for the target
  // room — see MessageList's doc comment), fully covering this layer immediately, so
  // the preview's job is done.
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

  // dragging: live 1:1 tracking of MessageList's own drag, mirrored onto this layer's
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
      className="bg-black"
      style={{
        position: 'fixed', top: 0, bottom: 0, left: 0, right: 0,
        maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden',
      }}
    >
      {/* Messages — cached snapshot, bottom-anchored, read-only. Inset by
          chatInputHeight (ChatInput's live-measured squad-bar+input height) so this
          lines up with the real MessageList's own bounding box instead of running
          underneath the real, static input area. Renders nothing (just the plain
          black backdrop) when nothing's cached for this room yet — no skeleton. */}
      <motion.div
        className="flex flex-col justify-end h-full overflow-hidden"
        style={{ padding: 16, paddingBottom: chatInputHeight + 16 }}
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
        <div className="flex flex-col" style={{ gap: 12 }}>
          {messages?.map((m) => <PeekMessageRow key={m.id} message={m} />)}
        </div>
      </motion.div>

      {/* Static bar/input shell — never slides with `x`, matching the real bar/input's
          own static behavior. Absent (falls back to plain black) if this room's
          roomMeta hasn't been cached yet — same "no skeleton" call as the message
          preview above. */}
      {targetCrewId && roomMeta[targetCrewId] && (
        <div className="absolute left-0 right-0 bottom-0">
          <PeekBarAndInput meta={roomMeta[targetCrewId]} />
        </div>
      )}
    </div>
  )
}

function PeekBarAndInput({ meta }: { meta: RoomMeta }) {
  return (
    <div
      className="bg-black border-t border-border flex flex-col"
      style={{
        paddingTop:    'var(--space-5)',
        paddingLeft:   'var(--space-5)',
        paddingRight:  'var(--space-5)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 32px)',
        gap:           'var(--space-5)',
      }}
    >
      <ChatSquadDetailBar
        crewImageUrl={meta.imageUrl}
        crewName={meta.name}
        crewLevel={meta.level}
        memberCount={meta.memberCount}
        members={EMPTY_MEMBERS}
        onlineUserIds={EMPTY_ONLINE_IDS}
        onExpand={noop}
        onPanEnd={noop}
      />
      <div
        className="w-full flex items-center"
        style={{
          outline: '1px solid', outlineColor: 'var(--color-border)', outlineOffset: '-1px',
          paddingLeft: 16, paddingRight: 16, minHeight: 48, gap: 16,
        }}
      >
        <p className="flex-1 min-w-0 font-body text-[14px] text-muted truncate">Message the squad...</p>
        <Send style={{ width: 16, height: 16, color: 'var(--color-muted)', flexShrink: 0 }} aria-hidden="true" />
      </div>
    </div>
  )
}

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
