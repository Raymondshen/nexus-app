---
name: notification-handling
description: Scoping guardrail for push-notification work in Nexus — default to adding a new NotificationType (a new push notification function/case) through the existing send-notification pipeline rather than building a parallel delivery path. Also documents the subscription-opt-in gotchas found while debugging why push wasn't reaching real users. Load before touching anything push-notification related, alongside the notification-engine skill.
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

## Key files
See `notification-engine`'s "Key files" list — unchanged by this skill. This skill is a scoping/gotchas layer on top, not a replacement.
