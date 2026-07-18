import type { MessageWithProfile } from '@/types'

const PEEK_MESSAGE_LIMIT = 12

/**
 * Synchronous read of a room's sessionStorage message cache (`nexus-msgs-{crewId}`,
 * written by MessageList — see CLAUDE.md's "Three-tier cache") for ChatRoomPeekLayer's
 * cached-snapshot preview during a swipe. Deliberately session-storage-only, not the IDB
 * fallback MessageList also checks: IDB access is async, and a peek that's about to be
 * fully replaced by the real room in ~150ms isn't worth the extra round trip — a room
 * with no sessionStorage snapshot just falls back to the loading-skeleton preview.
 * Returns the most recent PEEK_MESSAGE_LIMIT messages, oldest first, or null if nothing
 * usable is cached.
 */
export function readCachedRoomMessages(crewId: string): MessageWithProfile[] | null {
  try {
    const raw = sessionStorage.getItem(`nexus-msgs-${crewId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Support old format (plain array) and current format ({ messages, savedAt })
    const msgs = (Array.isArray(parsed) ? parsed : parsed?.messages) as MessageWithProfile[] | undefined
    if (!Array.isArray(msgs) || msgs.length === 0) return null
    return msgs.slice(-PEEK_MESSAGE_LIMIT)
  } catch {
    return null
  }
}
