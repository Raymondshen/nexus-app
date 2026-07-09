# Nexus Code Review — 2026-07-09

**Scope:** full read of the chat hot path (ChatInput, MessageList, MessageBubble, both stores), all 9 API routes, next.config/proxy/vercel.json, resilience utilities, plus live Supabase state (RLS policies, triggers, advisors, deployed edge functions) and a full `tsc` + ESLint run.

**TL;DR — top five:**
1. **[HIGH RISK] Any user can grant themselves dev access and coins.** `profiles: owner can update` RLS policy has no column restrictions — a PostgREST `PATCH` can set `is_dev = true` or `coins`. Only gem columns are trigger-protected. (§7.1)
2. **[HIGH RISK] Any crew member can set their crew's `total_xp`/`level`/`invite_code` directly** — `crews: members can update` is unrestricted. (§7.2)
3. **[HIGH RISK] `award-xp`, `attack-boss`, `award-friendship-xp` are spoofable** — called with the public anon key, `user_id` from body, never verified. (§7.3)
4. **[HIGH RISK] Daily account-deletion cron likely failing silently** — `/api/cron/process-deletions` calls the `process-deletions` edge function with no Authorization header while it's deployed `verify_jwt: true`. (§4.1)
5. **[MEDIUM RISK] next-pwa is dead weight blocking Turbopack** — its workbox `sw.js` is never registered; the `runtimeCaching`/`fallbacks` config is inert; `sw-push.js` does the real work. (§3.1)

Risk tags = risk of making the change. Ordering within sections = priority.

## 1. File Size / Readability
- **[MEDIUM]** `src/features/chat/components/input/ChatInput.tsx` (2,025 lines) god component — extract `usePresenceHeartbeat` (~556–705), `useCombatRealtime` (~308–370), `useNotifPrefs` (~416–454), inline confirm sheets (~1758–1926).
- **[MEDIUM]** `src/features/home/screens/HomeClient.tsx` (2,020 lines, 62 hooks) — split per section.
- **[LOW]** `MessageBubble.tsx` (1,286) — move `BirthdayMessage`/`JoinMessage`/definition sheet to sibling files.
- **[LOW]** `DefinitionHomePage.tsx` (915) — extract `CreateDefinitionPage`.
- **[LOW]** LoginForm (800), PushDebugFAB (623) oversized.
- **[LOW]** ChatInput's kick sheet (~1758) and last-member warning (~1869) duplicate inline bottom-sheet markup, violating the `<BottomSheet>` rule.
- **[LOW]** Textarea-height math duplicated in ChatInput (~508 and ~529).
- **[LOW]** `parseCombatEvent`/`parseDamageFloat` (combat domain) live in `MessageList.tsx:99–161`.

## 2. Performance
- **[LOW] ChatInput subscribes to the entire chat store** (`ChatInput.tsx:190–198` bare `useChatStore()` destructure) — re-renders the 2,000-line component on every store change including every incoming message/reaction patch. Biggest cheap win: individual selectors.
- **[LOW] 37 `react-hooks/set-state-in-effect` lint errors** — synchronous setState in effects (localStorage-on-mount patterns).
- **[MEDIUM] 5 `react-hooks/rules-of-hooks` errors in MessageBubble/CombatHUD** — latent crash + perf smell.
- **[LOW] Framer Motion animating layout props:** Plus-button focus animation animates `width`/`marginRight` (`ChatInput.tsx:1646–1655`) — reflows per frame; prefer transform/opacity.
- **[LOW] `definitions` re-fetch re-renders every bubble:** `MessageList.tsx:850–928` sets a fresh array even when contents unchanged; `areEqual` compares identity. Add a deep-equality bail-out like the `memberUsernames` one.
- **[LOW] `renderHighlightedInput` (`ChatInput.tsx:1335`)** rebuilds member Set + regex per keystroke.
- Store structure fine; both stores flat with bail-outs.

## 3. Load Speed
- **[MEDIUM] next-pwa effectively dead, costs Turbopack.** `SWRegister` registers only `sw-push.js`; generated `sw.js`/workbox never registered; `pwaConfig` inert; `sw-push.js` has its own `/offline.html` fallback. Removing next-pwa shrinks assets and likely unblocks Turbopack. Needs on-device PWA regression pass.
- **[LOW] `lucide-react` dependency for one icon** — only `NotificationPrompt.tsx`. Replace with pixelarticons, drop the package.
- **[MEDIUM] 106 client files, framer-motion broad** — `LazyMotion` only if bundle analysis shows it matters.
- **[LOW] Images in good shape** (custom loaders, LQIP, deviceSizes, minimumCacheTTL).
- **[LOW] Code splitting candidates:** GIF picker (Klipy), `react-easy-crop` modals via `next/dynamic`.

## 4. Bugs / Errors
tsc clean. ESLint 54 errors / 63 warnings (37 set-state-in-effect, 34 unused-vars, 10 refs, 5 rules-of-hooks, 2 exhaustive-deps, 2 incompatible-library, 1 prefer-const, 1 no-img-element).
- **[HIGH/verify] process-deletions cron 401s** (`route.ts:13–16`, no auth header vs verify_jwt:true).
- **[MEDIUM] Conditional hooks in MessageBubble/CombatHUD.**
- **[LOW] `handleToggleNotif` no rollback** (`ChatInput.tsx:436–452`).
- **[LOW] Notif prefs default all-on before fetch resolves; quick toggle writes stale values** (`ChatInput.tsx:145`).
- Optimistic/Realtime reconciliation reviewed and sound (tempId keys, INSERT-beats-RPC dedup, pendingReactionIds gates, monotonic HP).
- **[LOW] 34 unused-vars**; `api/combat/boss-attack/route.ts` ignores its request body.

## 5. Poor-Network Resilience
Strengths: IDB outbox + resume, `sendWithRetry` backoff, three-tier cache, DelayedSkeleton, network-scaled upload quality, 8s skeleton fallback.
- **[LOW] `settleXp`/`callAttackBoss` fire-and-forget, no retry/AbortController** (`ChatInput.tsx:756–790`) — XP silently lost on flaky networks.
- **[LOW] Offline fallback works only via `sw-push.js`** — test on device.
- **[LOW] `leaveCrewAction` failure not surfaced** (`ChatInput.tsx:1290–1299`).

## 6. Dead Code
- **[LOW] `NotesGrid.tsx` (743 lines)** — zero imports. Delete.
- **[LOW] `ChatHeader.tsx` (324) + `ShareModal.tsx` (transitively) + `DMHeader.tsx`** — dead. Update CLAUDE.md layout list.
- **[LOW] `profile/developer/actions.ts` + orphaned account actions** — documented, but no logout/delete-account UI exists.
- **[MEDIUM] Deployed edge functions with zero refs:** `check-raid-expiry`, `check-void-spawn`. In-repo undeployed: `generate-artifact`. `/api/cron/boss-attack` not in vercel.json.
- **[LOW] `public/sw.js` + `public/workbox-f52fd911.js`** never registered.
- **[LOW] `proxy.ts:4` protects `/party`** — no such route.
- **[LOW] `/api/test/push`** debug endpoint in production.

## 7. Security
- **[HIGH] `profiles` owner-update allows every column** — `is_dev`, `coins`, `username` (bypasses format validation; no CHECK constraint). Fix: protection trigger + CHECK.
- **[HIGH] `crews: members can update` unrestricted** — `total_xp`, `level`, `invite_code`, `is_dm` writable by any member.
- **[HIGH] Spoofable edge functions:** `award-xp`/`attack-boss`/`award-friendship-xp` called with ANON key + body `user_id` (`ChatInput.tsx:761, 772, 832`). Derive user from JWT like `award-gem`.
- **[HIGH] 28 SECURITY DEFINER RPCs granted to anon/authenticated** — worst: `increment_user_coins`, `increment_crew_xp`, `increment_friendship_xp`, `damage_raid`, `apply_boss_damage`, `claim_daily_gem`. Revoke client EXECUTE on internal ones.
- **[MEDIUM] `messages` UPDATE policy allows any column of own messages** (`xp_awarded`, `reactions`, `element_type`).
- **[MEDIUM] Always-true INSERT policies:** `coin_log` (forgeable), `reserved_users` (spam).
- **[MEDIUM] SSRF/open proxy in `/api/og-preview` + `/api/og-image`** — no auth, no private-IP filtering.
- **[MEDIUM] `/api/combat/boss-attack`** — any session triggers global tick with service key.
- **[LOW]** `/api/gif` unauthenticated Klipy quota burn; `profiles` SELECT true for anon (privacy); buckets allow listing; leaked-password protection off; ~30 functions mutable search_path.
- Good: no service key client-side; cron routes check CRON_SECRET; proxy getSession strategy consistent.

## 8. Supabase Hygiene
- 33 tables, all RLS-enabled. Orphans: **`crew_notification_mutes`** (zero refs, superseded), **`artifact_templates`** (zero refs). **`notification_preferences`** read by send-notification but no write path — permanent-mute trap.
- Trigger functions (`handle_new_user`, `update_crew_last_message`, `rls_auto_enable`, `auto_join_active_raid`) callable via RPC by anon — revoke EXECUTE.
- 34 never-used indexes (mostly FK-covering from `20260708010000`). Keep delete-path FK indexes; drop dead ones on `messages` (`messages_event_id`, `messages_pinned_by`).
- 71 migrations; history drifted from remote (`supabase db push` fails) — repair before it grows.
- Edge functions: deployed-unreferenced `check-raid-expiry`/`check-void-spawn`; repo-undeployed `generate-artifact`; `react-to-message` now ACTIVE.

**Suggested order:** (1) HIGH security items §7, (2) process-deletions cron header, (3) rules-of-hooks errors, (4) delete dead files, (5) ChatInput store-selector fix, (6) next-pwa removal as its own tested change.
