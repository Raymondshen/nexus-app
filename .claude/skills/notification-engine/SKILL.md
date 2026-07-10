---
name: notification-engine
description: Reference for how push notifications are typed, gated by preference, delivered, and surfaced in settings UI in Nexus — the send-notification edge function, notification_preferences / crew_notification_preferences tables, NotifSheet toggle UI, the trigger call sites for each notification type, the active-crew suppression mechanism, and subscription opt-in gotchas. Load when adding a new push notification type, wiring a new NotifSheet toggle, or debugging why a notification isn't arriving or is showing when it shouldn't.
---

# Notification Engine

## Default posture: extend, don't rebuild

`supabase/functions/send-notification/index.ts` is the **sole** delivery point for every push notification in the app — nothing calls `webpush.sendNotification` anywhere else. When asked to add push notification behavior, the default interpretation is: **add a new `NotificationType`** (a new case in `PREF_COLUMN` + `buildPayload()` + a trigger call site) — not a new edge function, not a direct `webpush.sendNotification()` call elsewhere, not a parallel notification system. Only deviate if the user explicitly asks for a different delivery mechanism entirely (email, SMS, a webhook) — push notifications specifically always go through this one function.

## Architecture overview

Callers (other edge functions or server actions) `fetch()` `send-notification` directly (never `supabase.functions.invoke()`, per the repo-wide rule in CLAUDE.md) with a `type`, a target (`user_id` or `user_ids[]`), and a `payload`. The function resolves subscriptions, applies preference gating, builds the notification body, and fires `web-push` calls in parallel.

Two independent preference layers, both optional per type:
- **Global** — `notification_preferences` (one row per user): `notif_messages`, `notif_mentions`, `notif_replies`.
- **Per-crew** — `crew_notification_preferences` (one row per user+crew, `UNIQUE(user_id, crew_id)`): same three columns, lets a user mute one chat without muting all of them.

A type with no meaningful "mute" concept (e.g. `friend_request`, `recruit_arrived`) maps to `null` in `PREF_COLUMN` and is **always delivered** — it skips both preference queries entirely.

**The global layer has no client write path anymore.** The Settings page's old global Notification row (which used to toggle `notification_preferences`) was removed when notification prefs moved to per-crew-only (`crew_notification_preferences`, via `SquadDetailsSheet`'s Bell icon → `NotifSheet`). `send-notification` still reads `notification_preferences` first and ANDs it with the per-crew row, so it's a permanent global kill-switch with no UI to re-enable it — any row a user set to `false` back when the toggle existed is now stuck off, and no one can newly mute all-crews notifications. If global mute needs to come back, it belongs in the Account section of `ManageUserProfile`, not as a new top-level Settings row.

## The 4 pieces every notification type touches

### 1. `send-notification/index.ts` — the type itself
```ts
type NotificationType = 'message_received' | 'mention_received' | 'reply_received' | 'friend_request' | 'recruit_arrived'

const PREF_COLUMN: Record<NotificationType, 'notif_messages' | 'notif_mentions' | 'notif_replies' | null> = {
  message_received: 'notif_messages',
  mention_received:  'notif_mentions',
  reply_received:    'notif_replies',
  friend_request:    null,
  recruit_arrived:   null,
}
```
If the new type is mutable by the user, it must reuse one of the three existing columns or add a new one (see "Adding a whole new preference column" below) — `PREF_COLUMN`'s value type only widens when a new column is actually added to both tables.

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
`data.url` is read by `public/sw-push.js`'s `notificationclick` handler to route the tap. Keep `icon`/`badge` as `/icons/icon-192.png` — iOS Web Push doesn't support `badge` in practice (`sw-push.js` already strips gracefully) but the field is harmless to include for other platforms. If the type is crew-scoped and should ever be eligible for active-crew suppression (see below), also put `crew_id` directly in `data` — `message_received`/`mention_received`/`reply_received` all do this so the service worker can match it against the client's currently-open crew.

### 3. The trigger call site — where you `fetch()` the function
```ts
fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ user_ids: [...], type: 'your_new_type', payload: { crew_id, crew_name, ... } }),
}).catch(() => {}) // fire-and-forget — never block the caller's main flow on push delivery
```
Every existing call site is **fire-and-forget** (`.catch(() => {})`, not awaited into the response). Notification delivery must never block or fail the primary action (message send, friend request, etc). `supabase/functions/award-xp/index.ts:101-134` is the canonical multi-recipient example: it computes a reply target, a mentioned set, and everyone else, and fires up to three separate calls — `reply_received` takes priority over `mention_received` for a recipient who is both replied-to and mentioned (one push, the more specific type), then `mention_received` for the rest of the mentioned set, then `message_received` for everyone left over. `src/app/(app)/friends/actions.ts` is the single-recipient server-action example (`friend_request`).

Include `payload.crew_id` whenever the notification is crew-scoped — the edge function only applies the per-crew mute query `if (payload?.crew_id)`. Omitting it silently skips crew-level muting (global prefs still apply).

### 4. Settings UI — `NotifSheet` toggle row
`NotifPrefs` (`src/features/chat/components/sheets/NotifSheet.tsx`) is `{ messages: boolean; mentions: boolean; replies: boolean }`. `NotifSheet` renders one `<NotifToggleRow>` per key, in a fixed order, separated by `border-t border-border`. To add a row for an *existing* preference column, add a key to `NotifPrefs` and a `<NotifToggleRow>` in `NotifSheet`'s JSX.

There is exactly **one** consumer today — `src/features/chat/components/header/ChatHeader.tsx`, which owns the per-crew prefs state and reads/writes `crew_notification_preferences` via upsert on `onConflict: 'user_id,crew_id'`:
```ts
const [prefs, setPrefs] = useState<NotifPrefs>({ messages: true, mentions: true, replies: true }) // default true

// load
.select('notif_messages, notif_mentions, notif_replies')
if (data) setPrefs({ messages: data.notif_messages, mentions: data.notif_mentions, replies: data.notif_replies })

// toggle (optimistic)
const next = { ...prefs, [key]: !prefs[key] }
setPrefs(next)
await supabase.from('crew_notification_preferences').upsert({ user_id, crew_id, notif_messages: next.messages, notif_mentions: next.mentions, notif_replies: next.replies, updated_at: new Date().toISOString() }, { onConflict: 'user_id,crew_id' })
```
There used to be a second, global consumer (a Settings page toggle writing `notification_preferences`) — it was removed (see "Architecture overview" above). **Don't reintroduce a second copy of this load/upsert logic for a global toggle without first checking whether product actually wants the global mute UI back** — right now `NotifSheet`/`NotifPrefs` only need to serve the one per-crew consumer. If a new toggle key is added, `ChatHeader.tsx` is the only place that needs wiring today, but the moment a global surface returns it becomes two independent copies again, not a shared hook — update both.

## Adding a whole new preference column (not just reusing messages/mentions/replies)

1. Migration: `ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS notif_<name> boolean NOT NULL DEFAULT true;` and the same on `crew_notification_preferences` — see `supabase/migrations/20260708020000_add_notif_replies.sql` as the most recent template (adds to both tables in one file).
2. `src/types/notifications.ts` — add the field to `NotificationPreferences` and `CrewNotificationPreferences`.
3. `NotifPrefs` type + a new `<NotifToggleRow>` in `NotifSheet.tsx`.
4. `ChatHeader.tsx`'s `select()` / load / upsert (today's only consumer — see above).
5. `PREF_COLUMN`'s value union type in `send-notification/index.ts` gains the new column name.
6. The new `NotificationType` case in `buildPayload()`, mapped to the new column in `PREF_COLUMN`.

## Full checklist for a new NotificationType (reusing an existing pref column, or `null`/always-deliver)

1. Add the type to the `NotificationType` union in `send-notification/index.ts`.
2. Add it to `PREF_COLUMN` (`null` = always deliver, no mute possible).
3. Add a `case` to `buildPayload()` → `{ title, body, icon, badge, data: { url[, crew_id] } }`.
4. Call `send-notification` (raw `fetch`, fire-and-forget) from the actual trigger point — a DB write, an edge function, or a server action.
5. Deploy: `supabase functions deploy send-notification --project-ref tlveyeisjbythssmocth` (no `--no-verify-jwt` needed here since it's a service-role-authenticated internal call in most flows, but check whether your trigger caller has a user JWT — `award-xp`/`friends/actions.ts` call it without one).
6. **`git push` does NOT deploy edge functions** — always run the `supabase functions deploy` command yourself after editing `send-notification/index.ts`, or the live function will drift from what's in the repo.

## Opt-in gotchas (found while debugging "push isn't working" for a real user)

- **A user must have a row in `push_subscriptions` before any of this matters.** Before assuming a bug in `send-notification`, `award-xp`'s trigger block, or `sw-push.js`, check `select count(*) from push_subscriptions where user_id = '<id>'`. Zero rows means the account never completed the browser-level subscribe — the delivery pipeline was never the problem.
- **`NotificationPrompt` (the one-time "Enable Notifications" banner) is gated on `localStorage.nexus_crew_created`.** That flag used to be set in exactly one place — `WelcomeDetector.tsx`, during the one-time onboarding welcome screen. A user who created their crew on a different device, or whose account predates a given device, would never see the prompt on that device and had no other way to trigger a subscribe. `HomeClient.tsx` now also sets this flag as soon as it loads and finds `initialCrews.length > 0`, so any device that can see a real crew unlocks prompt eligibility — don't reintroduce a path that makes onboarding the *only* place this flag gets set.
- **The dev "Notification Subscription" toggle in Developer Settings does not itself subscribe anything.** It only sets `nexus_push_diag` to reveal `PushDebugFAB` — the actual subscribe action is `PushDebugFAB`'s "SUBSCRIBE (VERBOSE)" / "FORCE RESUB" buttons. Don't assume toggling it on is sufficient to get a device receiving push; don't rename/repurpose it to mean "subscribe" without updating `PushDebugFAB` accordingly.
- **`subscribeToPush()`'s `getSubscription()` call retries up to 3 times (150ms apart) before falling through to a fresh `pushManager.subscribe()`.** This exists because a single failed/thrown `getSubscription()` on iOS used to be treated as "no subscription exists," minting a brand-new endpoint — and iOS gives every fresh `subscribe()` call its own unique endpoint even when a working one already existed. One account accumulated 337 rows in `push_subscriptions` this way. Don't remove the retry or treat a single `getSubscription()` failure as authoritative.
- **Do not mass-delete old `push_subscriptions` rows as a cleanup measure.** The table has no device identifier, so there's no safe way to tell "stale row from this same device" apart from "a different device's still-valid subscription" — bulk deletion risks breaking multi-device delivery for other users. The existing 410/404 cleanup in `send-notification` (delivery-confirmed stale) is the only safe automatic cleanup; anything broader needs a schema change (e.g. a device/session identifier) first.

## Active-crew suppression — no banner for a chat already open

A push for `message_received`/`mention_received`/`reply_received` is **not shown** as an OS notification if the recipient currently has that exact crew's chat screen open and foregrounded — they're already seeing the message live via Realtime, so a banner on top is redundant. `friend_request`/`recruit_arrived` are never suppressed this way (no crew concept). This is a client-visibility filter layered on top of the preference-mute filters above — both can independently cause a push to not show; they're separate mechanisms, don't conflate them when debugging "why didn't I get notified."

**How it works, end to end:**
1. `buildPayload()` puts `crew_id` directly in the push's `data` object for the three chat-message types (not just baked into `data.url`) — `/dm/[friendId]` routes never expose crew_id in their URL, so the service worker can't recover it by parsing `url` alone. If you add a new crew-scoped `NotificationType`, include `crew_id` in its `data` too if it should ever be eligible for this suppression; omit it (like `friend_request`/`recruit_arrived`) if it shouldn't.
2. `ChatInput.tsx` is the single owner of "is the user currently looking at this crew's chat" — it already runs a per-crew effect for the presence heartbeat (mount / `visibilitychange` / unmount), so `notifyActiveCrew(crewId)` (`shared/utils/notifications.ts`) is called at those same three points: on mount if the page starts visible, on each `visibilitychange` (`crewId` when visible, `null` when hidden), and `null` on unmount/crew-switch. This posts `{ type: 'nexus-active-crew', crewId }` to the active service worker.
3. `sw-push.js` keeps a module-scope `activeCrewId`, updated by a `message` listener for that event type. In the `push` handler, if the incoming `notifData.crew_id === activeCrewId`, it skips `showNotification` and the `navigator.setAppBadge()` call entirely — but still runs the push-log/diagnostics and client `postMessage` (so `PushDebugFAB` and any open tab still see the push arrived, just silently).

**Gotchas if you touch this:**
- `activeCrewId` is in-memory SW state — it does **not** survive the SW being evicted/restarted, and there's no persistence layer for it. This is an intentional fail-open tradeoff (worst case: a stale/lost value means the notification *shows* when it technically could've been suppressed — never the reverse, since the client re-announces on every `visibilitychange`). Don't "fix" this by adding IndexedDB/cache persistence unless a real bug shows the staleness window actually matters in practice.
- Only `ChatInput.tsx` calls `notifyActiveCrew`. If a future screen needs to represent "user is looking at crew X" without mounting `ChatInput` (e.g. a preview/quick-glance surface), it must call `notifyActiveCrew` itself at mount/visibility/unmount — this is not automatically derived from routing or any global store.
- This only suppresses the **OS banner**. It never affects whether `send-notification` fires, whether `push_subscriptions` cleanup runs, or whether the message itself is delivered/stored — those are unrelated to this mechanism.

## Push delivery mechanics (VAPID, subscriptions, iOS)
- **VAPID**: `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` are Supabase Edge Function secrets, read at the top of `send-notification/index.ts`. `VAPID_SUBJECT` must be a `mailto:` URI — `web-push` rejects other schemes.
- **Subscribing** is INSERT-only, no delete-first — `push_subscriptions.endpoint` is `UNIQUE`, so a `23505` conflict on re-subscribe is the *success* path, not an error to surface.
- **Notification `tag` must be unique per push** (`sw-push.js` appends `-{timestamp}`) — without it, iOS coalesces/suppresses rapid repeat pushes into a single alert instead of showing each one.
- **iOS Web Push only supports a minimal `showNotification` option set** — `badge` is stripped, and `sw-push.js` retries with just `{ body }` if the full options object is rejected. Don't add new required fields to the push payload that iOS doesn't document support for without adding the same fallback.
- **Debugging**: HTTP 401 from `send-notification` means it was deployed without `--no-verify-jwt`; a result status of `expired_deleted` means APNs returned 410 for that subscription (already deleted from `push_subscriptions` by the cleanup step) — the client should force a re-subscribe.

## Gotchas
- **Fire-and-forget only.** Every trigger call site uses `.catch(() => {})` and does not `await` into the response path. A notification failure must never fail or delay the user-facing action it's attached to.
- **`payload.crew_id` is what turns on per-crew mute checking.** The edge function only queries `crew_notification_preferences` `if (payload?.crew_id)`. A crew-scoped type that forgets to pass `crew_id` will still honor global mute but silently ignore per-crew mute.
- **`prefCol !== null` gates both preference queries, not just one.** A `null`-mapped type (`friend_request`, `recruit_arrived`) skips the entire preference-fetch block and always resolves every target id — there is no way to opt out of these short of removing all push subscriptions.
- **Stale subscription cleanup is automatic and global to the function** — any 410/404 from `web-push` during *any* notification type deletes that `push_subscriptions` row. You don't need (and shouldn't add) per-type cleanup logic.
- **The global `notification_preferences` table has no client write path anymore** and is stuck as a permanent kill-switch for whoever last set a column `false` before the Settings toggle was removed — see "Architecture overview." Don't build a new UI for it without confirming that's actually wanted; don't assume a user complaining "I never get notified in any crew" has a bug in the per-crew path when the real cause may be a stale global-mute row with no way for them to self-serve a fix.
- **`git push` never deploys edge functions.** Any change to `send-notification/index.ts` needs an explicit `supabase functions deploy send-notification --project-ref tlveyeisjbythssmocth` or it stays live with the old code — same class of bug as the `react-to-message` "undeployed function" incident documented in CLAUDE.md's Edge Functions section.
- **Legacy dead columns**: `notif_raids` and `notif_victory` existed in the original `notification_preferences`/`crew_notification_preferences` migration but were superseded by `notif_mentions`/`notif_replies` and are no longer read by `PREF_COLUMN` or any UI. If you see them referenced anywhere, it's stale — don't resurrect them for a new type; add a fresh `notif_<name>` column instead (see "Adding a whole new preference column").
- **`award-xp` fires notifications before it writes XP, with no early return before that block.** The notification `fetch()` calls happen immediately after resolving crew/member data, ahead of the anti-spam soft-block and XP/coin writes (`supabase/functions/award-xp/index.ts:101-134`). If you add a new early-return path to `award-xp` for some other reason, make sure it doesn't land above the notification block — that would silently kill `message_received`/`mention_received`/`reply_received` delivery for whatever case triggers the early return.

## Key files
- `supabase/functions/send-notification/index.ts` — the only delivery point; `NotificationType`, `PREF_COLUMN`, `buildPayload()`, preference-gating + `web-push` fan-out + stale-subscription cleanup (410/404 → delete from `push_subscriptions`)
- `src/types/notifications.ts` — `PushSubscription`, `NotificationPreferences`, `CrewNotificationMute`, `CrewNotificationPreferences`
- `src/features/chat/components/sheets/NotifSheet.tsx` — `NotifPrefs` type, `NotifToggleRow`, `NotifSheet`
- `src/features/chat/components/header/ChatHeader.tsx` — the sole per-crew prefs consumer (loads/upserts `crew_notification_preferences`, opens `NotifSheet`)
- `supabase/functions/award-xp/index.ts:101-134` — canonical multi-recipient trigger example (`reply_received` / `mention_received` / `message_received` three-way split)
- `src/app/(app)/friends/actions.ts` — canonical single-recipient trigger example (`friend_request`)
- `src/app/(app)/onboarding/welcome/actions.ts` + `.../welcome/page.tsx` — `recruit_arrived` trigger (two call sites, both fire the same type)
- `public/sw-push.js` — service worker: displays the push (`showNotification`, minimal-options iOS fallback), routes taps (`notificationclick` → `event.notification.data.url`), and holds the `activeCrewId` state + suppression check for active-crew filtering
- `src/shared/utils/notifications.ts` — `notifyActiveCrew()`
- `src/features/chat/components/input/ChatInput.tsx` — the only call site of `notifyActiveCrew`, piggybacked on the existing per-crew presence effect
- `src/app/api/test/push/route.ts` — debug endpoint (`GET` = diagnostics on current subscriptions + muted crews, `POST` = sends a real `message_received` test push to the calling user)
- `src/shared/components/pwa/PushDebugFAB.tsx` — dev-only floating action button UI for the above debug endpoint
