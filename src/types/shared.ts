// Primitive types used across multiple feature domains

export type AvatarClass =
  | 'berserker' | 'sage' | 'ghost' | 'hype_man' | 'the_voice' | 'meme_lord'
  | 'mage' | 'warrior' | 'rogue' | 'healer' | 'archer'

// The 5 selectable classes on the onboarding / join-crew class picker.
// Flavor-only — cosmetic since the boss-fight combat system was removed.
export type CombatClass = 'warrior' | 'healer' | 'archer' | 'rogue' | 'mage'

export type MessageType = 'text' | 'voice' | 'image' | 'reaction' | 'system' | 'poll' | 'event'

export interface OGPreview {
  url:          string
  title?:       string
  description?: string
  image?:       string
  site_name?:   string
  fetched_at:   string
}

export interface GuestUser {
  id: string
  username: string
  isGuest: true
  createdAt: string
}
