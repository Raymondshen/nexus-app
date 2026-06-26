export type EventRsvpStatus = 'going' | 'maybe' | 'not_going'

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
