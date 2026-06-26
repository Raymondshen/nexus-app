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
