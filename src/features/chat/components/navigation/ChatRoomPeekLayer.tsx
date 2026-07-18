'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useChatRoomPeekStore, type RoomMeta } from '@/features/chat/store/chatRoomPeekStore'
import { ChatSquadDetailBar } from '@/features/chat/components/header/ChatSquadDetailBar'
import { Send } from 'pixelarticons/react/Send'
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
// layer's static (non-animated, always at rest) `PeekBarAndInput` below closes that gap
// by continuing to show the DEPARTING room's own squad bar + input shell (group A),
// built from whatever's already cached in chatRoomPeekStore's roomMeta — i.e. group A's
// name/avatar are *preserved*, not swapped early, for as long as this layer needs to
// stand in. It renders for the whole gesture, not just the post-commit gap — harmless
// during an active drag/cancel since the real bar/input's opaque `bg-black` (ChatInput's
// chatInputBoxRef wrapper) fully occludes it until the moment the real page actually
// unmounts.
//
// The actual group-A-to-group-B slide (A pushed down and fades, B slides in from the
// top) is deliberately NOT played here — it plays once, on arrival, inside the
// destination room's own real ChatSquadDetailBar, right as B's real data has loaded (see
// ChatInput's barOverride mount-seeding effect). That's the only point at which both
// identities are real (not a placeholder) and the transition is guaranteed visible (this
// layer paints underneath the current room and would be invisible once a real bar takes
// over it anyway).
//
// So this layer renders two independent pieces: a floating ghost loading placeholder
// (while ChatInput drags the current room's own MessageList container away via the
// swipe-nav gesture, this reveals a read-only loading placeholder underneath — the same
// ghost sprite MessageList's own EmptyState uses, gently bobbing in place) and the
// static, group-A-identity bar/input shell described above. This message-area
// placeholder is swipe-nav-specific — chat/[crewId]/loading.tsx's own route-level
// fallback (a normal navigation with nothing on screen yet: tap in from Home, deep
// link, back-nav) keeps its own ChatMessageSkeletonRows skeleton, a deliberately
// different treatment for a deliberately different context. This used to show a real
// cached snapshot of the destination room's last-known messages (sessionStorage-
// sourced), then a generic skeleton — both read as either a glitch (stale, mismatched
// content) or over-literal (bubble-shaped skeleton implying specific rows are about to
// appear) for what's ultimately just "something's loading." The ghost makes no promise
// about content at all. Its disappearance is an instant occlusion cut, not an animated
// exit: the moment the real destination room mounts (see the "currentCrewId landed"
// effect below), its own opaque `bg-black` covers this entire layer in the same paint,
// so there's nothing to gain from animating this layer's own fade-out — it would never
// be visible.
// Renders nothing outside an active gesture.
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
      {/* Messages — floating ghost loading placeholder, centered. Inset by
          chatInputHeight (ChatInput's live-measured squad-bar+input height) so this
          lines up with the real MessageList's own bounding box instead of running
          underneath the real, static input area. See this component's doc comment for
          why this is a ghost and not a real cached preview or a skeleton. */}
      <motion.div
        className="flex h-full items-center justify-center overflow-hidden"
        style={{ paddingBottom: chatInputHeight }}
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
          // stay frozen at x:0 (still showing the ghost) for however long the real
          // navigation takes beyond this 150ms tween — the "currentCrewId landed" effect
          // above is what actually hands off to the real room. Clearing on this tween's
          // completion instead would drop back to a blank view for the rest of the load,
          // reintroducing the exact flash this layer exists to prevent.
          if (peek.phase === 'cancelling') setPeek(null)
        }}
      >
        <PeekGhost />
      </motion.div>

      {/* Static bar/input shell — never slides with `x`, matching the real bar/input's
          own static behavior. Deliberately keyed off `currentCrewId` (the room being
          DEPARTED), not `targetCrewId` — the outgoing room's own identity is what should
          stay visible, unchanged, through the navigation gap; the group-A-to-group-B
          transition itself plays on arrival, inside the destination room's own real bar
          (see ChatInput's barOverride mount-seeding effect), once B's real data is
          actually loaded. This one stays real content, not a skeleton, unlike the
          message area above — group A's own name/avatar are already known with
          certainty (it's this device's own current room), so there's nothing to fake.
          Absent (falls back to plain black) if that room's roomMeta somehow hasn't been
          cached yet, though in practice this is always populated by the departing
          room's own mount effect before a swipe can even be dragged. */}
      {currentCrewId && roomMeta[currentCrewId] && (
        <div className="absolute left-0 right-0 bottom-0">
          <PeekBarAndInput meta={roomMeta[currentCrewId]} />
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

// Same sprite as MessageList's own EmptyState (/sprites/ghost/south-flip.gif, 100×100,
// pixelated). Fades in once on mount, then gently bobs in place for as long as this
// gesture's message peek is showing — a continuous loop, not tied to drag progress.
function PeekGhost() {
  return (
    <motion.img
      src="/sprites/ghost/south-flip.gif"
      alt=""
      width={100}
      height={100}
      style={{ imageRendering: 'pixelated', width: 100, height: 100 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, y: [0, -10, 0] }}
      transition={{
        opacity: { duration: 0.2 },
        y: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' },
      }}
    />
  )
}
