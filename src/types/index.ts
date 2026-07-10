// Re-export all domain type sub-files so existing `import { X } from '@/types'` continues to work.
export * from './shared'
export * from './profile'
export * from './chat'
export * from './notifications'
export * from './friends'
export * from './events'
export * from './board'
export * from './combat'
export * from './system'

// ─── Local imports for use in Database type ───────────────────────────────────
import type { Profile, GemClaimResult, CoinLog, FriendshipXP, FriendshipXPLog, ProfilePhoto, UsernameHistory, UserPresence } from './profile'
import type { Crew, CrewMember, Message, CrewXPLog, Announcement, Poll, SquadDefinition, DefinitionSuggestion } from './chat'
import type { PushSubscription, NotificationPreferences, CrewNotificationPreferences } from './notifications'
import type { Friendship } from './friends'
import type { Event, EventRsvp } from './events'
import type { Note, BoardSection } from './board'
import type { ActiveRaid, CombatMember, ReviveToken } from './combat'
import type { ReservedUser, AppInvite, ClientError, PendingDeletion } from './system'

// ─── Supabase Database type ───────────────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at' | 'avatar_url' | 'coins' | 'custom_avatar' | 'gem_balance' | 'last_gem_claim' | 'is_dev' | 'needs_username_reset'> & { created_at?: string; avatar_url?: string | null; coins?: number; custom_avatar?: boolean; gem_balance?: number; last_gem_claim?: string | null; is_dev?: boolean; needs_username_reset?: boolean }
        Update: Partial<Omit<Profile, 'id'>>
        Relationships: []
      }
      profile_photos: {
        Row: ProfilePhoto
        Insert: Omit<ProfilePhoto, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<ProfilePhoto, 'id' | 'created_at'>>
        Relationships: []
      }
      user_presence: {
        Row: UserPresence
        Insert: { user_id: string; last_active_at?: string }
        Update: { last_active_at?: string }
        Relationships: []
      }
      username_history: {
        Row: UsernameHistory
        Insert: Omit<UsernameHistory, 'id' | 'changed_at'> & { id?: string; changed_at?: string }
        Update: Partial<Omit<UsernameHistory, 'id'>>
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
