import { create } from 'zustand'

// ─── chatRoomPeekStore ──────────────────────────────────────────────────────
// Bridges ChatInput (renders inside each room's own page.tsx, remounts on every
// room-to-room navigation) and ChatRoomPeekLayer (rendered once by the persistent
// chat/[crewId]/layout.tsx, never remounts across room navigation) — see the
// chat-swipe-peek notes in ChatRoomPeekLayer.tsx for the full picture. A Zustand
// store (not React context) because these two components aren't in the same
// subtree: ChatRoomPeekLayer is a sibling of {children}, not an ancestor of it.

// Shared duration for the swipe-nav arrival crossfade: the real destination SlidePage
// fades its own opacity in over this long (see SlidePage's skipNextSlideEnter(fadeIn)
// param), and ChatRoomPeekLayer keeps itself mounted underneath — still showing the
// ghost/backdrop — for this same duration after the real room lands, so there's
// something underneath to actually fade FROM instead of the peek's ghost popping away
// mid-fade. Both sides read this one constant so they can't drift out of sync. Bumped
// from an original 250ms — that short a crossfade read as an instant pop rather than a
// fade, especially paired with `easeOut`'s naturally front-loaded motion (see the ease
// constant below, which was changed alongside this for the same reason).
export const SWIPE_NAV_ARRIVAL_FADE_MS = 450
// `easeOut` front-loads a fade-in — most of the opacity change happens in the first
// fraction of the duration, then it visibly dawdles at the tail — which is what made the
// old crossfade read as "pops in almost instantly" rather than a smooth reveal. A
// symmetric ease-in-out ramps up AND down, so the reveal has a gradual start as well as
// a gradual finish instead of an abrupt initial jump.
export const SWIPE_NAV_ARRIVAL_FADE_EASE = 'easeInOut' as const

// Reveal→fade choreography for the destination room's ghost/label placeholder (see
// ChatRoomPeekLayer's own doc comment for the full timeline). Per explicit spec: (1) the
// label's own slide-up + fade-in entrance runs for exactly this long — it also doubles as
// the minimum time the ghost plays, unconditionally, before the "has the destination
// actually landed?" check runs, so the check only ever fires once the entrance has
// actually finished (never mid-tween), and so a fast/cached room switch doesn't just
// flash the ghost for a handful of milliseconds before cutting to the real page. Both
// this and the entrance/exit tweens are anchored to `exposed` (see that flag below), not
// to when `peek` itself is created — otherwise the "duration" here would include however
// long the outgoing page took to actually unmount and reveal this layer, which is exactly
// what made the entrance feel instant/skipped in practice before `exposed` was added.
export const PEEK_MIN_REVEAL_MS = 1000
// (3) Once the destination has landed (whichever happens later: this minimum, or the
// actual data load), the ghost keeps running for this much longer before the crossfade —
// and the label's own slide-down + fade-out — starts.
export const PEEK_CONTINUE_MS = 1000

export interface RoomMetaOnlineMember {
  id:        string
  username:  string
  avatarUrl: string | null
}

export interface RoomMeta {
  name:               string
  imageUrl:           string | null
  // Crew cover photo (crews.background_image_url) — not fetched by ensureRoomMeta's
  // original lightweight query, added for ChatRoomSwipePreview's rich card (Figma
  // 577:4895). Nullable same as the column itself.
  backgroundImageUrl: string | null
  level:              number
  memberCount:        number
  // Denormalized crews.last_message_preview, same column Home's own crew list reads
  // directly with no transform.
  lastMessagePreview: string | null
  // Denormalized crews.last_message_at — feeds ChatRoomBrowseSheet's Notifications
  // card (which room to surface + its "N ago" timestamp), alongside lastMessagePreview.
  lastMessageAt:      string | null
  // From get_unread_counts, cutoff = this user's crew_members.last_seen (falling back
  // to joined_at) in that crew — same cutoff Home's own unread badge uses. Always 0 for
  // the room currently open (ChatInput publishes that one directly, no RPC round trip).
  unreadCount:        number
  // user_presence snapshot, via the same computeOnlineIds() helper ChatInput's own
  // live presence uses. Not a live subscription for a room that isn't the one
  // currently open (no presence channel is mounted for it), but refreshed every time
  // ensureRoomMeta is called for an already-cached room (i.e. every time
  // ChatRoomBrowseSheet opens) — see ensureRoomMeta.ts's refreshLiveRoomState. The
  // currently-open room's own entry stays continuously live instead, kept in sync by
  // ChatInput's own "publish own meta" effect off chatStore's onlineUserIds.
  onlineMembers:      RoomMetaOnlineMember[]
}

export interface PeekState {
  targetCrewId: string
  direction:    'left' | 'right'
  /** Live drag offset of the CURRENT (real) room's page — mirrored 1:1 during a drag. */
  x:            number
  phase:        'dragging' | 'committing' | 'cancelling'
}

interface ChatRoomPeekStore {
  // The room whose real ChatInput is currently mounted. ChatRoomPeekLayer clears
  // `peek` once this matches `peek.targetCrewId` — the real room has taken over.
  currentCrewId: string | null
  setCurrentRoom: (crewId: string) => void

  // Light metadata (name/image) for rooms visited or peeked this session — enough
  // for the peek header without a full room fetch. Never expires; a stale name/image
  // for the rest of the session is a non-issue for a transient preview.
  roomMeta:    Record<string, RoomMeta>
  setRoomMeta: (crewId: string, meta: RoomMeta) => void

  peek:    PeekState | null
  setPeek: (peek: PeekState | null) => void

  // True once the ghost/label placeholder has actually become visible to the user — i.e.
  // once whatever was covering it (the outgoing room's real page) has been removed from
  // the DOM. `peek` becomes non-null (and ChatRoomPeekLayer starts rendering the ghost)
  // the instant the user taps a room card, well before that's actually true: Next.js
  // keeps the outgoing page mounted, fully opaque, on top of this layer for however long
  // the destination route takes to resolve. Two different call sites can be the one that
  // flips this, whichever happens first: `chat/[crewId]/loading.tsx` mounting (its own
  // render is `null` in the swipe-nav case, but the mount itself proves the outgoing page
  // was just torn down — the slow path, when the destination route doesn't resolve
  // instantly) or `ChatRoomPeekLayer` itself detecting `currentCrewId === peek.
  // targetCrewId` (the fast path — a cached/instant navigation can skip the loading
  // fallback entirely and mount the real destination page directly, which itself mounts
  // at opacity 0 per `skipNextSlideEnter`'s `fadeIn` param, momentarily exposing this
  // layer through it). Without this, the label's entrance was timed from `peek`'s own
  // creation instead — meaning on any navigation slower than an instant tap, most or all
  // of the entrance tween played out while still fully hidden, and by the time the user
  // could actually see anything, the label was already sitting at its resting state —
  // which is exactly the "feels instant" symptom this was added to fix. `setPeek` resets
  // this to false whenever a new gesture starts.
  exposed:    boolean
  setExposed: (exposed: boolean) => void

  // Flips true once ChatRoomPeekLayer's own reveal→fade timeline (PEEK_MIN_REVEAL_MS,
  // then the "has the destination landed?" check, then PEEK_CONTINUE_MS — see that
  // component's doc comment) has actually run its course. This is the signal SlidePage's
  // `fadeInOnSkip` branch waits on before starting the destination page's own opacity
  // crossfade, instead of starting it the instant the page mounts (see both components'
  // doc comments for the full choreography). `setPeek` resets this to false whenever a
  // new gesture starts, so a stale `true` from a previous room switch can't leak into
  // the next one.
  revealReady:    boolean
  setRevealReady: (ready: boolean) => void

  // Flips true once the ghost's own reveal timeline (PEEK_MIN_REVEAL_MS + the
  // landed-check + PEEK_CONTINUE_MS) has run its course — this is what starts the
  // label's reversed exit text animation (ChatRoomPeekLayer's `PeekGhostLabel`).
  // Deliberately a separate flag from `revealReady`: the label's own reverse exit runs
  // for a full second before the destination page's crossfade is allowed to start (see
  // ChatRoomPeekLayer's doc comment) — `revealReady` only flips once that text exit is
  // ~90% played out, not the instant it begins. `setPeek` resets this to false whenever
  // a new gesture starts, same as `exposed`/`revealReady`.
  textExiting:    boolean
  setTextExiting: (exiting: boolean) => void

  // Live rendered height of the current room's ChatSquadDetailBar + input box
  // (ChatInput's own outermost element, measured via ResizeObserver — see ChatInput's
  // chatInputBoxRef effect). Since only the message-history log container now slides
  // during a room-swipe (the bar/input stay put — see ChatInput's handleTopPan* doc
  // comment), ChatRoomPeekLayer needs this to inset its message-log ghost preview by the
  // same amount so it lines up with the real MessageList's own bounding box instead of
  // extending underneath the real, static input area. Defaults to a reasonable estimate
  // so the very first swipe (before ChatInput's observer has fired) isn't misaligned.
  chatInputHeight:    number
  setChatInputHeight: (h: number) => void
}

export const useChatRoomPeekStore = create<ChatRoomPeekStore>((set) => ({
  currentCrewId: null,
  setCurrentRoom: (crewId) => set({ currentCrewId: crewId }),

  roomMeta: {},
  setRoomMeta: (crewId, meta) => set((s) => ({ roomMeta: { ...s.roomMeta, [crewId]: meta } })),

  peek: null,
  setPeek: (peek) => set(peek ? { peek, exposed: false, revealReady: false, textExiting: false } : { peek }),

  exposed: false,
  setExposed: (exposed) => set((s) => (s.exposed === exposed ? s : { exposed })),

  revealReady: false,
  setRevealReady: (ready) => set({ revealReady: ready }),

  textExiting: false,
  setTextExiting: (exiting) => set({ textExiting: exiting }),

  chatInputHeight: 140,
  setChatInputHeight: (h) => set((s) => (s.chatInputHeight === h ? s : { chatInputHeight: h })),
}))
