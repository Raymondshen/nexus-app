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
