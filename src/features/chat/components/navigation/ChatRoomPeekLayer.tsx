'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useChatRoomPeekStore, SWIPE_NAV_ARRIVAL_FADE_MS, type RoomMeta } from '@/features/chat/store/chatRoomPeekStore'
import { ChatSquadDetailBar } from '@/features/chat/components/header/ChatSquadDetailBar'
import { Send } from 'pixelarticons/react/Send'
import { Plus } from 'pixelarticons/react/Plus'
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
// Nothing in the CURRENT room's page.tsx transitions during a room-swipe anymore (see
// ChatInput's handleTopPan* doc comment) — the message-history log, squad bar, floating
// nav, and input box all stay completely static for as long as it's mounted, and simply
// paint on top of this layer wherever they sit (later in DOM = on top), fully occluding
// it. But a committed swipe triggers a real router.push(), and Next.js unmounts the
// outgoing page.tsx (taking its real MessageList + ChatSquadDetailBar + input box with
// it) the instant navigation starts, well before the destination room's page.tsx has
// mounted to replace them — chat/[crewId]/loading.tsx bridges that gap for the message
// log by deferring to this layer's already-frozen preview (see its own doc comment),
// but nothing did the same for the bar/input, so they'd flash away to bare black and
// pop back in once the real page landed. This
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
// (Figma 637:3802 — a single static frame, public/sprites/ghost/walk/frame_000.png, a
// distinct asset from MessageList's own EmptyState gif, plus a "Migrating to
// {target-room-name}" line underneath — occluded the same way as the bar/input shell
// during an active drag, and only actually revealed in the post-commit unmount→mount
// gap, same timing as the shell) and the
// static, group-A-identity bar/input shell described above. This message-area
// placeholder is swipe-nav-specific — chat/[crewId]/loading.tsx's own route-level
// fallback (a normal navigation with nothing on screen yet: tap in from Home, deep
// link, back-nav) keeps its own ChatMessageSkeletonRows skeleton, a deliberately
// different treatment for a deliberately different context. This used to show a real
// cached snapshot of the destination room's last-known messages (sessionStorage-
// sourced), then a generic skeleton — both read as either a glitch (stale, mismatched
// content) or over-literal (bubble-shaped skeleton implying specific rows are about to
// appear) for what's ultimately just "something's loading." The ghost makes no promise
// about content at all. Its disappearance is a crossfade, not a hard cut: the real
// destination SlidePage mounts at opacity 0 and fades to 1 over SWIPE_NAV_ARRIVAL_FADE_MS
// (see skipNextSlideEnter's `fadeIn` param), so this layer deliberately keeps itself
// mounted — same ghost, same backdrop, completely unchanged — for that same duration
// after the real room lands (see the "currentCrewId landed" effect below) instead of
// clearing `peek` the instant it's no longer strictly needed. Without that hold, the
// real page's fade-in would have nothing underneath to blend from partway through.
// Renders nothing outside an active gesture.
export function ChatRoomPeekLayer() {
  const peek            = useChatRoomPeekStore((s) => s.peek)
  const currentCrewId   = useChatRoomPeekStore((s) => s.currentCrewId)
  const setPeek         = useChatRoomPeekStore((s) => s.setPeek)
  const chatInputHeight = useChatRoomPeekStore((s) => s.chatInputHeight)
  const roomMeta        = useChatRoomPeekStore((s) => s.roomMeta)

  // Real navigation landed on the room being peeked — the actual page has taken over.
  // It mounts already in position (ChatInput calls SlidePage's skipNextSlideEnter(true)
  // right before navigating, and its own MessageList ignores `peek` for the target
  // room — see MessageList's doc comment) but crossfades its opacity in over
  // SWIPE_NAV_ARRIVAL_FADE_MS rather than popping straight to fully opaque — so this
  // layer holds itself mounted for that same duration before actually clearing `peek`,
  // giving the real page something to fade in over instead of an already-blank layer.
  useEffect(() => {
    if (!peek || currentCrewId !== peek.targetCrewId) return
    const t = setTimeout(() => setPeek(null), SWIPE_NAV_ARRIVAL_FADE_MS)
    return () => clearTimeout(t)
  }, [peek, currentCrewId, setPeek])

  if (!peek) return null

  // dragging: live 1:1 tracking of the raw gesture offset ChatInput's handleTopPan
  // writes to chatRoomPeekStore, mapped onto this layer's own edge-relative offset —
  // though occluded by the real, static current-room page the whole time (see this
  // component's top doc comment), so not actually visible until the phase below.
  // committing: the destination room's resting position — fully revealed at x:0,
  // matching where the real room will land on top of it. cancelling: back to fully
  // off-screen, matching where this layer started before the gesture began (peek.x
  // would have been 0 at that point).
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
        <PeekGhost label={roomMeta[peek.targetCrewId]?.name ?? null} />
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
        onTap={noop}
      />
      <div
        className="w-full flex items-center"
        style={{
          outline: '1px solid', outlineColor: 'var(--color-border)', outlineOffset: '-1px',
          paddingLeft: 16, paddingRight: 16, minHeight: 48, gap: 16,
        }}
      >
        {/* Matches ChatInput's own Plus button in its default (unfocused, no-messages)
            state — this shell only ever stands in for that resting state, so it's
            always shown here, never the focused/slid-away variant. */}
        <Plus style={{ width: 16, height: 16, color: 'var(--color-muted)', flexShrink: 0 }} aria-hidden="true" />
        <p className="flex-1 min-w-0 font-body text-[14px] text-muted truncate">Message {meta.name}...</p>
        <Send style={{ width: 16, height: 16, color: 'var(--color-muted)', flexShrink: 0 }} aria-hidden="true" />
      </div>
    </div>
  )
}

// Figma 637:3802 ("body") — a single static frame (public/sprites/ghost/walk/
// frame_000.png, same sprite sheet as the walk cycle other ghost surfaces use, just
// not looped here — this is a resting placeholder, not an animated character) at
// 40×40, plus a "Migrating to {room}" line underneath in Silkscreen (Regular, md/16px
// — see the design-system skill's typography.md, `font-silkscreen` section): "Migrating
// to" in `--color-muted`, the room name in `--color-primary`, matching the Figma node's
// two-span text run. `label` is the target room's name from roomMeta — already
// prefetched for the adjacent rooms in chatRoomOrder by the time a drag can actually
// reach this far (see ChatInput's own prefetch effect), so this is null only in the
// unlikely case that prefetch hasn't resolved yet; the whole line just doesn't render
// rather than show "Migrating to" next to a blank/undefined name.
function PeekGhost({ label }: { label: string | null }) {
  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{
        gap:           'var(--space-5)',
        paddingLeft:   'var(--space-5)',
        paddingRight:  'var(--space-5)',
        paddingTop:    'var(--space-5)',
        paddingBottom: 'var(--space-5)',
      }}
    >
      <div className="relative flex-shrink-0" style={{ width: 40, height: 40 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/sprites/ghost/walk/frame_000.png"
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'pixelated' }}
        />
      </div>
      {label && (
        <p
          className="font-silkscreen text-center leading-none truncate w-full"
          style={{ fontSize: 'var(--text-md)' }}
        >
          <span className="text-muted">Migrating to </span>
          <span className="text-primary">{label}</span>
        </p>
      )}
    </div>
  )
}
