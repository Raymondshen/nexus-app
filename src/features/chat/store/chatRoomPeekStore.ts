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

export interface RoomMeta {
  name:        string
  imageUrl:    string | null
  level:       number
  memberCount: number
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
  setPeek: (peek) => set({ peek }),

  chatInputHeight: 140,
  setChatInputHeight: (h) => set((s) => (s.chatInputHeight === h ? s : { chatInputHeight: h })),
}))
