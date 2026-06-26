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
  value?:    number
  text:      string
  ts:        number
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
