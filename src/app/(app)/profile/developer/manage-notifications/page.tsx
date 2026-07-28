import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/shared/supabase/server'
import { ManageNotifications } from '@/features/profile/screens/ManageNotifications'
import type { PushDiagnosticUser } from '@/features/profile/screens/ManageNotifications'

interface ProfileRow {
  id:         string
  username:   string
  avatar_url: string | null
}

interface SubscriptionRow {
  user_id:       string
  endpoint:      string
  created_at:    string
  last_seen_at:  string | null
  os_permission: string | null
  sw_state:      string | null
}

export default async function ManageNotificationsPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const service = createServiceClient()
  const { data: profile } = await service
    .from('profiles')
    .select('is_dev')
    .eq('id', session.user.id)
    .maybeSingle()

  if (!(profile as { is_dev?: boolean } | null)?.is_dev) redirect('/profile')

  // Deliberately not unstable_cache'd — this is a live diagnostic surface (see
  // CLAUDE.md's "never cache" list precedent for last-seen/session-shaped data),
  // and small/rare enough (dev-only, tens of rows) that a fresh fetch every load
  // is cheap and correctness matters more than latency here.
  const [{ data: profileRows }, { data: subRows }] = await Promise.all([
    service.from('profiles').select('id, username, avatar_url').order('username'),
    service.from('push_subscriptions').select('user_id, endpoint, created_at, last_seen_at, os_permission, sw_state'),
  ])

  const subsByUser = new Map<string, SubscriptionRow[]>()
  for (const row of (subRows ?? []) as SubscriptionRow[]) {
    const list = subsByUser.get(row.user_id) ?? []
    list.push(row)
    subsByUser.set(row.user_id, list)
  }

  const users: PushDiagnosticUser[] = ((profileRows ?? []) as ProfileRow[]).map((p) => {
    const subs = subsByUser.get(p.id) ?? []
    const lastSeenAt = subs.reduce<string | null>((max, s) => {
      if (!s.last_seen_at) return max
      return !max || s.last_seen_at > max ? s.last_seen_at : max
    }, null)
    // Fallback for the card's date slot when never confirmed alive (no heartbeat
    // has round-tripped yet) — earliest subscribe still beats showing no date at all.
    const subscribedSince = subs.reduce<string | null>((min, s) => {
      return !min || s.created_at < min ? s.created_at : min
    }, null)

    const permissions = subs.map((s) => s.os_permission).filter((v): v is string => !!v)
    const swStates    = subs.map((s) => s.sw_state).filter((v): v is string => !!v)

    return {
      id:                p.id,
      username:          p.username,
      avatarUrl:         p.avatar_url,
      subscribed:        subs.length > 0,
      subscriptionCount: subs.length,
      lastSeenAt,
      subscribedSince,
      hasApns:           subs.some((s) => s.endpoint.includes('web.push.apple.com')),
      hasFcm:            subs.some((s) => s.endpoint.includes('fcm.googleapis.com')),
      osGranted:         permissions.length === 0 ? 'unknown' : permissions.includes('granted') ? 'yes' : 'no',
      swActivated:       swStates.length    === 0 ? 'unknown' : swStates.includes('activated')  ? 'yes' : 'no',
    }
  })

  return <ManageNotifications initialUsers={users} />
}
