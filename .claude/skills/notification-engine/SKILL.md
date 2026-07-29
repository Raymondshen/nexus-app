---
name: notification-engine
description: Reference for how push notifications are typed, gated by preference, delivered, and surfaced in settings UI in Nexus — the send-notification edge function, notification_preferences / crew_notification_preferences tables, NotifSheet toggle UI, and the trigger call sites that fire each notification type. Also covers scoping guardrails (extend the existing pipeline, don't build a parallel one), subscription opt-in gotchas, and active-crew suppression of the OS banner. Load when adding a new push notification type, wiring a new NotifSheet toggle, or debugging why a notification isn't arriving.
---

# Notification Engine

## Default posture: extend, don't rebuild

`supabase/functions/send-notification/index.ts` is the **sole** delivery point for every push notification in the app. When asked to add push notification behavior, the default interpretation is: **add a new `NotificationType`** (a new case in `PREF_COLUMN` + `buildPayload()` + a trigger call site) — not a new edge function, not a direct `webpush.sendNotification()` call elsewhere, not a parallel notification system. See "Full checklist for a new NotificationType" below for the step-by-step.

Only deviate from "new NotificationType in the existing function" if the user explicitly asks for a different delivery mechanism (email, SMS, a webhook, etc.) — push notifications specifically always go through this one function.

## Architecture overview

One edge function (`supabase/functions/send-notification/index.ts`) is the sole delivery point for every push notification in the app — nothing calls `webpush.sendNotification` anywhere else. Callers (other edge functions or server actions) `fetch()` it directly (never `supabase.functions.invoke()`, per the repo-wide rule in CLAUDE.md) with a single **batched** request body: `{ notifications: [{ type, user_id | user_ids, payload }, ...] }`. A request can carry more than one group — e.g. a single chat message fans out to a reply target + mentioned users + everyone else, each needing its own `type`/title — so every trigger point sends exactly one request per event, never one request per group (see `award-xp/index.ts` for the reference example). The function resolves the union of every group's target ids into one subscriptions query and one crew-prefs query (2026-07-29 refactor — previously each group needed its own pair of queries), applies preference gating per group, builds each group's notification body, and fires all `web-push` calls across all groups in parallel.

Every Next.js-side caller (server actions, route handlers) goes through the shared `sendPushNotification()` helper (`src/shared/utils/sendPushNotification.ts`) rather than hand-building the fetch — it owns the URL, the service-role Bearer header, and the `{ notifications: [...] }` envelope in one place. The Deno edge runtime (`award-xp/index.ts`) can't import that module, so it builds its own single batched request the same shape.

One preference layer, optional per type:
- **Per-crew** — `crew_notification_preferences` (one row per user+crew, `UNIQUE(user_id, crew_id)`): `notif_messages`, `notif_mentions`, `notif_replies`. This is the sole mute mechanism — a user has no row until they explicitly mute via `NotifSheet`, so every recipient is subscribed by default.

A type with no meaningful "mute" concept (e.g. `friend_request`, `health_check`) maps to `null` in `PREF_COLUMN` and is **always delivered** — it skips the preference query entirely.

`notification_preferences` (the *global* table) used to be a second layer ANDed on top of this one, but it has no client write path — the Settings-page toggle that wrote it was removed once muting became per-crew-only — and `send-notification` stopped reading it 2026-07-29 (see CLAUDE.md's Gotchas entry on this table). The table and its columns still exist, kept in case a global mute UI is reintroduced someday, but nothing reads or writes them today. Don't add a new read of that table without also giving it a write path — a read with no write is exactly what stranded users muted before the fix.

## The 4 pieces every notification type touches

### 1. `send-notification/index.ts` — the type itself
```ts
type NotificationType = 'message_received' | 'mention_received' | 'reply_received' | 'friend_request' | 'health_check'

const PREF_COLUMN: Record<NotificationType, 'notif_messages' | 'notif_mentions' | 'notif_replies' | null> = {
  message_received: 'notif_messages',
  mention_received:  'notif_mentions',
  reply_received:    'notif_replies',
  friend_request:    null,
  health_check:      null, // ops canary only, see /api/cron/push-health — never user-facing
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

### 3. The trigger call site — where you build the request

From Next.js server code, use the shared helper:
```ts
import { sendPushNotification } from '@/shared/utils/sendPushNotification'

await sendPushNotification([
  { user_ids: [...], type: 'your_new_type', payload: { crew_id, crew_name, ... } },
]).catch(() => {}) // fire-and-forget — never block the caller's main flow on push delivery
```
See `src/app/(app)/friends/actions.ts` for a single-group server-action example, or `src/app/api/cron/push-health/route.ts` for a canary/ops-only example (`health_check` type, not user-facing) that also inspects the response.

From a Deno edge function (can't import the Next.js helper), build the request directly — always send the Bearer header, even though send-notification is meant to be deployed with `--no-verify-jwt` (only ever called server-side): that flag is deploy-time gateway config, not something the call site controls, and a future redeploy that forgets it would otherwise silently 401 every call before send-notification's own code runs. The service-role key is a valid signed JWT, so it passes the gateway check regardless of the flag's state.
```ts
fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
  method:  'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
  body: JSON.stringify({ notifications: [{ user_ids: [...], type: 'your_new_type', payload: { crew_id, crew_name, ... } }] }),
}).catch(() => {})
```
See `supabase/functions/award-xp/index.ts`'s "FIRE NOTIFICATION IMMEDIATELY" block for the canonical multi-group example — it builds up to 3 groups (reply target / mentioned / everyone else) from one message event and sends them all in a single request, not one request per group. Every call site is **fire-and-forget** (`.catch(() => {})`, not awaited into the response) — notification delivery must never block or fail the primary action (message send, friend request, etc).

Include `payload.crew_id` whenever the notification is crew-scoped — the edge function only applies the per-crew mute query `if (payload?.crew_id)`. Omitting it silently skips crew-level muting entirely for that call (there is no global fallback to catch it anymore).

### 4. Settings UI — `NotifSheet` toggle row
`NotifPrefs` (`src/features/chat/components/sheets/NotifSheet.tsx`) is `{ messages: boolean; mentions: boolean; replies: boolean }`. `NotifSheet` renders one `<NotifToggleRow>` per key, in a fixed order, separated by `border-t border-border`. To add a row for an *existing* preference column, add a key to `NotifPrefs` and a `<NotifToggleRow>` in `NotifSheet`'s JSX.

There is exactly **one** consumer now — `src/features/chat/components/input/ChatInput.tsx` (opened via `ChatRoomBrowseSheet`'s Bell icon). It owns the local `notifPrefs` state and both the load and the upsert, reading/writing `crew_notification_preferences` keyed on `(user_id, crew_id)`:
```ts
// load (skipped for DMs)
.from('crew_notification_preferences')
.select('notif_messages, notif_mentions, notif_replies')
.eq('user_id', userId).eq('crew_id', crewId).maybeSingle()

// toggle (optimistic, rolled back on error)
await supabase.from('crew_notification_preferences').upsert(
  { user_id, crew_id, notif_messages, notif_mentions, notif_replies, updated_at: new Date().toISOString() },
  { onConflict: 'user_id,crew_id' },
)
```
There used to be a second consumer writing a *global* `notification_preferences` table (a Settings-page toggle) — it was removed when muting became per-crew-only, and `send-notification` stopped reading that table 2026-07-29 (see the preference-layers section above and CLAUDE.md's Gotchas entry). Don't resurrect a "global" consumer without also updating `send-notification` to read it again — a write path with no corresponding read (or vice versa) is exactly the bug that got fixed.

## Adding a whole new preference column

1. Migration: `ALTER TABLE crew_notification_preferences ADD COLUMN IF NOT EXISTS notif_<name> boolean NOT NULL DEFAULT true;` — see `supabase/migrations/20260708020000_add_notif_replies.sql` as the template. (Older migrations, e.g. `20240103000025_add_notif_mentions.sql`, also added the matching column to `notification_preferences` — don't bother; that table is no longer read, see above.)
2. `src/types/notifications.ts` — add the field to `CrewNotificationPreferences`.
3. `NotifPrefs` type + a new `<NotifToggleRow>` in `NotifSheet.tsx`.
4. `ChatInput.tsx`'s `select()` / load-mapping / upsert body (the sole consumer).
5. `PREF_COLUMN`'s value union type in `send-notification/index.ts` gains the new column name.
6. The new `NotificationType` case in `buildPayload()`, mapped to the new column in `PREF_COLUMN`.

## Full checklist for a new NotificationType (reusing an existing pref column, or `null`/always-deliver)

1. Add the type to the `NotificationType` union in `send-notification/index.ts` **and** the `PushNotificationType` union in `src/shared/utils/sendPushNotification.ts` — two independent unions in two different runtimes (Deno vs. Node), not a shared import. Forgetting the second one doesn't break anything at the JS level (both are just string literals at runtime), but it silently loses the TypeScript check that would've caught a typo'd `type` value at a Next.js call site.
2. Add it to `PREF_COLUMN` (`null` = always deliver, no mute possible).
3. Add a `case` to `buildPayload()` → `{ title, body, icon, badge, data: { url } }`.
4. Call it from the actual trigger point (a DB write, an edge function, or a server action) — `sendPushNotification([{ type, user_id|user_ids, payload }])` from Next.js code, or a direct batched `fetch()` from a Deno edge function. Fire-and-forget either way; if the trigger point already sends other groups in the same event (e.g. award-xp's reply/mention/message split), add this as one more entry in that same array rather than a second call.
5. Deploy: `supabase functions deploy send-notification --project-ref tlveyeisjbythssmocth`. The function is meant to run with `--no-verify-jwt` (only ever called server-side), but every caller also sends `Authorization: Bearer <service-role-key>` regardless — see step 3's example — so a redeploy that forgets the flag doesn't silently 401 every call.
6. **`git push` does NOT deploy edge functions** — always run the `supabase functions deploy` command yourself after editing `send-notification/index.ts` or CLAUDE.md's `mention_received` example will drift from what's actually live. `award-xp/index.ts` needs the same treatment if you touch its notification-building block — `supabase functions deploy award-xp --project-ref tlveyeisjbythssmocth`.

## Key files
- `supabase/functions/send-notification/index.ts` — the only delivery point; accepts a batched `{ notifications: [...] }` request, `NotificationType`, `PREF_COLUMN`, `buildPayload()`, preference-gating + `web-push` fan-out + stale-subscription cleanup (410/404 → delete from `push_subscriptions`)
- `src/shared/utils/sendPushNotification.ts` — the shared helper every Next.js server action/route handler uses to call send-notification (URL + Bearer header + envelope in one place); `PushNotificationType` (kept in sync with `NotificationType` by hand, see the checklist above)
- `src/types/notifications.ts` — `PushSubscription`, `NotificationPreferences`, `CrewNotificationMute`, `CrewNotificationPreferences`
- `src/features/chat/components/sheets/NotifSheet.tsx` — `NotifPrefs` type, `NotifToggleRow`, `NotifSheet` (presentational; `ChatInput.tsx` owns the state and Supabase calls)
- `supabase/functions/award-xp/index.ts` — canonical multi-group trigger example ("FIRE NOTIFICATION IMMEDIATELY" block splits reply/mention/message into one batched call)
- `src/app/(app)/friends/actions.ts` — canonical single-group trigger example (`friend_request`), via `sendPushNotification()`
- `public/sw-push.js` — service worker: displays the push (`showNotification`, minimal-options iOS fallback) and routes taps (`notificationclick` → `event.notification.data.url`)
- `src/app/api/test/push/route.ts` — debug endpoint (`GET` = diagnostics on current subscriptions + muted crews, `POST` = sends a real `message_received` test push to the calling user)
- `src/shared/components/pwa/PushDebugFAB.tsx` — dev-only floating action button UI for the above debug endpoint
- `src/app/api/cron/push-health/route.ts` — daily Vercel cron canary (see CLAUDE.md's Edge Functions section for schedule). Fires a `health_check` push (ops-only `NotificationType`, `PREF_COLUMN`-mapped to `null`, never surfaced in `NotifSheet`) at every `is_dev` account's own subscriptions and fails the cron run (non-200) if the HTTP call errors, 401s, or nothing actually sends — the automated version of "did a redeploy silently break delivery," so it doesn't take a user reporting a missed notification to find out
- `public/sw-push.js` — also owns `activeCrewId` state, the `message` listener, and the suppression check in the `push` handler (active-crew suppression)
- `src/shared/utils/notifications.ts` — `notifyActiveCrew()`
- `src/features/chat/components/input/ChatInput.tsx` — the only call site for `notifyActiveCrew`, piggybacked on the existing per-crew presence effect

## Push delivery mechanics (VAPID, subscriptions, iOS)
- **VAPID**: `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` are Supabase Edge Function secrets, read at the top of `send-notification/index.ts`. `VAPID_SUBJECT` must be a `mailto:` URI — `web-push` rejects other schemes.
- **Subscribing** is INSERT-only, no delete-first — `push_subscriptions.endpoint` is `UNIQUE`, so a `23505` conflict on re-subscribe is the *success* path, not an error to surface.
- **Notification `tag` must be unique per push** (`sw-push.js` appends `-{timestamp}`) — without it, iOS coalesces/suppresses rapid repeat pushes into a single alert instead of showing each one.
- **iOS Web Push only supports a minimal `showNotification` option set** — `badge` is stripped, and `sw-push.js` retries with just `{ body }` if the full options object is rejected.
- **Debugging**: HTTP 401 from `send-notification` means it was deployed without `--no-verify-jwt` AND the caller didn't send the `Authorization: Bearer <service-role-key>` header (see step 3 above) — check both, since every real caller now sends that header specifically so this class of redeploy mistake degrades gracefully instead of silently killing delivery; `/api/cron/push-health`'s daily canary also surfaces this automatically. A result status of `expired_deleted` means APNs returned 410 for that subscription (already deleted from `push_subscriptions` by the cleanup step) — the client should force a re-subscribe.

## Opt-in gotchas (found while debugging "push isn't working" for a real user)

- **A user must have a row in `push_subscriptions` before any of this matters.** Before assuming a bug in `send-notification`, `award-xp`'s trigger block, or `sw-push.js`, check `select count(*) from push_subscriptions where user_id = '<id>'`. Zero rows means the account never completed the browser-level subscribe — the delivery pipeline was never the problem.
- **`NotificationPrompt` (the "Enable Notifications" banner) is gated purely on the live `Notification.permission === 'default'` check, once per hard app load.** It no longer depends on `localStorage.nexus_crew_created` or a 24h re-prompt throttle — those were removed so a device that's never been asked for permission gets prompted again on every fresh launch/hard-refresh (not just once, right after onboarding), while a device that already denied or granted is left alone (denied doesn't get re-nagged since the browser won't re-show its own native prompt anyway; granted is treated as "subscribed" even in the rare case the underlying `push_subscriptions` write itself failed — see `sub_failed`, which only guards the current session, not future relaunches). `nexus_crew_created` itself still exists and is still set by `WelcomeDetector.tsx`/`HomeClient.tsx` — it just isn't a gate for this prompt anymore.
- **`nexus_push_diag` (devtools-only, no in-app toggle as of the Figma 708:18773 Developer Settings redesign) does not itself subscribe anything** — it only reveals the `PushDebugFAB` status pill. The actual subscribe/diagnose/force-resub/remove-user actions live on `/profile/developer/manage-notifications` (tap the pill, or Developer Settings → "Manage Notifications") — don't assume flipping the flag on is sufficient to get a device receiving push, and don't rename/repurpose it to mean "subscribe."
- **`subscribeToPush()`'s `getSubscription()` call retries up to 3 times (150ms apart) before falling through to a fresh `pushManager.subscribe()`.** This exists because a single failed/thrown `getSubscription()` on iOS used to be treated as "no subscription exists," minting a brand-new endpoint — and iOS gives every fresh `subscribe()` call its own unique endpoint even when a working one already existed. One account accumulated 337 rows this way before the fix below; don't remove the retry or treat a single `getSubscription()` failure as authoritative — it reduces how often this fires, but doesn't eliminate it (a Safari-side quirk, not something client code fully controls).
- **`push_subscriptions.device_id`** (migration `20260727130000_push_subscriptions_device_id`) is the schema change the mass-deletion gotcha below used to say was missing — a stable id generated once via `crypto.randomUUID()` and persisted in `localStorage.nexus_push_device_id` (`getOrCreateDeviceId()` in `notifications.ts`), stamped on every row `subscribeToPush()` writes. This is what makes the self-healing prune in the next bullet safe: it scopes "this device's own stale row" to an actual identifier instead of guessing from `user_id` alone. Nullable — rows written before this migration, or via a path with no `window`/`localStorage` access (`/api/push/resubscribe`, hit from inside the SW on APNs token rotation), stay `NULL` and are simply never matched by the prune query; they only get backfilled once that same device's `subscribeToPush()` runs again (its `trySave()` is now an `upsert` on `endpoint`, not a plain insert, specifically so an existing row picks up a `device_id` — and refreshed `os_permission`/`sw_state` — on its next successful save instead of only ever getting one at creation).
- **`subscribeToPush()` prunes its own device's duplicate rows on every successful save** (`pruneOtherRowsForThisDevice()`) — `delete from push_subscriptions where user_id = ? and device_id = ? and endpoint != ?`. This is what actually stops the `getSubscription()` false-negative bug above from being permanent: every duplicate a false negative mints gets cleaned up the next time that same device successfully subscribes, rather than accumulating forever. It does **not** retroactively clean up pre-`device_id` duplicates (those are `NULL` and unmatched) — for an account already sitting on a pile of old duplicates, the fix is the diagnostics page's per-row refresh button (deletes all of that user's rows outright; their device gets one clean row back on next open), not a bulk query.
- **Do not mass-delete old `push_subscriptions` rows directly (e.g. via `execute_sql`) as a cleanup measure.** Even with `device_id` now available, a row with `device_id = NULL` still can't be safely attributed to any specific device — leave those to age out via the 410/404 cleanup in `send-notification` (delivery-confirmed stale) or a per-user refresh via the diagnostics page, never a blanket query against rows you haven't confirmed are dead.

## Active-crew suppression — no banner for a chat already open

A push for `message_received`/`mention_received`/`reply_received` is **not shown** as an OS notification if the recipient currently has that exact crew's chat screen open and foregrounded — they're already seeing the message live via Realtime, so a banner on top is redundant. `friend_request`/`health_check` are never suppressed this way (no crew concept). This is a client-visibility filter layered on top of the existing preference-mute filters (global/per-crew `notif_messages` etc.) — both can independently cause a push to not show; they're separate mechanisms, don't conflate them when debugging "why didn't I get notified."

**How it works, end to end:**
1. `buildPayload()` in `send-notification/index.ts` puts `crew_id` directly in the push's `data` object for the three chat-message types (not just baked into `data.url`) — `/dm/[friendId]` routes never expose crew_id in their URL, so the service worker can't recover it by parsing `url` alone. If you add a new crew-scoped `NotificationType`, include `crew_id` in its `data` too if it should ever be eligible for this suppression; omit it (like `friend_request`/`health_check`) if it shouldn't.
2. `ChatInput.tsx` is the single owner of "is the user currently looking at this crew's chat" — it already runs a per-crew effect for the presence heartbeat (mount / `visibilitychange` / unmount), so `notifyActiveCrew(crewId)` (`shared/utils/notifications.ts`) is called at those same three points: on mount if the page starts visible, on each `visibilitychange` (`crewId` when visible, `null` when hidden), and `null` on unmount/crew-switch. This posts `{ type: 'nexus-active-crew', crewId }` to the active service worker.
3. `sw-push.js` keeps a module-scope `activeCrewId`, updated by a `message` listener for that event type. In the `push` handler, if the incoming `notifData.crew_id === activeCrewId`, it skips `showNotification` and the `navigator.setAppBadge()` call entirely — but still runs the push-log/diagnostics and client `postMessage` (so `PushDebugFAB` and any open tab still see the push arrived, just silently).

**Gotchas if you touch this:**
- `activeCrewId` is in-memory SW state — it does **not** survive the SW being evicted/restarted, and there's no persistence layer for it. This is an intentional fail-open tradeoff (worst case: a stale/lost value means the notification *shows* when it technically could've been suppressed — never the reverse, since the client re-announces on every `visibilitychange`). Don't "fix" this by adding IndexedDB/cache persistence unless a real bug shows the staleness window actually matters in practice.
- Only `ChatInput.tsx` calls `notifyActiveCrew`. If a future screen needs to represent "user is looking at crew X" without mounting `ChatInput` (e.g. a preview/quick-glance surface), it must call `notifyActiveCrew` itself at mount/visibility/unmount — this is not automatically derived from routing or any global store.
- This only suppresses the **OS banner**. It never affects whether `send-notification` fires, whether `push_subscriptions` cleanup runs, or whether the message itself is delivered/stored — those are unrelated to this mechanism.
- `send-notification/index.ts` changes require a manual `supabase functions deploy send-notification --project-ref tlveyeisjbythssmocth` — `sw-push.js`/`ChatInput.tsx`/`notifications.ts` changes ship on the normal `git push` → Vercel deploy.

## Gotchas
- **Fire-and-forget only.** Every trigger call site uses `.catch(() => {})` and does not `await` into the response path. A notification failure must never fail or delay the user-facing action it's attached to.
- **`payload.crew_id` is what turns on per-crew mute checking.** The edge function only queries `crew_notification_preferences` `if (payload?.crew_id)`. A crew-scoped type that forgets to pass `crew_id` skips muting entirely for that call — there's no global fallback to catch it since 2026-07-29 (see above).
- **`prefCol !== null` gates the preference query.** A `null`-mapped type (`friend_request`, `health_check`) skips the fetch block and always resolves every target id — there is no way to opt out of these short of removing all push subscriptions.
- **iOS Web Push only supports a minimal `showNotification` option set.** `sw-push.js` already handles this (retries with `{ body }` only if the full options object is rejected) — don't add new required fields to the push payload that iOS doesn't document support for without adding the same fallback.
- **Stale subscription cleanup is automatic and global to the function** — any 410/404 from `web-push` during *any* notification type deletes that `push_subscriptions` row. You don't need (and shouldn't add) per-type cleanup logic.
- **`NotifPrefs` is owned by a single consumer now** (`ChatInput.tsx`) — a new toggle key only needs wiring in one place, not two. (Before 2026-07-29 there was a second, global consumer; if you find code or docs elsewhere still describing two, they're stale.)
- **`git push` never deploys edge functions.** Any change to `send-notification/index.ts` needs an explicit `supabase functions deploy send-notification --project-ref tlveyeisjbythssmocth` or it stays live with the old code — same class of bug as the `react-to-message` "undeployed function" incident documented in CLAUDE.md's Edge Functions section.
- **Legacy dead columns**: `notif_raids` and `notif_victory` existed in the original `notification_preferences`/`crew_notification_preferences` migration but were superseded by `notif_mentions` and are no longer read by `PREF_COLUMN` or any UI. If you see them referenced anywhere, it's stale — don't resurrect them for a new type; add a fresh `notif_<name>` column instead (see "Adding a whole new preference column").
- **`award-xp` fires notifications before it writes XP, with no early return before that block.** The notification `fetch()` call (now one batched call, not up to 3) happens immediately after resolving crew/member data, ahead of the anti-spam soft-block and XP/coin writes — see the "FIRE NOTIFICATION IMMEDIATELY" comment in `supabase/functions/award-xp/index.ts`. If you add a new early-return path to `award-xp` for some other reason, make sure it doesn't land above the notification block — that would silently kill `message_received`/`mention_received`/`reply_received` delivery for whatever case triggers the early return.
