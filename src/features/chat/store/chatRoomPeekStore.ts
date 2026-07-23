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
// mid-fade. Both sides read this one constant so they can't drift out of sync.
export const SWIPE_NAV_ARRIVAL_FADE_MS = 250

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
  /** Merges many rooms' worth of RoomMeta in a single `set()` — one re-render of
   *  every `roomMeta` subscriber (e.g. ChatRoomPeekLayer, mounted for the whole
   *  chat/[crewId] layout) instead of one per room. Used by ChatSquadsPage.tsx to
   *  seed its whole server-fetched room list on mount without looping
   *  `setRoomMeta` — see that call site's own doc comment. */
  setRoomMetaBulk: (entries: Record<string, RoomMeta>) => void

  peek:    PeekState | null
  setPeek: (peek: PeekState | null) => void

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
  setRoomMetaBulk: (entries) => set((s) => ({ roomMeta: { ...s.roomMeta, ...entries } })),

  peek: null,
  setPeek: (peek) => set({ peek }),

  chatInputHeight: 140,
  setChatInputHeight: (h) => set((s) => (s.chatInputHeight === h ? s : { chatInputHeight: h })),
}))
