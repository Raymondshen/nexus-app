type PreviewEntry = { content: string; created_at: string; sender: string }

const cache = new Map<string, PreviewEntry>()

export function setHomeLastMessage(crewId: string, entry: PreviewEntry): void {
  cache.set(crewId, entry)
}

export function consumeHomeLastMessage(crewId: string): PreviewEntry | undefined {
  const entry = cache.get(crewId)
  if (entry) cache.delete(crewId)
  return entry
}
