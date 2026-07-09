---
name: devmode
description: How developer-only access is gated in Nexus — profiles.is_dev as the sole source of truth, the server-guard pattern, and the client localStorage flags that layer debug/feature toggles on top of it. Load before adding any new dev-only page, button, panel, toggle, or server action, or when auditing whether a feature is actually hidden from non-dev users.
---

# Dev Mode

## The rule

**`profiles.is_dev` (boolean, DB) is the only real access boundary.** Everything else — the Braces button, Developer Settings rows, debug FABs, localStorage flags — is UI convenience layered on top. Any new dev-only feature must satisfy both of these, not just one:

1. **UI visibility** gates on a server-verified `isDev` (a prop fetched from `profiles.is_dev` server-side, or a route that redirects non-dev users before rendering).
2. **Any server action or mutation** the feature triggers independently re-verifies `is_dev` on the server — never trust that "the button was hidden" is enough. A user can call a server action directly (devtools, curl, a replayed request) without ever touching the UI that supposedly gated it.

If a new feature only satisfies #1 (hidden button) but its underlying action skips #2, a non-dev user who discovers the action's name/signature can still invoke it. If it only satisfies #2 without #1, it works but is needlessly undiscoverable-by-accident only — still do #1 for a clean UX, but #2 is the one that must never be skipped.

## Pattern A — gating a page

Redirect server-side, before the client component ever mounts:
```ts
// app/(app)/profile/settings/page.tsx
const { data: profile } = await supabase.from('profiles').select('is_dev').eq('id', session.user.id).single()
if (!(profile as { is_dev?: boolean } | null)?.is_dev) redirect('/profile')
```
`/profile/settings`, `/profile/developer/announcements`, and `/profile/error-logs` all follow this exact shape. The client component behind the route (`DeveloperUserSettings.tsx`, etc.) takes **no `isDev` prop and does no check of its own** — it trusts the route guard already ran. Don't add a redundant client-side check to these; don't remove the server-side one.

## Pattern B — gating a button/section on an already-loaded page

Fetch `is_dev` in the page's server component, pass it down as a plain `isDev: boolean` prop, condition the JSX on it directly:
```ts
// app/(app)/profile/page.tsx
isDev={profile?.is_dev === true}
```
```tsx
// ProfileClient.tsx
{isDev && (
  <ProfileTopBarButton onClick={() => router.push('/profile/settings')} ariaLabel="Developer settings">
    <Braces .../>
  </ProfileTopBarButton>
)}
```
This is how the Braces button works today — gated on `isDev` alone. It used to also require a `nexus_dev_mode` localStorage flag; that was removed because the flag has no in-app toggle and is unreachable without devtools access, which made the button permanently unreachable on installed iOS PWAs for legitimate dev accounts. Since `/profile/settings` already redirects non-dev users server-side regardless, the flag was UX friction, not a real security layer — removing it didn't expose anything.

**Do not reintroduce a client-only flag as a *requirement* for a dev-only button to appear.** `isDev` alone is both necessary and sufficient for visibility gating.

## Pattern C — gating a server action

```ts
// app/(app)/profile/developer/actions.ts
async function requireDev() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated' as const }
  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('is_dev').eq('id', session.user.id).single()
  if (!(profile as { is_dev?: boolean } | null)?.is_dev) return { error: 'Unauthorized' as const }
  return { session, service }
}
```
Every dev-only server action starts with `const auth = await requireDev(); if ('error' in auth) return { error: auth.error }`. This is the canonical pattern (see `profile/developer/actions.ts`'s combat-test actions, `resetFriendshipXPAction`, `resetGemCooldownAction`; `home/actions.ts`'s announcement actions; `app/actions/errors.ts`'s error-log actions). **Any new server action that only a dev should be able to call must open with this same check** — copy `requireDev()` (or call the existing one if it's already imported in that file) rather than relying on the caller having been gated client-side.

## The localStorage flags — what they're actually for

`nexus_dev_mode`, `nexus_push_diag`, `nexus_infinite_coins`, `nexus_afk_exp`, `nexus_friendship_xp`, `nexus_poll_feature`, `nexus_events_enabled`, `nexus_combat_system` are **per-device UI toggles for cosmetic/debug display**, not access control. `nexus_infinite_coins`, `nexus_friendship_xp`, `nexus_events_enabled`, `nexus_poll_feature`, and `nexus_push_diag` have an in-app toggle row in Developer Settings (itself is_dev-gated, Pattern A) — flipping one only ever changes what renders in *your own* client, and any action it unlocks (e.g. creating an event) is separately re-checked server-side via Pattern C. `nexus_dev_mode`, `nexus_afk_exp`, and `nexus_combat_system` have no in-app toggle at all — devtools-only (or, for `nexus_dev_mode`, settable via a `?dev=1` URL param handled in `(app)/layout.tsx`).

**Known, accepted characteristic — not a bug to "fix" reflexively:** a few purely-visual dev toggles (`PushDebugFAB`'s `nexus_push_diag` gate, `FloatingBackButton`'s `nexus_dev_mode`/`nexus_events_enabled` gate) check *only* the localStorage flag, with no `isDev` prop in that component at all. This is acceptable **only** because: (a) the flag has no discoverable in-app path for a non-dev user to flip on their own device, and (b) nothing sensitive is exposed if they did — `PushDebugFAB` only reveals your *own* push-subscription diagnostics, `FloatingBackButton`'s gate only reveals a client-only events preview UI. If a future feature behind one of these flags starts exposing another user's data, another user's actions, or anything mutating, it must be upgraded to Pattern B/C — don't assume "it's behind a devtools flag" is sufficient once the stakes change.

## Checklist for a new dev-only feature

1. Does it need its own route? → Pattern A (server redirect).
2. Does it live on an existing page as a button/panel/section? → Pattern B (`isDev` prop from the page's server component, condition JSX directly on it — no localStorage flag as a co-requirement).
3. Does it call a server action or edge function? → Pattern C (`requireDev()`-style check as the first thing the action does, independent of whether the UI that calls it was gated correctly).
4. If it needs a device-local on/off toggle for convenience (e.g. "only show this debug overlay on my phone, not by default even for me") — that's fine as an *additional* localStorage flag layered inside an already is_dev-gated surface (Developer Settings), never as a substitute for the is_dev check itself.
5. Never gate purely on a localStorage flag with no `isDev` anywhere in the chain unless the feature is read-only, self-scoped (only ever shows the current dev's own data), and non-mutating. Anything else needs Pattern C at minimum.

## Key files
- `src/app/(app)/profile/settings/page.tsx`, `.../profile/developer/announcements/page.tsx`, `.../profile/error-logs/page.tsx` — Pattern A route guards
- `src/features/profile/screens/ProfileClient.tsx` — Braces button, Pattern B
- `src/app/(app)/profile/developer/actions.ts` — `requireDev()`, the canonical Pattern C helper, plus all combat-test/reset actions
- `src/app/(app)/home/actions.ts` — its own `requireDev()` copy, gates announcement CRUD
- `src/app/actions/errors.ts` — dev-gated client error log actions
- `src/features/profile/screens/DeveloperUserSettings.tsx` — the toggle rows for `nexus_push_diag`/`nexus_infinite_coins`/`nexus_poll_feature`/`nexus_events_enabled`/`nexus_friendship_xp`
- `src/shared/components/pwa/PushDebugFAB.tsx`, `src/features/chat/components/navigation/FloatingBackButton.tsx` — the accepted localStorage-only exceptions (self-scoped, non-mutating)
- `src/app/(app)/layout.tsx` — the `?dev=1`/`?dev=0` bootstrap script for `nexus_dev_mode`
