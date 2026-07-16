import type { AvatarClass } from './shared'

export interface Profile extends Record<string, unknown> {
  id: string
  username: string
  first_name: string | null
  last_name: string | null
  avatar_class: AvatarClass | null
  avatar_url: string | null
  avatar_storage_key: string | null
  background_url: string | null
  background_storage_key: string | null
  birthday: string | null
  coins: number
  custom_avatar: boolean
  status: string | null
  friendship_xp_enabled: boolean
  is_dev: boolean
  gem_balance: number
  last_gem_claim: string | null
  needs_username_reset: boolean
  instagram_url: string | null
  x_url: string | null
  reddit_url: string | null
  linkedin_url: string | null
  custom_site_url: string | null
  created_at: string
}

export interface UserPresence extends Record<string, unknown> {
  user_id: string
  last_active_at: string
}

export interface GemClaimResult extends Record<string, unknown> {
  claimed:     boolean
  gem_balance: number
  message?:    string
}

export interface CoinLog extends Record<string, unknown> {
  id: string
  user_id: string
  crew_id: string | null
  coins: number
  source: string
  created_at: string
}

export interface FriendshipXP extends Record<string, unknown> {
  id: string
  user_a: string
  user_b: string
  total_xp: number
  updated_at: string
}

export interface FriendshipXPLog extends Record<string, unknown> {
  id: string
  user_a: string
  user_b: string
  xp_awarded: number
  source: 'dm' | 'mention'
  awarded_at: string
}

export interface ProfilePhoto extends Record<string, unknown> {
  id:          string
  user_id:     string
  url:         string
  storage_key: string
  created_at:  string
}

export interface UsernameHistory extends Record<string, unknown> {
  id:           string
  user_id:      string
  old_username: string
  changed_at:   string
}
