/** Ids whose last-active timestamp is within thresholdMs of now. */
export function computeOnlineIds(
  lastActiveMap: Record<string, number>,
  thresholdMs: number,
  now: number = Date.now(),
): Set<string> {
  const ids = new Set<string>()
  for (const [id, ts] of Object.entries(lastActiveMap)) {
    if (now - ts < thresholdMs) ids.add(id)
  }
  return ids
}

export function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const id of a) {
    if (!b.has(id)) return false
  }
  return true
}
