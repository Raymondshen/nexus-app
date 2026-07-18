import { createClient } from '@/shared/supabase/client'
import { useChatRoomPeekStore } from '@/features/chat/store/chatRoomPeekStore'
import { computeOnlineIds } from '@/shared/utils/presence'
import { PRESENCE_ONLINE_THRESHOLD_MS } from '@/shared/constants/config'

// Rooms already visited this session have their name/image seeded into
// chatRoomPeekStore by ChatInput on mount (see setCurrentRoom's call site) — this
// covers the common case for free. This fetch only fires for a room being peeked
// that hasn't been visited yet: every candidate crewId comes from chatRoomOrder (the
// caller's own crews), so all of this is RLS-safe for `userId` (also the caller's own
// id, needed for the unread-count cutoff below).
const inFlight = new Set<string>()

interface CrewMemberRow {
  user_id:   string
  last_seen: string | null
  joined_at: string
  profiles:  { username: string; avatar_url: string | null } | null
}

export async function ensureRoomMeta(crewId: string, userId: string): Promise<void> {
  const { roomMeta, setRoomMeta } = useChatRoomPeekStore.getState()
  if (roomMeta[crewId] || inFlight.has(crewId)) return
  inFlight.add(crewId)
  try {
    const supabase = createClient()
    const [{ data: crewData }, { data: memberData, count: memberCount }] = await Promise.all([
      supabase.from('crews').select('name, image_url, background_image_url, level, last_message_preview').eq('id', crewId).single(),
      supabase.from('crew_members').select('user_id, last_seen, joined_at, profiles(username, avatar_url)', { count: 'exact' }).eq('crew_id', crewId),
    ])
    if (!crewData) return
    const crewRow    = crewData as { name: string; image_url: string | null; background_image_url: string | null; level: number; last_message_preview: string | null }
    const memberRows = (memberData ?? []) as unknown as CrewMemberRow[]

    // Same cutoff Home's own unread badge uses: this user's own last_seen in the crew,
    // falling back to joined_at for a member who's never left a last_seen behind.
    const selfRow = memberRows.find((r) => r.user_id === userId)
    const cutoff  = selfRow?.last_seen ?? selfRow?.joined_at ?? new Date(0).toISOString()

    const memberIds = memberRows.map((r) => r.user_id)
    const [{ data: presenceData }, unreadResult] = await Promise.all([
      memberIds.length > 0
        ? supabase.from('user_presence').select('user_id, last_active_at').in('user_id', memberIds)
        : Promise.resolve({ data: [] as { user_id: string; last_active_at: string }[] }),
      supabase.rpc('get_unread_counts', { p_crew_ids: [crewId], p_cutoffs: [cutoff] }),
    ])

    const lastActiveMap: Record<string, number> = {}
    for (const row of presenceData ?? []) {
      lastActiveMap[(row as { user_id: string; last_active_at: string }).user_id] =
        new Date((row as { user_id: string; last_active_at: string }).last_active_at).getTime()
    }
    const onlineIds = computeOnlineIds(lastActiveMap, PRESENCE_ONLINE_THRESHOLD_MS)

    const onlineMembers = memberRows
      .filter((r) => onlineIds.has(r.user_id))
      .map((r) => ({ id: r.user_id, username: r.profiles?.username ?? '???', avatarUrl: r.profiles?.avatar_url ?? null }))

    setRoomMeta(crewId, {
      name:               crewRow.name,
      imageUrl:           crewRow.image_url,
      backgroundImageUrl: crewRow.background_image_url,
      level:              crewRow.level,
      memberCount:        memberCount ?? 0,
      lastMessagePreview: crewRow.last_message_preview,
      unreadCount:        unreadResult.data?.[0]?.unread_count ?? 0,
      onlineMembers,
    })
  } finally {
    inFlight.delete(crewId)
  }
}
