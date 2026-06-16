import { get, set } from 'idb-keyval'
import { GEM_IDB_KEY } from '@/lib/config'

function mostRecentLocalMidnight(): number {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime()
}

// Display/debounce gate only — never the award decision. The server (award-gem
// Edge Function + claim_daily_gem RPC) is the sole authority on whether a gem is granted.
export async function isGemGateOpen(): Promise<boolean> {
  const claimedAt = await get<number>(GEM_IDB_KEY)
  if (typeof claimedAt !== 'number') return true
  return claimedAt < mostRecentLocalMidnight()
}

export async function recordGemClaim(): Promise<void> {
  await set(GEM_IDB_KEY, Date.now())
}
