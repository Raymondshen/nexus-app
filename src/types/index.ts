// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface GuestUser {
  id: string
  username: string
  isGuest: true
  createdAt: string
}

// ─── Enums ────────────────────────────────────────────────────────────────────

export type MessageType = 'text' | 'voice' | 'image' | 'reaction' | 'system'
export type ElementType = 'fire' | 'water' | 'lightning' | 'nature' | 'shadow' | 'arcane'
export type ArtifactRarity = 'common' | 'rare' | 'epic' | 'legendary'
export type BossType = 'void' | 'ghost' | 'flood' | 'scheduled'
export type AvatarClass = 'berserker' | 'sage' | 'ghost' | 'hype_man' | 'the_voice' | 'meme_lord'

// ─── Row types ────────────────────────────────────────────────────────────────

export interface Profile extends Record<string, unknown> {
  id: string
  username: string
  avatar_class: AvatarClass | null
  created_at: string
}

export interface Crew extends Record<string, unknown> {
  id: string
  name: string
  invite_code: string
  level: number
  total_xp: number
  created_at: string
}

export interface CrewMember extends Record<string, unknown> {
  id: string
  crew_id: string
  user_id: string
  class: AvatarClass | null
  joined_at: string
  last_seen: string | null
}

export interface Message extends Record<string, unknown> {
  id: string
  crew_id: string
  user_id: string
  content: string
  message_type: MessageType
  element_type: ElementType | null
  xp_awarded: number | null
  created_at: string
}

export interface CrewXPLog extends Record<string, unknown> {
  id: string
  crew_id: string
  user_id: string
  xp_amount: number
  source: string
  created_at: string
}

export interface Boss extends Record<string, unknown> {
  id: string
  name: string
  type: BossType
  max_hp: number
  weak_element: ElementType | null
  description: string | null
}

export interface ActiveRaid extends Record<string, unknown> {
  id: string
  crew_id: string
  boss_id: string
  current_hp: number
  max_hp: number
  phase: number
  started_at: string
  expires_at: string
  defeated_at: string | null
  mvp_user_id: string | null
}

export interface Artifact extends Record<string, unknown> {
  id: string
  crew_id: string
  name: string
  rarity: ArtifactRarity
  source_boss_id: string
  earned_at: string
  mvp_user_id: string
  asset_type: string
  metadata: Record<string, unknown> | null
}

// ─── Derived / joined types ───────────────────────────────────────────────────

export interface MessageWithProfile extends Message {
  profile: Pick<Profile, 'id' | 'username' | 'avatar_class'>
}

// ─── Supabase Database type ───────────────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at'> & { created_at?: string }
        Update: Partial<Omit<Profile, 'id'>>
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
      bosses: {
        Row: Boss
        Insert: Omit<Boss, 'id'> & { id?: string }
        Update: Partial<Omit<Boss, 'id'>>
        Relationships: []
      }
      active_raids: {
        Row: ActiveRaid
        Insert: Omit<ActiveRaid, 'id' | 'phase' | 'defeated_at' | 'mvp_user_id'> & {
          id?: string
          phase?: number
          defeated_at?: string | null
          mvp_user_id?: string | null
        }
        Update: Partial<Omit<ActiveRaid, 'id'>>
        Relationships: []
      }
      artifacts: {
        Row: Artifact
        Insert: Omit<Artifact, 'id' | 'earned_at'> & { id?: string; earned_at?: string }
        Update: Partial<Omit<Artifact, 'id'>>
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
          p_crew_id: string
          p_content: string
          p_message_type: string
        }
        Returns: Message
      }
    }
    Enums: Record<string, never>
  }
}
