import { createClient } from './client'
import type { RealtimeChannel } from '@supabase/supabase-js'

// A crew's chat screen used to open two separate Realtime channels for the same
// topic — ChatInput's `messages:{crewId}` (broadcast + presence) and MessageList's
// `db:messages:{crewId}` (postgres_changes) — costing two channel-join round trips
// per chat open. This registry shares one channel per crew between both consumers.
//
// Ownership split: every consumer may attach its own `.on()` listeners, but only
// ChatInput calls `.subscribe()` (it already owns the presence/heartbeat lifecycle).
// postgres_changes listeners must be registered before `.subscribe()` fires — ChatInput
// defers its subscribe() call to a microtask (see ChatInput.tsx) so it always runs
// after every same-tick mount effect (regardless of component order) has attached
// its listeners first.
interface RegistryEntry {
  channel:  RealtimeChannel
  refCount: number
}

const registry = new Map<string, RegistryEntry>()

export function acquireCrewMessageChannel(crewId: string, presenceKey: string): RealtimeChannel {
  let entry = registry.get(crewId)
  if (!entry) {
    const supabase = createClient()
    const channel = supabase.channel(`messages:${crewId}`, { config: { presence: { key: presenceKey } } })
    entry = { channel, refCount: 0 }
    registry.set(crewId, entry)
  }
  entry.refCount++
  return entry.channel
}

export function releaseCrewMessageChannel(crewId: string): void {
  const entry = registry.get(crewId)
  if (!entry) return
  entry.refCount--
  if (entry.refCount <= 0) {
    createClient().removeChannel(entry.channel)
    registry.delete(crewId)
  }
}

// True if `channel` is still the live, registered instance for this crew — used to
// guard a deferred subscribe() call against firing on an instance already torn down
// (e.g. React StrictMode's dev-only double mount/cleanup/mount).
export function isActiveCrewMessageChannel(crewId: string, channel: RealtimeChannel): boolean {
  return registry.get(crewId)?.channel === channel
}

// Non-owning lookup — used by the outbox retry path to broadcast a successfully
// (re)sent message without needing to be the channel's subscribe()-owning component.
export function peekCrewMessageChannel(crewId: string): RealtimeChannel | null {
  return registry.get(crewId)?.channel ?? null
}
