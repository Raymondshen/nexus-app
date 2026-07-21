export interface PushSubscription extends Record<string, unknown> {
  id: string
  user_id: string
  crew_id: string | null
  endpoint: string
  p256dh: string
  auth: string
  created_at: string
  last_seen_at: string | null
}

export interface NotificationPreferences extends Record<string, unknown> {
  user_id:        string
  notif_messages: boolean
  notif_mentions: boolean
  notif_replies:  boolean
  updated_at:     string
}

export interface CrewNotificationPreferences extends Record<string, unknown> {
  user_id:        string
  crew_id:        string
  notif_messages: boolean
  notif_mentions: boolean
  notif_replies:  boolean
  updated_at:     string
}
