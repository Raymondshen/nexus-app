import { createClient } from '@/shared/supabase/client'
import { useChatRoomPeekStore, type RoomMeta } from '@/features/chat/store/chatRoomPeekStore'
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
  if (inFlight.has(crewId)) return
  const cached = roomMeta[crewId]
  if (cached) {
    await refreshUnreadCount(crewId, userId, cached)
    return
  }
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

// A room's full RoomMeta (name/image/level/member count/online members) is cheap to
// leave as a one-shot snapshot from whenever it was first peeked — that stuff rarely
// changes mid-session. unreadCount is different: it's exactly what ChatRoomBrowseSheet
// exists to surface accurately (the red equalizer bar + "N unread messages" footer), so
// a room peeked early in the session can't keep showing a permanently-stale count after
// new messages arrive while you're chatting elsewhere. This refetches just that field —
// same cutoff/RPC ensureRoomMeta's full fetch uses — and patches it into the existing
// cached RoomMeta, every time ensureRoomMeta is called for an already-cached room (i.e.
// every time ChatRoomBrowseSheet opens).
async function refreshUnreadCount(crewId: string, userId: string, cached: RoomMeta): Promise<void> {
  inFlight.add(crewId)
  try {
    const supabase = createClient()
    const { data: memberRow } = await supabase
      .from('crew_members')
      .select('last_seen, joined_at')
      .eq('crew_id', crewId)
      .eq('user_id', userId)
      .maybeSingle()
    const row    = memberRow as { last_seen: string | null; joined_at: string } | null
    const cutoff = row?.last_seen ?? row?.joined_at ?? new Date(0).toISOString()

    const { data: unreadData } = await supabase.rpc('get_unread_counts', { p_crew_ids: [crewId], p_cutoffs: [cutoff] })
    const unreadCount = unreadData?.[0]?.unread_count ?? 0

    // Re-read current cached meta rather than closing over the stale `cached` param —
    // ChatInput's own "publish own meta" effect (see its doc comment) could have
    // overwritten this room's entry while this request was in flight.
    const latest = useChatRoomPeekStore.getState().roomMeta[crewId] ?? cached
    useChatRoomPeekStore.getState().setRoomMeta(crewId, { ...latest, unreadCount })
  } finally {
    inFlight.delete(crewId)
  }
}
