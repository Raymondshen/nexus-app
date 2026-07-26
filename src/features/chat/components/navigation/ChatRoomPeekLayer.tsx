'use client'

import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  useChatRoomPeekStore, SWIPE_NAV_ARRIVAL_FADE_MS, PEEK_MIN_REVEAL_MS, PEEK_CONTINUE_MS,
  type RoomMeta,
} from '@/features/chat/store/chatRoomPeekStore'
import { ChatSquadDetailBar } from '@/features/chat/components/header/ChatSquadDetailBar'
import { useSpriteFrameLoop } from '@/shared/hooks/useSpriteFrameLoop'
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
// (Figma 659:9526 — a looping walk-cycle sprite, public/sprites/ghost/walk/
// frame_000.png…frame_005.png, a distinct asset from MessageList's own EmptyState gif,
// plus a "MOVING TO {target-room-name}" line underneath — occluded the same way as
// the bar/input shell during an active drag, and only actually revealed in the
// post-commit unmount→mount gap, same timing as the shell) and the static,
// group-A-identity bar/input shell described above. This message-area
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
// (see skipNextSlideEnter's `fadeIn` param) — but that crossfade doesn't start the
// instant the real page mounts. Per explicit request, the reveal is choreographed on a
// fixed timeline instead, so a fast/cached room switch doesn't just flash the ghost for a
// handful of milliseconds before cutting over: (0) wait for `exposed` — this layer has
// actually become visible, i.e. whatever was covering it has been torn down (see
// `exposed`'s own doc comment in chatRoomPeekStore for the two ways that gets signaled) —
// (1) once exposed, the label plays its entrance for PEEK_MIN_REVEAL_MS regardless of
// load state, (2) once that's elapsed, check whether the destination has actually landed
// (`currentCrewId === peek.targetCrewId`) — if not yet, keep waiting, (3) once landed
// (whichever comes later: the minimum, or the real load), keep the ghost running for
// PEEK_CONTINUE_MS more, then (4) fade — flip `revealReady`, which is what SlidePage's
// `fadeInOnSkip` branch actually waits on before starting its own opacity tween (see that
// component's own doc comment), and hold this layer mounted for that same
// SWIPE_NAV_ARRIVAL_FADE_MS duration so the real page has something to crossfade from
// instead of an already-blank layer. See the "reveal → fade choreography" effect below
// for the implementation. Step 0 is what actually fixes the label's entrance from
// feeling instant/skipped in testing — before `exposed` existed, the entrance was timed
// from `peek`'s own creation (the tap), which happens well before this layer is actually
// uncovered, so most or all of the tween played out while still fully hidden.
// Renders nothing outside an active gesture.
export function ChatRoomPeekLayer() {
  const peek            = useChatRoomPeekStore((s) => s.peek)
  const currentCrewId   = useChatRoomPeekStore((s) => s.currentCrewId)
  const setPeek         = useChatRoomPeekStore((s) => s.setPeek)
  const exposed         = useChatRoomPeekStore((s) => s.exposed)
  const setExposed      = useChatRoomPeekStore((s) => s.setExposed)
  const revealReady     = useChatRoomPeekStore((s) => s.revealReady)
  const setRevealReady  = useChatRoomPeekStore((s) => s.setRevealReady)
  const chatInputHeight = useChatRoomPeekStore((s) => s.chatInputHeight)
  const roomMeta        = useChatRoomPeekStore((s) => s.roomMeta)

  // Anchors PEEK_MIN_REVEAL_MS to the moment this layer actually became visible
  // (`exposed`, see that flag's own doc comment) — NOT to when `peek` itself was
  // created. Those two moments can be far apart: `peek` is set the instant the user taps
  // a room card, but the outgoing room's real page stays mounted, fully opaque, on top of
  // this layer until Next.js actually finishes navigating, which can take anywhere from
  // ~0ms (fully cached) to a real network round trip. Anchoring on `peek` made the
  // entrance tween run (and often finish) while still completely hidden. Kept as its own
  // effect (rather than folded into the one below) so it fires the instant `exposed`
  // itself changes — including the slow path, where exposure happens well before landing
  // — instead of only once landing ALSO happens to be true, which would anchor the timer
  // to the wrong moment.
  const revealedAtRef = useRef<number | null>(null)
  useEffect(() => {
    revealedAtRef.current = exposed ? Date.now() : null
  }, [exposed])

  // Landed → exposed (fast path — a sufficiently fast/cached navigation can skip
  // chat/[crewId]/loading.tsx's own slow-path exposure entirely and mount the real
  // destination page directly; landing IS exposure in that case, since that page mounts
  // at opacity 0 per `skipNextSlideEnter`'s `fadeIn` param and this layer shows through it
  // — see `exposed`'s own doc comment in chatRoomPeekStore) → reveal→fade choreography,
  // merged into one effect since both are gated on the same "has the destination landed?"
  // check. When landing fires before exposure (the fast path), this bails right after
  // calling `setExposed` — the effect re-runs on its own once that state change lands,
  // at which point `exposed` (and the ref above) are already correct.
  useEffect(() => {
    if (!peek || currentCrewId !== peek.targetCrewId) return
    if (!exposed) { setExposed(true); return }
    const elapsedSinceReveal = Date.now() - (revealedAtRef.current ?? Date.now())
    const remainingMin       = Math.max(0, PEEK_MIN_REVEAL_MS - elapsedSinceReveal)
    let fadeTimer: ReturnType<typeof setTimeout> | undefined
    const readyTimer = setTimeout(() => {
      setRevealReady(true)
      fadeTimer = setTimeout(() => setPeek(null), SWIPE_NAV_ARRIVAL_FADE_MS)
    }, remainingMin + PEEK_CONTINUE_MS)
    return () => {
      clearTimeout(readyTimer)
      if (fadeTimer) clearTimeout(fadeTimer)
    }
  }, [peek, exposed, currentCrewId, setExposed, setPeek, setRevealReady])

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
      {/* Messages — floating ghost loading placeholder. Inset by chatInputHeight
          (ChatInput's live-measured squad-bar+input height) so this lines up with the
          real MessageList's own bounding box instead of running underneath the real,
          static input area. See this component's doc comment for why this is a ghost
          and not a real cached preview or a skeleton.
          No `items-center justify-center` here (deliberately dropped) — `PeekGhost`
          itself already fills this box edge-to-edge (`h-full w-full`) and owns its own
          internal centering (the sprite within its flex-1 area) and bottom-anchoring
          (the label), matching Figma's own layout (get_metadata on 659:9526 — the sprite
          sits exactly centered within its own flex-grow region, not centered against the
          whole screen as one unit with the label). Centering THIS wrapper as well would
          be redundant if `PeekGhost`'s own `h-full` resolves — but this wrapper is a row
          flex container, so `items-center` opts the child OUT of the default `stretch`
          cross-axis behavior, making its height resolution depend on a percentage-height
          chain instead of the guaranteed stretch-to-fill; if that percentage ever failed
          to resolve for any reason, `PeekGhost` would collapse to its own content height
          and get centered as a single ~190px unit (ghost + gap + label) instead of
          filling the box, visibly pulling the sprite up away from true center. Leaving
          this wrapper at the default `stretch` removes that failure mode entirely. */}
      <motion.div
        className="flex h-full overflow-hidden"
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
        <PeekGhost label={roomMeta[peek.targetCrewId]?.name ?? null} exposed={exposed} exiting={revealReady} />
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

// Figma 659:9526 ("body") — supersedes the earlier 637:3802 revision (which centered a
// 48×48 sprite + a Silkscreen-then-DM-Sans-Bold-md/16px "Migrating To {room}" line as one
// vertically-centered group). This revision instead fills the whole message area
// (`items-start justify-end` — bottom-left anchored) with a looping 6-frame walk-cycle
// sprite (public/sprites/ghost/walk/frame_000.png…frame_005.png, 0-indexed) centered in
// the remaining space above a two-line "MOVING TO / {room}" label pinned to the
// bottom-left corner. Padding is asymmetric, confirmed against the node's own child
// positions via `get_metadata` rather than trusted from `get_design_context`'s exported
// Tailwind class alone (which mis-reported the vertical padding as `var(--x5,16px)` —
// the sprite frame's own y-offset (24px) and the gap from the label block's bottom edge
// to the container's own bottom edge (also 24px) both measure `var(--space-7)`, not
// `--space-5`; only the horizontal padding and the gap between the sprite area and the
// label block are actually 16px/`--space-5`, confirmed the same way). Sprite grew from
// 48×48 to 56×56 — still cropped the same way WaveGhost crops the wave sprite's padded
// canvas: each native frame has visible transparent padding around the ghost, so it's
// zoomed via an oversized absolute `<img>` (183.2% at a -41.6% inset, straight from
// Figma's own crop numbers, a ratio that holds regardless of the box's own pixel size)
// inside an overflow-hidden box rather than rendered at 1:1 like SleepingGhost's own
// (unpadded) sprite. The frame-cycling mechanism itself comes from the shared
// `useSpriteFrameLoop` hook (also used by ChatRoomBrowseSheet's WaveGhost/SleepingGhost)
// — same interval-driven index, with `prefers-reduced-motion` support. Figma's own motion
// timeline has no keyframes on the sprite/its container — only the two label lines
// animate (see below) — so the walk-cycle here is unrelated to that timeline.
//
// Label: DM Sans Black (font-black/900) display-size (32px, `--text-display`) uppercase,
// 0.64px tracking, 1.1 line-height on both lines. Figma's own structure is genuinely two
// independent text nodes stacked with zero gap ("Moving To" then the room name), not one
// text run with a line break — confirmed via `get_design_context` on each child frame
// individually, since the parent-level call collapses them into a single misleading
// two-span `<p>` with an inline `<br/>`. Reproduced here as two separate block-level
// `<motion.p>`s for that reason (and so only the room-name line needs `truncate`, not the
// fixed "MOVING TO" line — a shared `truncate`/nowrap would collapse the line break too):
// "MOVING TO" in `--color-muted`, the room name in `--color-primary`. `uppercase` is a CSS
// transform here, not a literal caps string, so it renders correctly regardless of the
// room name's own casing. `label` is the target room's name from roomMeta — already
// prefetched for the adjacent rooms in chatRoomOrder by the time a drag can actually reach
// this far (see ChatInput's own prefetch effect), so this is null only in the unlikely
// case that prefetch hasn't resolved yet; the whole block just doesn't render rather than
// show "Moving To" next to a blank/undefined name.
const PEEK_GHOST_FRAME_COUNT = 6
const PEEK_GHOST_FRAME_MS    = 150
const PEEK_GHOST_SPRITE_PX   = 56

// Figma's own timeline for this node (get_motion_context on 659:9526) animates both label
// lines as a fade+slide-up entrance — opacity 0→1, y:35→0 (35px being each line's own
// line-box height from the metadata, so each line slides up exactly its own height into
// place) — on a [0.5,0,0.5,1] ease, as one segment of an infinitely-repeating 2s loop
// (Figma's own prototype-preview convention for previewing an animation continuously).
// Reproduced here as a one-shot reveal per explicit spec rather than that raw timeline:
// the whole label (both lines together, no inter-line stagger) slides up + fades in over
// PEEK_MIN_REVEAL_MS (the same window ChatRoomPeekLayer's own choreography holds before
// it's allowed to check whether the destination has loaded, so the check only ever runs
// once this entrance has actually finished), then plays once more, reversed (fade + slide
// back down) once `exiting` flips true — see that prop's own doc comment below. Both
// directions — and both lines — share this one variants object (opacity 0/y 35 ↔ opacity
// 1/y 0); only which state `animate` targets, and the transition duration, differs.
const PEEK_TEXT_EASE     = [0.5, 0, 0.5, 1] as const
const PEEK_TEXT_VARIANTS = { hidden: { opacity: 0, y: 35 }, visible: { opacity: 1, y: 0 } }

// Stable object references, defined once at module scope rather than as inline literals
// on the `transition` prop — `PeekGhost`'s sprite ticks `frame` state every
// PEEK_GHOST_FRAME_MS (150ms) for its whole walk-cycle, and recreating a fresh
// `transition` object on every one of those re-renders was very likely what caused an
// earlier "pops in and out, doesn't show until the last step" bug: Framer Motion re-
// evaluates the animation whenever the props it's tracking change identity, so a tween
// that's supposed to run once was instead getting re-issued roughly every 150ms for as
// long as the sprite kept ticking — never actually completing a visible, continuous
// interpolation. Fixed two ways: these transition objects are now stable (never
// recreated), AND the label is split into its own `PeekGhostLabel` component below so it
// doesn't re-render on every sprite frame tick at all — only when `label`/`exiting`
// themselves change (twice per gesture: once at mount, once at exit).
const PEEK_TEXT_ENTER_TRANSITION = { duration: PEEK_MIN_REVEAL_MS / 1000, ease: PEEK_TEXT_EASE }
const PEEK_TEXT_EXIT_TRANSITION  = { duration: SWIPE_NAV_ARRIVAL_FADE_MS / 1000, ease: PEEK_TEXT_EASE }

function PeekGhostSprite() {
  const frame = useSpriteFrameLoop(PEEK_GHOST_FRAME_COUNT, PEEK_GHOST_FRAME_MS)
  return (
    <div className="relative flex-shrink-0 overflow-hidden" style={{ width: PEEK_GHOST_SPRITE_PX, height: PEEK_GHOST_SPRITE_PX }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- small looping pixel sprite, next/image adds no value here */}
      <img
        src={`/sprites/ghost/walk/frame_${String(frame).padStart(3, '0')}.png`}
        alt=""
        style={{
          position:       'absolute',
          left:           '-41.6%',
          top:            '-41.6%',
          width:          '183.2%',
          height:         '183.2%',
          maxWidth:       'none',
          imageRendering: 'pixelated',
        }}
        aria-hidden="true"
      />
    </div>
  )
}

function PeekGhostLabel({ label, exposed, exiting }: {
  label: string | null
  /** True once this layer has actually become visible to the user — see `exposed`'s own
   *  doc comment in chatRoomPeekStore. The entrance (slide up + fade in) doesn't start
   *  until this flips; before that, the label stays in its pre-entrance "hidden" pose
   *  (unrendered, effectively, since it's fully occluded anyway) rather than running its
   *  tween out while nothing could see it. */
  exposed: boolean
  /** True once ChatRoomPeekLayer's own reveal→fade choreography (PEEK_MIN_REVEAL_MS,
   *  then the landed-check, then PEEK_CONTINUE_MS — see that component's top doc
   *  comment) has actually finished — i.e. `revealReady`, passed straight through. Until
   *  this flips, the label stays visible continuously once exposed — with no separate
   *  mid-timeline hide. Only once `exiting` flips does it fade + slide back down — timed
   *  to the same SWIPE_NAV_ARRIVAL_FADE_MS window the layer holds itself mounted for
   *  afterward, so the exit tween finishes exactly as the whole splash screen fades off,
   *  not before it. */
  exiting: boolean
}) {
  if (!label) return null
  // `initial="hidden"` differs from `animate`'s resolved value once `exposed` flips true
  // (it becomes 'visible' unless `exiting`), which is exactly the case Framer Motion's
  // tween is designed for — it plays the transition from wherever the element currently
  // is to `animate`'s new target, right when that prop actually changes.
  const textAnimate = !exposed || exiting ? 'hidden' : 'visible'
  return (
    <div className="w-full">
      <motion.p
        variants={PEEK_TEXT_VARIANTS}
        initial="hidden"
        animate={textAnimate}
        transition={exiting ? PEEK_TEXT_EXIT_TRANSITION : PEEK_TEXT_ENTER_TRANSITION}
        className="font-body font-black uppercase"
        style={{ fontSize: 'var(--text-display)', letterSpacing: '0.64px', lineHeight: 1.1, color: 'var(--color-muted)', fontVariationSettings: '"opsz" 14' }}
      >
        Moving To
      </motion.p>
      <motion.p
        variants={PEEK_TEXT_VARIANTS}
        initial="hidden"
        animate={textAnimate}
        transition={exiting ? PEEK_TEXT_EXIT_TRANSITION : PEEK_TEXT_ENTER_TRANSITION}
        className="font-body font-black uppercase truncate"
        style={{ fontSize: 'var(--text-display)', letterSpacing: '0.64px', lineHeight: 1.1, color: 'var(--color-primary)', fontVariationSettings: '"opsz" 14' }}
      >
        {label}
      </motion.p>
    </div>
  )
}

function PeekGhost({ label, exposed, exiting }: { label: string | null; exposed: boolean; exiting: boolean }) {
  return (
    <div
      className="flex flex-col items-start justify-end h-full w-full"
      style={{
        gap:           'var(--space-5)',
        paddingLeft:   'var(--space-5)',
        paddingRight:  'var(--space-5)',
        paddingTop:    'var(--space-7)',
        paddingBottom: 'var(--space-7)',
      }}
    >
      <div className="flex flex-1 min-h-0 flex-col items-center justify-center w-full">
        <PeekGhostSprite />
      </div>
      <PeekGhostLabel label={label} exposed={exposed} exiting={exiting} />
    </div>
  )
}
