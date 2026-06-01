export const ARTIFACT_DROP_PREFIX = 'ARTIFACT_DROP:'
export const LEVEL_UP_PREFIX      = 'LEVEL_UP:'

export function parseArtifactDropId(content: string): string | null {
  if (!content.startsWith(ARTIFACT_DROP_PREFIX)) return null
  return content.slice(ARTIFACT_DROP_PREFIX.length).trim() || null
}

export function parseLevelUp(content: string): number | null {
  if (!content.startsWith(LEVEL_UP_PREFIX)) return null
  const n = parseInt(content.slice(LEVEL_UP_PREFIX.length).trim(), 10)
  return isNaN(n) ? null : n
}

export interface ArtifactMeta {
  passive_bonus?: string
  active_bonus?:  string
  lore?:          string
  boss_name?:     string
  participant_names?: string[]
  mvp_username?:  string
  is_sage_mage?:  boolean
}
