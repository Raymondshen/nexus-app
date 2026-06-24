// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface GuestUser {
  id: string
  username: string
  isGuest: true
  createdAt: string
}

// ─── OpenGraph preview ────────────────────────────────────────────────────────

export interface OGPreview {
  url:          string
  title?:       string
  description?: string
  image?:       string
  site_name?:   string
  fetched_at:   string
}

// ─── Enums ────────────────────────────────────────────────────────────────────

export type MessageType = 'text' | 'voice' | 'image' | 'reaction' | 'system' | 'poll' | 'event'
export type EventRsvpStatus = 'going' | 'maybe' | 'not_going'
export type AvatarClass = 'berserker' | 'sage' | 'ghost' | 'hype_man' | 'the_voice' | 'meme_lord' | 'mage' | 'warrior' | 'rogue' | 'healer' | 'archer'

// ─── Row types ────────────────────────────────────────────────────────────────

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
  last_active_at: string | null
  created_at: string
}

export interface GemClaimResult extends Record<string, unknown> {
  claimed:     boolean
  gem_balance: number
  message?:    string
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

export interface CoinLog extends Record<string, unknown> {
  id: string
  user_id: string
  crew_id: string | null
  coins: number
  source: string
  created_at: string
}

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

export interface CrewXPLog extends Record<string, unknown> {
  id: string
  crew_id: string
  user_id: string
  xp_amount: number
  source: string
  created_at: string
}

export interface PushSubscription extends Record<string, unknown> {
  id: string
  user_id: string
  crew_id: string | null
  endpoint: string
  p256dh: string
  auth: string
  created_at: string
}

export interface NotificationPreferences extends Record<string, unknown> {
  user_id:        string
  notif_messages: boolean
  notif_mentions: boolean
  updated_at:     string
}

export interface CrewNotificationMute extends Record<string, unknown> {
  user_id: string
  crew_id: string
}

export interface CrewNotificationPreferences extends Record<string, unknown> {
  user_id:        string
  crew_id:        string
  notif_messages: boolean
  notif_mentions: boolean
  updated_at:     string
}

// ─── Derived / joined types ───────────────────────────────────────────────────

export interface MessageWithProfile extends Message {
  profile: Pick<Profile, 'id' | 'username' | 'avatar_class' | 'avatar_url'>
}

export interface ReservedUser extends Record<string, unknown> {
  id: string
  email: string
  username: string
  class: string | null
  first_name: string | null
  last_name: string | null
  created_at: string
  converted: boolean
}

export interface Announcement extends Record<string, unknown> {
  id:         string
  text:       string
  active:     boolean
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

export type SquadDefinitionWithCreator = SquadDefinition & { creator_username?: string; suggestion_count?: number }

export interface DefinitionSuggestion extends Record<string, unknown> {
  id:                   string
  definition_id:        string
  crew_id:              string
  suggester_id:         string
  suggested_definition: string
  created_at:           string
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

export interface Event extends Record<string, unknown> {
  id:              string
  crew_id:         string
  title:           string
  description:     string | null
  location:        string | null
  event_date:      string
  cover_image_url: string | null
  created_by:      string
  created_at:      string
}

export interface EventRsvp extends Record<string, unknown> {
  event_id:   string
  user_id:    string
  status:     EventRsvpStatus
  updated_at: string
}

export interface AppInvite extends Record<string, unknown> {
  id: string
  code: string
  inviter_id: string | null
  used: boolean
  used_by: string | null
  used_at: string | null
  created_at: string
}

export interface ClientError extends Record<string, unknown> {
  id:         string
  user_id:    string | null
  username:   string | null
  email:      string | null
  message:    string
  stack:      string | null
  url:        string | null
  created_at: string
}

export interface PendingDeletion extends Record<string, unknown> {
  user_id:      string
  requested_at: string
  delete_at:    string
}

export interface Note extends Record<string, unknown> {
  id:             string
  crew_id:        string
  created_by:     string
  url:            string
  og_title:       string | null
  og_image_url:   string | null
  source_domain:  string | null
  section_id:     string | null
  created_at:     string
}

/** Note row returned to the client (url included for navigation, never rendered as visible text) */
export interface PublicNote extends Record<string, unknown> {
  id:            string
  crew_id:       string
  created_by:    string
  url:           string
  og_title:      string | null
  og_image_url:  string | null
  source_domain: string | null
  section_id:    string | null
  created_at:    string
}

export interface BoardSection extends Record<string, unknown> {
  id:         string
  crew_id:    string
  created_by: string
  name:       string
  position:   number
  created_at: string
}

// ─── Combat (Phase 2 — dev-gated) ────────────────────────────────────────────

export type CombatClass = 'warrior' | 'healer' | 'archer' | 'rogue' | 'mage'

export type CombatEventKind =
  | 'player_attack'
  | 'player_crit'
  | 'ability_used'
  | 'boss_attack'
  | 'member_downed'
  | 'member_revived'
  | 'boss_spawn'
  | 'raid_victory'
  | 'raid_escaped'
  | 'heal'
  | 'self_heal'
  | 'stat_boost'

export interface CombatEvent {
  id:        string
  kind:      CombatEventKind
  actorId?:  string
  targetId?: string
  value?:    number         // damage / heal amount
  text:      string         // game-voice copy, pre-rendered
  ts:        number         // Date.now()
}

export interface ActiveRaid extends Record<string, unknown> {
  id:                 string
  crew_id:            string
  boss_id:            string
  current_hp:         number
  max_hp:             number
  phase:              number
  started_at:         string
  expires_at:         string
  defeated_at:        string | null
  mvp_user_id:        string | null
  expiry_notif_sent:  boolean
  last_boss_attack_at: string | null
  guard_user_id:       string | null
  guard_expires_at:    string | null
  volley_expires_at:   string | null
}

export interface CombatMember extends Record<string, unknown> {
  id:               string
  raid_id:          string
  user_id:          string
  class:            CombatClass
  current_hp:       number
  max_hp:           number
  ability_bank:     number
  is_downed:        boolean
  downed_at:        string | null
  guard_expires_at: string | null
  momentum_stack:   number
  last_msg_at:      string | null
  created_at:       string
}

export interface ReviveToken extends Record<string, unknown> {
  crew_id: string
  count:   number
}

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

// ─── Supabase Database type ───────────────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at' | 'avatar_url' | 'coins' | 'custom_avatar' | 'gem_balance' | 'last_gem_claim' | 'is_dev'> & { created_at?: string; avatar_url?: string | null; coins?: number; custom_avatar?: boolean; gem_balance?: number; last_gem_claim?: string | null; is_dev?: boolean }
        Update: Partial<Omit<Profile, 'id'>>
        Relationships: []
      }
      coin_log: {
        Row: CoinLog
        Insert: Omit<CoinLog, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<CoinLog, 'id'>>
        Relationships: []
      }
      crews: {
        Row: Crew
        Insert: Omit<Crew, 'id' | 'created_at' | 'level' | 'total_xp'> & {
          id?: string
          created_at?: string
          level?: number
          total_xp?: number
        }
        Update: Partial<Omit<Crew, 'id'>>
        Relationships: []
      }
      crew_members: {
        Row: CrewMember
        Insert: Omit<CrewMember, 'id' | 'joined_at' | 'last_seen'> & { id?: string; joined_at?: string; last_seen?: string | null }
        Update: Partial<Omit<CrewMember, 'id'>>
        Relationships: []
      }
      messages: {
        Row: Message
        Insert: Omit<Message, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<Message, 'id'>>
        Relationships: []
      }
      crew_xp_log: {
        Row: CrewXPLog
        Insert: Omit<CrewXPLog, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<CrewXPLog, 'id'>>
        Relationships: []
      }
      push_subscriptions: {
        Row: PushSubscription
        Insert: Omit<PushSubscription, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<PushSubscription, 'id'>>
        Relationships: []
      }
      notification_preferences: {
        Row: NotificationPreferences
        Insert: Omit<NotificationPreferences, 'updated_at'> & { updated_at?: string }
        Update: Partial<Omit<NotificationPreferences, 'user_id'>>
        Relationships: []
      }
      crew_notification_mutes: {
        Row: CrewNotificationMute
        Insert: CrewNotificationMute
        Update: Partial<CrewNotificationMute>
        Relationships: []
      }
      crew_notification_preferences: {
        Row: CrewNotificationPreferences
        Insert: Omit<CrewNotificationPreferences, 'updated_at'> & { updated_at?: string }
        Update: Partial<Omit<CrewNotificationPreferences, 'user_id' | 'crew_id'>>
        Relationships: []
      }
      friendships: {
        Row: Friendship
        Insert: Omit<Friendship, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Pick<Friendship, 'status'>>
        Relationships: []
      }
      announcements: {
        Row: Announcement
        Insert: Omit<Announcement, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<Announcement, 'id' | 'created_at'>>
        Relationships: []
      }
      app_invites: {
        Row: AppInvite
        Insert: Omit<AppInvite, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<AppInvite, 'id'>>
        Relationships: []
      }
      polls: {
        Row: Poll
        Insert: Omit<Poll, 'id' | 'votes' | 'created_at'> & { id?: string; votes?: Record<string, string[]>; created_at?: string }
        Update: Partial<Omit<Poll, 'id' | 'created_at'>>
        Relationships: []
      }
      reserved_users: {
        Row: ReservedUser
        Insert: Omit<ReservedUser, 'id' | 'created_at' | 'converted'> & { id?: string; created_at?: string; converted?: boolean }
        Update: Partial<Omit<ReservedUser, 'id'>>
        Relationships: []
      }
      squad_definitions: {
        Row: SquadDefinition
        Insert: Omit<SquadDefinition, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<SquadDefinition, 'id' | 'created_at'>>
        Relationships: []
      }
      definition_suggestions: {
        Row: DefinitionSuggestion
        Insert: Omit<DefinitionSuggestion, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<DefinitionSuggestion, 'id' | 'created_at'>>
        Relationships: []
      }
      client_errors: {
        Row: ClientError
        Insert: Omit<ClientError, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: never
        Relationships: []
      }
      pending_deletions: {
        Row: PendingDeletion
        Insert: Omit<PendingDeletion, 'requested_at' | 'delete_at'> & { requested_at?: string; delete_at?: string }
        Update: Partial<PendingDeletion>
        Relationships: []
      }
      friendship_xp: {
        Row: FriendshipXP
        Insert: Omit<FriendshipXP, 'id' | 'updated_at'> & { id?: string; updated_at?: string }
        Update: Partial<Omit<FriendshipXP, 'id'>>
        Relationships: []
      }
      friendship_xp_log: {
        Row: FriendshipXPLog
        Insert: Omit<FriendshipXPLog, 'id' | 'awarded_at'> & { id?: string; awarded_at?: string }
        Update: never
        Relationships: []
      }
      events: {
        Row: Event
        Insert: Omit<Event, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<Event, 'id' | 'created_at' | 'crew_id' | 'created_by'>>
        Relationships: []
      }
      event_rsvps: {
        Row: EventRsvp
        Insert: Omit<EventRsvp, 'updated_at'> & { updated_at?: string }
        Update: Partial<Pick<EventRsvp, 'status' | 'updated_at'>>
        Relationships: []
      }
      notes: {
        Row: Note
        Insert: Omit<Note, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Pick<Note, 'og_title' | 'og_image_url' | 'source_domain' | 'section_id'>>
        Relationships: []
      }
      board_sections: {
        Row: BoardSection
        Insert: Omit<BoardSection, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Pick<BoardSection, 'name' | 'position'>>
        Relationships: []
      }
      active_raids: {
        Row: ActiveRaid
        Insert: Omit<ActiveRaid, 'id' | 'expiry_notif_sent' | 'last_boss_attack_at' | 'guard_user_id' | 'guard_expires_at' | 'volley_expires_at'> & { id?: string; expiry_notif_sent?: boolean; last_boss_attack_at?: string | null; guard_user_id?: string | null; guard_expires_at?: string | null; volley_expires_at?: string | null }
        Update: Partial<Omit<ActiveRaid, 'id'>>
        Relationships: []
      }
      crew_combat_members: {
        Row: CombatMember
        Insert: Omit<CombatMember, 'id' | 'created_at' | 'is_downed' | 'momentum_stack'> & { id?: string; created_at?: string; is_downed?: boolean; momentum_stack?: number }
        Update: Partial<Omit<CombatMember, 'id' | 'raid_id' | 'user_id' | 'created_at'>>
        Relationships: []
      }
      revive_tokens: {
        Row: ReviveToken
        Insert: ReviveToken
        Update: Partial<Pick<ReviveToken, 'count'>>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      create_crew: {
        Args: { p_name: string; p_invite_code: string }
        Returns: string
      }
      join_crew: {
        Args: { p_invite_code: string }
        Returns: string
      }
      insert_message: {
        Args: {
          p_crew_id:          string
          p_content:          string
          p_message_type:     string
          p_reply_to_id?:     string | null
          p_reply_preview?:   string | null
          p_reply_username?:  string | null
          p_image_url?:       string | null
          p_image_blur_hash?: string | null
        }
        Returns: Message
      }
      leave_crew: {
        Args: { p_crew_id: string }
        Returns: Record<string, unknown>
      }
      get_or_create_dm: {
        Args: { other_user_id: string }
        Returns: string
      }
      get_unread_counts: {
        Args: { p_crew_ids: string[]; p_cutoffs: string[] }
        Returns: Array<{ crew_id: string; unread_count: number }>
      }
      get_crew_member_msg_counts: {
        Args: { p_crew_id: string }
        Returns: Array<{ user_id: string; msg_count: number }>
      }
      get_member_crew_stats: {
        Args: { p_crew_id: string; p_user_id: string }
        Returns: Array<{ msg_count: number; total_xp: number }>
      }
      increment_user_coins: {
        Args: { p_user_id: string; p_amount: number }
        Returns: void
      }
      toggle_reaction: {
        Args: { p_message_id: string; p_emoji: string; p_user_id: string }
        Returns: Record<string, string[]>
      }
      create_poll: {
        Args: { p_crew_id: string; p_question: string; p_options: string[]; p_expires_at: string }
        Returns: Message
      }
      vote_on_poll: {
        Args: { p_poll_id: string; p_option_index: number }
        Returns: Record<string, string[]>
      }
      close_poll: {
        Args: { p_poll_id: string }
        Returns: void
      }
      increment_friendship_xp: {
        Args: { p_user_a: string; p_user_b: string; p_amount: number }
        Returns: number
      }
      claim_daily_gem: {
        Args: { p_user_id: string; p_local_midnight: string }
        Returns: GemClaimResult
      }
      pin_message: {
        Args: { p_message_id: string; p_duration_minutes?: number | null }
        Returns: Record<string, unknown>
      }
      unpin_message: {
        Args: { p_message_id: string }
        Returns: Record<string, unknown>
      }
      update_active: {
        Args: Record<string, never>
        Returns: void
      }
      init_combat_members: {
        Args: { p_raid_id: string; p_crew_id: string; p_crew_level: number }
        Returns: void
      }
      apply_boss_damage: {
        Args: { p_raid_id: string; p_member_id: string; p_final_dmg: number }
        Returns: Array<{ new_hp: number; is_downed: boolean; downed_at: string | null }>
      }
      use_revive_token: {
        Args: { p_raid_id: string; p_target_user_id: string }
        Returns: Record<string, unknown>
      }
      damage_raid: {
        Args: { p_raid_id: string; p_damage: number; p_user_id: string }
        Returns: Array<{ current_hp: number; phase: number; defeated_at: string | null }>
      }
    }
    Enums: Record<string, never>
  }
}
