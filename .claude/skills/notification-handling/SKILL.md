---
name: notification-handling
description: Scoping guardrail for push-notification work in Nexus — default to adding a new NotificationType (a new push notification function/case) through the existing send-notification pipeline rather than building a parallel delivery path. Also documents the subscription-opt-in gotchas found while debugging why push wasn't reaching real users, and the active-crew suppression mechanism that skips the OS banner for a chat the recipient already has open. Load before touching anything push-notification related, alongside the notification-engine skill.
---

# Notification Handling

## Default posture: extend, don't rebuild

`supabase/functions/send-notification/index.ts` is the **sole** delivery point for every push notification in the app. When asked to add push notification behavior, the default interpretation is: **add a new `NotificationType`** (a new case in `PREF_COLUMN` + `buildPayload()` + a trigger call site) — not a new edge function, not a direct `webpush.sendNotification()` call elsewhere, not a parallel notification system. See the `notification-engine` skill for the full step-by-step checklist (adding a type, reusing vs. adding a preference column, deploy command). Load both skills together — this one sets the default scope, `notification-engine` has the mechanics.

Only deviate from "new NotificationType in the existing function" if the user explicitly asks for a different delivery mechanism (email, SMS, a webhook, etc.) — push notifications specifically always go through this one function.

## Opt-in gotchas (found while debugging "push isn't working" for a real user)

- **A user must have a row in `push_subscriptions` before any of this matters.** Before assuming a bug in `send-notification`, `award-xp`'s trigger block, or `sw-push.js`, check `select count(*) from push_subscriptions where user_id = '<id>'`. Zero rows means the account never completed the browser-level subscribe — the delivery pipeline was never the problem.
- **`NotificationPrompt` (the one-time "Enable Notifications" banner) is gated on `localStorage.nexus_crew_created`.** That flag used to be set in exactly one place — `WelcomeDetector.tsx`, during the one-time onboarding welcome screen. A user who created their crew on a different device, or whose account predates a given device, would never see the prompt on that device and had no other way to trigger a subscribe. `HomeClient.tsx` now also sets this flag as soon as it loads and finds `initialCrews.length > 0`, so any device that can see a real crew unlocks prompt eligibility — don't reintroduce a path that makes onboarding the *only* place this flag gets set.
- **The dev "Notification Subscription" toggle in Developer Settings does not itself subscribe anything.** It only sets `nexus_push_diag` to reveal `PushDebugFAB` — the actual subscribe action is `PushDebugFAB`'s "SUBSCRIBE (VERBOSE)" / "FORCE RESUB" buttons. Don't assume toggling it on is sufficient to get a device receiving push; don't rename/repurpose it to mean "subscribe" without updating `PushDebugFAB` accordingly.
- **`subscribeToPush()`'s `getSubscription()` call retries up to 3 times (150ms apart) before falling through to a fresh `pushManager.subscribe()`.** This exists because a single failed/thrown `getSubscription()` on iOS used to be treated as "no subscription exists," minting a brand-new endpoint — and iOS gives every fresh `subscribe()` call its own unique endpoint even when a working one already existed. One account accumulated 337 rows in `push_subscriptions` this way. Don't remove the retry or treat a single `getSubscription()` failure as authoritative.
- **Do not mass-delete old `push_subscriptions` rows as a cleanup measure.** The table has no device identifier, so there's no safe way to tell "stale row from this same device" apart from "a different device's still-valid subscription" — bulk deletion risks breaking multi-device delivery for other users. The existing 410/404 cleanup in `send-notification` (delivery-confirmed stale) is the only safe automatic cleanup; anything broader needs a schema change (e.g. a device/session identifier) first.

## Active-crew suppression — no banner for a chat already open

A push for `message_received`/`mention_received`/`reply_received` is **not shown** as an OS notification if the recipient currently has that exact crew's chat screen open and foregrounded — they're already seeing the message live via Realtime, so a banner on top is redundant. `friend_request`/`recruit_arrived` are never suppressed this way (no crew concept). This is a client-visibility filter layered on top of the existing preference-mute filters (global/per-crew `notif_messages` etc.) — both can independently cause a push to not show; they're separate mechanisms, don't conflate them when debugging "why didn't I get notified."

**How it works, end to end:**
1. `buildPayload()` in `send-notification/index.ts` puts `crew_id` directly in the push's `data` object for the three chat-message types (not just baked into `data.url`) — `/dm/[friendId]` routes never expose crew_id in their URL, so the service worker can't recover it by parsing `url` alone. If you add a new crew-scoped `NotificationType`, include `crew_id` in its `data` too if it should ever be eligible for this suppression; omit it (like `friend_request`/`recruit_arrived`) if it shouldn't.
2. `ChatInput.tsx` is the single owner of "is the user currently looking at this crew's chat" — it already runs a per-crew effect for the presence heartbeat (mount / `visibilitychange` / unmount), so `notifyActiveCrew(crewId)` (`shared/utils/notifications.ts`) is called at those same three points: on mount if the page starts visible, on each `visibilitychange` (`crewId` when visible, `null` when hidden), and `null` on unmount/crew-switch. This posts `{ type: 'nexus-active-crew', crewId }` to the active service worker.
3. `sw-push.js` keeps a module-scope `activeCrewId`, updated by a `message` listener for that event type. In the `push` handler, if the incoming `notifData.crew_id === activeCrewId`, it skips `showNotification` and the `navigator.setAppBadge()` call entirely — but still runs the push-log/diagnostics and client `postMessage` (so `PushDebugFAB` and any open tab still see the push arrived, just silently).

**Gotchas if you touch this:**
- `activeCrewId` is in-memory SW state — it does **not** survive the SW being evicted/restarted, and there's no persistence layer for it. This is an intentional fail-open tradeoff (worst case: a stale/lost value means the notification *shows* when it technically could've been suppressed — never the reverse, since the client re-announces on every `visibilitychange`). Don't "fix" this by adding IndexedDB/cache persistence unless a real bug shows the staleness window actually matters in practice.
- Only `ChatInput.tsx` calls `notifyActiveCrew`. If a future screen needs to represent "user is looking at crew X" without mounting `ChatInput` (e.g. a preview/quick-glance surface), it must call `notifyActiveCrew` itself at mount/visibility/unmount — this is not automatically derived from routing or any global store.
- This only suppresses the **OS banner**. It never affects whether `send-notification` fires, whether `push_subscriptions` cleanup runs, or whether the message itself is delivered/stored — those are unrelated to this mechanism.
- `send-notification/index.ts` changes require a manual `supabase functions deploy send-notification --project-ref tlveyeisjbythssmocth` — `sw-push.js`/`ChatInput.tsx`/`notifications.ts` changes ship on the normal `git push` → Vercel deploy.

## Key files
See `notification-engine`'s "Key files" list for the delivery pipeline. Additional files specific to active-crew suppression:
- `public/sw-push.js` — `activeCrewId` state, the `message` listener, the suppression check in the `push` handler
- `src/shared/utils/notifications.ts` — `notifyActiveCrew()`
- `src/features/chat/components/input/ChatInput.tsx` — the only call site, piggybacked on the existing per-crew presence effect
- `supabase/functions/send-notification/index.ts` — `buildPayload()`'s `data.crew_id` field
