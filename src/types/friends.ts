import type { AvatarClass } from './shared'

export type FriendshipStatus = 'pending' | 'accepted'

export interface Friendship extends Record<string, unknown> {
  id: string
  requester_id: string
  addressee_id: string
  status: FriendshipStatus
  created_at: string
}

export interface FriendProfile {
  id: string
  username: string
  avatar_url: string | null
  avatar_class: AvatarClass | null
  status?: string | null
}
