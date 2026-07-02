import type { AvatarClass, MessageType, OGPreview } from './shared'
import type { Profile } from './profile'

export interface Crew extends Record<string, unknown> {
  id: string
  name: string
  invite_code: string
  level: number
  total_xp: number
  created_at: string
  is_dm?: boolean
  dm_partner_1?: string | null
  dm_partner_2?: string | null
  image_url?: string | null
  image_storage_key?: string | null
  background_image_url?: string | null
  last_message_preview?: string | null
  last_message_at?: string | null
  last_message_sender_id?: string | null
}

export interface CrewMember extends Record<string, unknown> {
  id: string
  crew_id: string
  user_id: string
  class: AvatarClass | null
  joined_at: string
  last_seen: string | null
  ability_bank: number
  stat_boosts: Record<string, number>
}

export interface Message extends Record<string, unknown> {
  id: string
  crew_id: string
  user_id: string
  content: string
  message_type: MessageType
  element_type: string | null
  xp_awarded: number | null
  reactions: Record<string, string[]>
  created_at: string
  reply_to_id?:      string | null
  reply_preview?:    string | null
  reply_username?:   string | null
  image_url?:        string | null
  image_blur_hash?:  string | null
  og_preview?:       OGPreview
  pinned?:           boolean
  pinned_by?:        string | null
  pinned_at?:        string | null
  pin_expires_at?:   string | null
  event_id?:         string | null
  /** Client-only stable key for optimistic messages. Never sent to the server. */
  tempId?:           string
}

export interface MessageWithProfile extends Message {
  profile: Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url' | 'status'>
}

export interface CrewXPLog extends Record<string, unknown> {
  id: string
  crew_id: string
  user_id: string
  xp_amount: number
  source: string
  created_at: string
}

export interface Announcement extends Record<string, unknown> {
  id:         string
  text:       string
  active:     boolean
  created_at: string
}

export interface Poll extends Record<string, unknown> {
  id:         string
  message_id: string | null
  crew_id:    string
  creator_id: string
  question:   string
  options:    string[]
  votes:      Record<string, string[]>
  expires_at: string
  closed_at:  string | null
  created_at: string
}

export interface SquadDefinition extends Record<string, unknown> {
  id:          string
  crew_id:     string
  creator_id:  string
  word:        string
  actual_word: string | null
  definition:  string
  created_at:  string
}

export type SquadDefinitionWithCreator = SquadDefinition & {
  creator_username?: string
  suggestion_count?: number
}

export interface DefinitionSuggestion extends Record<string, unknown> {
  id:                   string
  definition_id:        string
  crew_id:              string
  suggester_id:         string
  suggested_definition: string
  created_at:           string
}
