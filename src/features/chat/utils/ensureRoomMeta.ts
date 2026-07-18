import { createClient } from '@/shared/supabase/client'
import { useChatRoomPeekStore } from '@/features/chat/store/chatRoomPeekStore'

// Rooms already visited this session have their name/image seeded into
// chatRoomPeekStore by ChatInput on mount (see setCurrentRoom's call site) — this
// covers the common case for free. This fetch only fires for a room being peeked
// that hasn't been visited yet: a single indexed-PK row, RLS-safe since every
// candidate crewId comes from chatRoomOrder (the caller's own crews).
const inFlight = new Set<string>()

export async function ensureRoomMeta(crewId: string): Promise<void> {
  const { roomMeta, setRoomMeta } = useChatRoomPeekStore.getState()
  if (roomMeta[crewId] || inFlight.has(crewId)) return
  inFlight.add(crewId)
  try {
    const supabase = createClient()
    const { data } = await supabase.from('crews').select('name, image_url').eq('id', crewId).single()
    if (data) {
      const row = data as { name: string; image_url: string | null }
      setRoomMeta(crewId, { name: row.name, imageUrl: row.image_url })
    }
  } finally {
    inFlight.delete(crewId)
  }
}
