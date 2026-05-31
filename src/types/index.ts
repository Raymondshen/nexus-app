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

export interface Profile {
  id: string
  username: string
  avatar_class: AvatarClass | null
  created_at: string
}

export interface Crew {
  id: string
  name: string
  invite_code: string
  level: number
  total_xp: number
  created_at: string
}

export interface CrewMember {
  id: string
  crew_id: string
  user_id: string
  class: AvatarClass | null
  joined_at: string
}

export interface Message {
  id: string
  crew_id: string
  user_id: string
  content: string
  message_type: MessageType
  element_type: ElementType | null
  xp_awarded: number | null
  created_at: string
}

export interface CrewXPLog {
  id: string
  crew_id: string
  user_id: string
  xp_amount: number
  source: string
  created_at: string
}

export interface Boss {
  id: string
  name: string
  type: BossType
  max_hp: number
  weak_element: ElementType | null
  description: string | null
}

export interface ActiveRaid {
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

export interface Artifact {
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
      }
      crew_members: {
        Row: CrewMember
        Insert: Omit<CrewMember, 'id' | 'joined_at'> & { id?: string; joined_at?: string }
        Update: Partial<Omit<CrewMember, 'id'>>
      }
      messages: {
        Row: Message
        Insert: Omit<Message, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<Message, 'id'>>
      }
      crew_xp_log: {
        Row: CrewXPLog
        Insert: Omit<CrewXPLog, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<CrewXPLog, 'id'>>
      }
      bosses: {
        Row: Boss
        Insert: Omit<Boss, 'id'> & { id?: string }
        Update: Partial<Omit<Boss, 'id'>>
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
      }
      artifacts: {
        Row: Artifact
        Insert: Omit<Artifact, 'id' | 'earned_at'> & { id?: string; earned_at?: string }
        Update: Partial<Omit<Artifact, 'id'>>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
