---
name: notification-engine
description: Reference for how push notifications are typed, gated by preference, delivered, and surfaced in settings UI in Nexus — the send-notification edge function, notification_preferences / crew_notification_preferences tables, NotifSheet toggle UI, and the trigger call sites that fire each notification type. Load when adding a new push notification type, wiring a new NotifSheet toggle, or debugging why a notification isn't arriving.
---

# Notification Engine

## Architecture overview

One edge function (`supabase/functions/send-notification/index.ts`) is the sole delivery point for every push notification in the app — nothing calls `webpush.sendNotification` anywhere else. Callers (other edge functions or server actions) `fetch()` it directly (never `supabase.functions.invoke()`, per the repo-wide rule in CLAUDE.md) with a `type`, a target (`user_id` or `user_ids[]`), and a `payload`. The function resolves subscriptions, applies preference gating, builds the notification body, and fires `web-push` calls in parallel.

Two independent preference layers, both optional per type:
- **Global** — `notification_preferences` (one row per user): `notif_messages`, `notif_mentions`.
- **Per-crew** — `crew_notification_preferences` (one row per user+crew, `UNIQUE(user_id, crew_id)`): same two columns, lets a user mute one chat without muting all of them.

A type with no meaningful "mute" concept (e.g. `friend_request`, `recruit_arrived`) maps to `null` in `PREF_COLUMN` and is **always delivered** — it skips both preference queries entirely.

## The 4 pieces every notification type touches

### 1. `send-notification/index.ts` — the type itself
```ts
type NotificationType = 'message_received' | 'mention_received' | 'friend_request' | 'recruit_arrived'

const PREF_COLUMN: Record<NotificationType, 'notif_messages' | 'notif_mentions' | null> = {
  message_received: 'notif_messages',
  mention_received:  'notif_mentions',
  friend_request:    null,
  recruit_arrived:   null,
}
```
If the new type is mutable by the user, it must reuse `notif_messages`/`notif_mentions` or add a new column (see "Adding a whole new preference column" below) — `PREF_COLUMN`'s value type only widens when a new column is actually added to both tables.

### 2. `buildPayload()` — the notification content
```ts
case 'your_new_type':
  return {
    title: `...`,
    body:  String(data.content_preview || '...'),
    icon:  '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data:  { url: `/wherever-tapping-should-land` },
  }
```
`data.url` is read by `public/sw-push.js`'s `notificationclick` handler to route the tap. Keep `icon`/`badge` as `/icons/icon-192.png` — iOS Web Push doesn't support `badge` in practice (`sw-push.js` already strips gracefully) but the field is harmless to include for other platforms.

### 3. The trigger call site — where you `fetch()` the function
```ts
fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ user_ids: [...], type: 'your_new_type', payload: { crew_id, crew_name, ... } }),
}).catch(() => {}) // fire-and-forget — never block the caller's main flow on push delivery
```
Every existing call site is **fire-and-forget** (`.catch(() => {})`, not awaited into the response). Notification delivery must never block or fail the primary action (message send, friend request, etc). See `supabase/functions/award-xp/index.ts:101-134` for the canonical multi-recipient example (splits mentioned vs. non-mentioned users into two parallel calls), or `src/app/(app)/friends/actions.ts` for a single-recipient server-action example.

Include `payload.crew_id` whenever the notification is crew-scoped — the edge function only applies the per-crew mute query `if (payload?.crew_id)`. Omitting it silently skips crew-level muting (global prefs still apply).

### 4. Settings UI — `NotifSheet` toggle row
`NotifPrefs` (`src/features/chat/components/sheets/NotifSheet.tsx`) is a plain object type, currently `{ messages: boolean; mentions: boolean }`. `NotifSheet` renders one `<NotifToggleRow>` per key, in a fixed order, separated by `border-t border-border`. To add a row for an *existing* preference column, add a key to `NotifPrefs` and a `<NotifToggleRow>` in `NotifSheet`'s JSX — the component is shared, so both consumers below pick it up automatically.

Two consumers each own their own local prefs state and DB read/write — `NotifSheet` itself has no Supabase calls:
- **Global**: `src/features/profile/screens/SettingsClient.tsx` — reads/writes `notification_preferences` via upsert on `onConflict: 'user_id'`.
- **Per-crew**: `src/features/chat/components/header/ChatHeader.tsx` — reads/writes `crew_notification_preferences` via upsert on `onConflict: 'user_id,crew_id'`.

Both follow the identical shape:
```ts
const [prefs, setPrefs] = useState<NotifPrefs>({ messages: true, mentions: true }) // default true

// load
.select('notif_messages, notif_mentions')
if (data) setPrefs({ messages: data.notif_messages, mentions: data.notif_mentions })

// toggle (optimistic)
const next = { ...prefs, [key]: !prefs[key] }
setPrefs(next)
await supabase.from('...').upsert({ user_id, /* crew_id, */ notif_messages: next.messages, notif_mentions: next.mentions, updated_at: new Date().toISOString() }, { onConflict: '...' })
```
When adding a new toggle, update **both** consumers' `select()`, load-mapping, and upsert body — they're two independent copies, not a shared hook. Default new booleans to `true` (opt-out model, matches existing columns) unless the feature is explicitly opt-in.

## Adding a whole new preference column (not just reusing messages/mentions)

1. Migration: `ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS notif_<name> boolean NOT NULL DEFAULT true;` and the same on `crew_notification_preferences` — see `supabase/migrations/20240103000025_add_notif_mentions.sql` as the template (adds to both tables in one file).
2. `src/types/notifications.ts` — add the field to `NotificationPreferences` and `CrewNotificationPreferences`.
3. `NotifPrefs` type + a new `<NotifToggleRow>` in `NotifSheet.tsx`.
4. Both consumers' `select()` / load / upsert (`SettingsClient.tsx`, `ChatHeader.tsx`).
5. `PREF_COLUMN`'s value union type in `send-notification/index.ts` gains the new column name.
6. The new `NotificationType` case in `buildPayload()`, mapped to the new column in `PREF_COLUMN`.

## Full checklist for a new NotificationType (reusing an existing pref column, or `null`/always-deliver)

1. Add the type to the `NotificationType` union in `send-notification/index.ts`.
2. Add it to `PREF_COLUMN` (`null` = always deliver, no mute possible).
3. Add a `case` to `buildPayload()` → `{ title, body, icon, badge, data: { url } }`.
4. Call `send-notification` (raw `fetch`, fire-and-forget) from the actual trigger point — a DB write, an edge function, or a server action.
5. Deploy: `supabase functions deploy send-notification --project-ref tlveyeisjbythssmocth` (no `--no-verify-jwt` needed here since it's a service-role-authenticated internal call in most flows, but check whether your trigger caller has a user JWT — `award-xp`/`friends/actions.ts` call it without one).
6. **`git push` does NOT deploy edge functions** — always run the `supabase functions deploy` command yourself after editing `send-notification/index.ts` or CLAUDE.md's `mention_received` example will drift from what's actually live.

## Key files
- `supabase/functions/send-notification/index.ts` — the only delivery point; `NotificationType`, `PREF_COLUMN`, `buildPayload()`, preference-gating + `web-push` fan-out + stale-subscription cleanup (410/404 → delete from `push_subscriptions`)
- `src/types/notifications.ts` — `PushSubscription`, `NotificationPreferences`, `CrewNotificationMute`, `CrewNotificationPreferences`
- `src/features/chat/components/sheets/NotifSheet.tsx` — `NotifPrefs` type, `NotifToggleRow`, `NotifSheet` (shared by both consumers)
- `src/features/profile/screens/SettingsClient.tsx` — global prefs consumer
- `src/features/chat/components/header/ChatHeader.tsx` — per-crew prefs consumer
- `supabase/functions/award-xp/index.ts:101-134` — canonical multi-recipient trigger example (`message_received` / `mention_received` split)
- `src/app/(app)/friends/actions.ts` — canonical single-recipient trigger example (`friend_request`)
- `src/app/(app)/onboarding/welcome/actions.ts` + `.../welcome/page.tsx` — `recruit_arrived` trigger (two call sites, both fire the same type)
- `public/sw-push.js` — service worker: displays the push (`showNotification`, minimal-options iOS fallback) and routes taps (`notificationclick` → `event.notification.data.url`)
- `src/app/api/test/push/route.ts` — debug endpoint (`GET` = diagnostics on current subscriptions + muted crews, `POST` = sends a real `message_received` test push to the calling user)
- `src/shared/components/pwa/PushDebugFAB.tsx` — dev-only floating action button UI for the above debug endpoint

## Gotchas
- **Fire-and-forget only.** Every trigger call site uses `.catch(() => {})` and does not `await` into the response path. A notification failure must never fail or delay the user-facing action it's attached to.
- **`payload.crew_id` is what turns on per-crew mute checking.** The edge function only queries `crew_notification_preferences` `if (payload?.crew_id)`. A crew-scoped type that forgets to pass `crew_id` will still honor global mute but silently ignore per-crew mute.
- **`prefCol !== null` gates both preference queries, not just one.** A `null`-mapped type (`friend_request`, `recruit_arrived`) skips the entire preference-fetch block and always resolves every target id — there is no way to opt out of these short of removing all push subscriptions.
- **iOS Web Push only supports a minimal `showNotification` option set.** `sw-push.js` already handles this (retries with `{ body }` only if the full options object is rejected) — don't add new required fields to the push payload that iOS doesn't document support for without adding the same fallback.
- **Stale subscription cleanup is automatic and global to the function** — any 410/404 from `web-push` during *any* notification type deletes that `push_subscriptions` row. You don't need (and shouldn't add) per-type cleanup logic.
- **`NotifPrefs` is duplicated state, not a shared hook.** `SettingsClient.tsx` (global) and `ChatHeader.tsx` (per-crew) each independently load/upsert — a new toggle key must be wired into both or one surface will silently keep defaulting.
- **`git push` never deploys edge functions.** Any change to `send-notification/index.ts` needs an explicit `supabase functions deploy send-notification --project-ref tlveyeisjbythssmocth` or it stays live with the old code — same class of bug as the `react-to-message` "undeployed function" incident documented in CLAUDE.md's Edge Functions section.
- **Legacy dead columns**: `notif_raids` and `notif_victory` existed in the original `notification_preferences`/`crew_notification_preferences` migration but were superseded by `notif_mentions` and are no longer read by `PREF_COLUMN` or any UI. If you see them referenced anywhere, it's stale — don't resurrect them for a new type; add a fresh `notif_<name>` column instead (see "Adding a whole new preference column").
