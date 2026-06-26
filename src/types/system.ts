export interface ReservedUser extends Record<string, unknown> {
  id:         string
  email:      string
  username:   string
  class:      string | null
  first_name: string | null
  last_name:  string | null
  created_at: string
  converted:  boolean
}

export interface AppInvite extends Record<string, unknown> {
  id:         string
  code:       string
  inviter_id: string | null
  used:       boolean
  used_by:    string | null
  used_at:    string | null
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
