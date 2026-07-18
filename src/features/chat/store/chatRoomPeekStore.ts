import { create } from 'zustand'

// ─── chatRoomPeekStore ──────────────────────────────────────────────────────
// Bridges ChatInput (renders inside each room's own page.tsx, remounts on every
// room-to-room navigation) and ChatRoomPeekLayer (rendered once by the persistent
// chat/[crewId]/layout.tsx, never remounts across room navigation) — see the
// chat-swipe-peek notes in ChatRoomPeekLayer.tsx for the full picture. A Zustand
// store (not React context) because these two components aren't in the same
// subtree: ChatRoomPeekLayer is a sibling of {children}, not an ancestor of it.

export interface RoomMeta {
  name:     string
  imageUrl: string | null
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
}

export const useChatRoomPeekStore = create<ChatRoomPeekStore>((set) => ({
  currentCrewId: null,
  setCurrentRoom: (crewId) => set({ currentCrewId: crewId }),

  roomMeta: {},
  setRoomMeta: (crewId, meta) => set((s) => ({ roomMeta: { ...s.roomMeta, [crewId]: meta } })),

  peek: null,
  setPeek: (peek) => set({ peek }),
}))
