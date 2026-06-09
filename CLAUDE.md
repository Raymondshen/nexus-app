# Nexus — Project Context

## What Is Nexus
Group messaging app where the chat is an RPG. Every message earns XP, boss fights drop into chat at XP thresholds, and victories mint artifacts stored in the Memory Vault. Characters are pixel art in RotMG top-down style.

## Tech Stack
- Next.js 16 App Router + TypeScript
- Tailwind CSS, Framer Motion, Zustand
- Supabase: Auth, Postgres, Realtime, Storage, Edge Functions
- next-pwa v5 (generates workbox SW at build time — **do not use for push**; see sw-push.js below)
- `pixelarticons` — pixel art SVG icon React components; imported per-icon from `pixelarticons/react/[ComponentName]`; use `<ComponentName style={{ width: N, height: N, color: 'X' }} />` (never lucide-react in chat/home UI)
- Deployed on Vercel

## Remaining Work (Phase 1)
- [ ] Win state + artifact card drop
- [ ] End-to-end audit

## Database Tables
```
profiles       id, username (unique case-insensitive), avatar_class, avatar_url, birthday (date), is_dev, coins (int default 0), created_at
crews          id, name, invite_code (6 chars unique), level, total_xp, created_at,
               is_dm (bool default false), dm_partner_1 (uuid nullable), dm_partner_2 (uuid nullable)
crew_members   id, crew_id, user_id, class, joined_at, last_seen (unread cursor + presence)
messages       id, crew_id, user_id, content, message_type, element_type, xp_awarded, reactions (jsonb default '{}'), created_at
crew_xp_log    id, crew_id, user_id, xp_amount, source, created_at
bosses         id, name, type (void|ghost|flood|scheduled), max_hp, weak_element, description
active_raids   id, crew_id, boss_id, current_hp, max_hp, phase, started_at, expires_at, defeated_at, mvp_user_id, expiry_notif_sent
artifacts      id, crew_id, name, rarity (common|rare|epic|legendary), source_boss_id, earned_at, mvp_user_id, asset_type, metadata
push_subscriptions  id, user_id, crew_id (nullable), endpoint (UNIQUE), p256dh, auth, created_at
notification_preferences  user_id (PK), notif_messages, notif_raids, notif_victory, updated_at
friendships    id, requester_id, addressee_id, status (pending|accepted), created_at — UNIQUE(requester_id, addressee_id)
coin_log       id, user_id, crew_id (nullable), coins, source, created_at
app_invites    id, code (text unique), inviter_id (uuid → profiles), used (bool default false), used_by (uuid → profiles), used_at (timestamptz), created_at
reserved_users id, email (text unique), username, class (text nullable), created_at, converted (bool default false)
```

### DM Channels
DM channels are stored as `crews` rows with `is_dm = true`. They reuse the entire existing chat stack (messages, realtime, XP, boss raids, artifacts). Key invariants:
- `dm_partner_1 < dm_partner_2` (UUID order) — enforced by `get_or_create_dm` to guarantee uniqueness
- `invite_code` is set to a random 8-char string (prefix `dm`) — DMs are never joinable by code
- Both partners are inserted into `crew_members` with class `berserker` at creation time — no class-selection onboarding step needed
- DM crews are **filtered out** of the home Squads section; they appear only in the Friends section

## Postgres Functions
All are `SECURITY DEFINER`. All declared in `Database.Functions` in `src/types/index.ts`.
- `create_crew(p_name, p_invite_code)` → uuid
- `join_crew(p_invite_code)` → uuid
- `leave_crew(p_crew_id)` → jsonb `{ok|deleted}`
- `insert_message(p_crew_id, p_content, p_message_type)` → messages row (computes element_type server-side)
- `damage_raid(p_raid_id, p_damage, p_user_id)` → `(current_hp, phase, defeated_at)`
- `increment_crew_xp(p_crew_id, p_xp_delta)` → `(new_total_xp, new_level)`
- `is_crew_member(p_crew_id)` → boolean (RLS helper)
- `get_or_create_dm(other_user_id)` → uuid — returns the DM crew id for this pair, creating it if needed; verifies an accepted friendship exists before creating
- `get_unread_counts(p_crew_ids, p_cutoffs)` → `TABLE(crew_id, unread_count)` — batch unread counts for multiple crews in one query; uses `auth.uid()` internally; replaces N parallel count queries on the home page
- `get_crew_member_msg_counts(p_crew_id)` → `TABLE(user_id, msg_count)` — per-member message counts for a crew in one query; replaces N parallel count queries in `GroupProfileSheet`
- `get_member_crew_stats(p_crew_id, p_user_id)` → `TABLE(msg_count, total_xp)` — message count + XP total for one member in one crew; used by the member profile page
- `increment_user_coins(p_user_id, p_amount)` → void — atomic `UPDATE profiles SET coins = coins + p_amount`; called by `award-xp` edge function
- `toggle_reaction(p_message_id, p_emoji, p_user_id)` → jsonb — row-locking atomic toggle: adds user to the emoji's array if absent, removes if present, deletes empty keys; returns full updated reactions object; called by `react-to-message` edge function

## Game Rules

### XP Values
| Action | XP |
|---|---|
| Text message | 10 |
| Voice note | 25 (disabled in UI) |
| Image / GIF | 20 (disabled in UI) |
| Reaction | 5 |
| Daily Drop response | 50 |
| First message today bonus | +20 |
| Reply within 60s combo | +5 |

### Coin System
Coins are the invite currency. Earned by sending messages; spent (future) to invite new members.

| Action | Coins |
|---|---|
| Text message | 1 |
| Voice note | 1 |
| Image / GIF | 1 |
| Reaction / system | 0 |
| Generate invite code | −25 (`source='invite_generated'`) |
| Invited user joins | +50 to new user (`source='seed'`) |

- All message types (text, voice, image) earn exactly **1 coin** — flat rate regardless of type
- New users receive a **50-coin signup bonus** awarded by the `handle_new_user` DB trigger at account creation; logged in `coin_log` with `source = 'signup_bonus'`
- **Invite generation**: costs 25 coins; server re-validates balance before deducting — never trust client. If inviter already has an unused code, returns it without deducting. Code generation uses alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no ambiguous chars: 0, O, I, 1). Up to 10 uniqueness retries before error.
- **Seed coins**: new user who joins via invite gets 50 coins; idempotent — checked via `coin_log source='seed'` to prevent double award.
- Stored in `profiles.coins` (integer, default 50 for new users); log in `coin_log`
- Awarded in `award-xp` edge function via `increment_user_coins(user_id, amount)` RPC (atomic UPDATE)
- Anti-spam: coins only awarded when `xpBlocked = false` (same cooldown/burst gate as XP)
- `ChatInput` calls `addUserCoins(coins_earned)` from store on award-xp response
- **Displayed in the home header only**: amber pill badge — `bg-[rgba(245,158,11,0.25)] rounded-[4px] px-1` (4px horizontal padding) stretching the full `h-10` row height, containing `TokeCircle` icon (`pixelarticons/react/TokeCircle`) at **24×16px** (not square) + count in **Silkscreen 12px** `#f59e0b` (amber, not gold), `w-[26px] pb-[2px]`. Gap inside badge is `gap-1` (4px). The NEXUS logo has `w-[140px]`. Tap shows "25 COINS = 1 CREW INVITE" tooltip (2s). `HomeClient` seeds local `coins` state from `Math.max(initialCoins, chatStore.userCoins)` on mount. **Critical**: `chatStore.userCoins` must hold the absolute balance (not a delta from 0) — the `useState` initializer seeds the store with `initialCoins` whenever the store value is lower, so that subsequent `addUserCoins(1)` calls in chat accumulate from the correct base (e.g. 100 → 101, not 0 → 1). Without this seeding, `Math.max(initialCoins=100, storeCoins=5)` would always return 100 and ignore earned coins until realtime fires. Realtime `postgres_changes` UPDATE on `profiles` keeps the display live AND re-syncs the store value (`setUserCoins(newCoins)`). `handleCoinsDeducted` also syncs the store on spend (-25). **No `initialCoins` sync effect** — a previously present `useEffect([initialCoins])` was removed because stale server re-renders snapped back to pre-deduction values. The `useState` initializer + Realtime subscription are the two correct sources of truth.
  - Coins are **not** shown in the message bubble header — home header only.
- `chatStore` holds `userCoins`, `setUserCoins`, `addUserCoins`; **not** shown in `ChatHeader` — coins are home-only at the global level
- `profiles` table is in `supabase_realtime` publication — `HomeClient` subscribes to `postgres_changes` UPDATE on `profiles` for live coin balance (ChatHeader no longer subscribes)

### Boss Rules
- The Void spawns at every 500 XP threshold
- Fight window = 48 hours; 3 phases (100–60%, 60–30%, 30–0%)
- Phase 3 = enrage (frequency threshold required)
- Defeat → artifact drops into chat

### Element System
| Element | Trigger |
|---|---|
| fire | <20 chars |
| water | >150 chars |
| lightning | voice notes |
| nature | images/GIFs |
| shadow | reactions |
| arcane | daily drop / system |

### Character Classes
Berserker (spam), Sage (long messages), Ghost (silence crit), Hype Man (reactions), The Voice (voice), Meme Lord (images)

## Auth Strategy
- Primary: Google OAuth (`signInWithOAuth` → `/auth/callback` → `/home`)
- Secondary: Anonymous sessions (`signInAnonymously`); guest badge + Save Progress shown in header
- Save Progress triggers Google OAuth; guest session abandoned on upgrade
- No email/password auth

### Invite-Only Gate — `/login`
The login page is invite-only with two paths. Guest mode is removed.

**Invite Code Path** (`LoginForm.tsx` step machine: `landing → invite-code → invite-oauth → invite-profile`):
1. User clicks "I HAVE AN INVITE CODE" → `invite-code` step: enter code, click "VERIFY CODE"
2. `validateInviteCodeAction(code)` (server action, service client) — checks `app_invites` for a valid unused code; returns error immediately if invalid or already claimed. Does **not** consume the code.
3. On valid code → `invite-oauth` step: shows "CODE ACCEPTED" + the verified code in a purple info box. Before triggering OAuth, client sets `nexus_invite_code=CODE` cookie (SameSite=Lax, 5min TTL) via `document.cookie`, then calls `signInWithGoogleForInvite()` which sets the `nexus_auth_intent=invite` cookie and triggers OAuth.
4. Auth callback reads both cookies: routes to `/login?flow=invite&step=2&code=CODE`, clears both cookies.
5. `invite-profile` step: `checkReservedUserAction()` checks `reserved_users` by session email:
   - **Match found with username + class**: auto-calls `completeInviteFlowAction` on mount (spinner stays up); redirects to `/home` silently — user never sees the form.
   - **Match found, class missing**: shows pre-filled read-only username; falls through to manual submit.
   - **No match**: warrior name input only — **no class selection**. Class defaults to `'mage'` and is set properly per-crew during onboarding.
   - **No session**: bounces back to `invite-oauth` with an error.
   - No invite code input in any case — code comes from the `?code=` URL param.
6. `completeInviteFlowAction(code, username, cls)`: re-validates code in `app_invites` (final guard), upserts `profiles.username` + `profiles.avatar_class`, marks invite `used=true/used_by/used_at`, returns success → client calls `router.push('/home')`
7. Home page birthday guard kicks in → `/onboarding/birthday` → `/onboarding/welcome` → crew join/create

**Cookie flow for invite code across OAuth**: `nexus_invite_code` is set client-side before OAuth, survives the Google cross-site redirect (SameSite=Lax), read by the callback, appended to the step-2 redirect URL as `?code=XXX`, then deleted. `nexus_auth_intent=invite` is set by `signInWithGoogleForInvite()` (same pattern). Both cookies are deleted together in the callback response.

**Reserve My Place Path** (`landing → reserve-email → reserve-class → reserve-name → reserve-done`):
- No auth session created — purely a waitlist record in `reserved_users`
- Validates Gmail-only (`@gmail.com` suffix), username length ≥ 3
- Duplicate email check server-side before insert (idempotent error copy: "A warrior already guards this name.")
- Confirmation screen with game-voice copy

**`reserved_users` RLS**: anyone can insert (public waitlist); no select/update policies (service role only reads). Migration `20240103000011`.

**`app_invites` validation**: uses `createServiceClient()` in both `validateInviteCodeAction` and `completeInviteFlowAction` to bypass the inviter-only RLS policy. Code lookup is case-insensitive (input `.toUpperCase()`). Race condition guard: `.eq('used', false)` on the update.

**Error copy** (game voice):
- Invalid code: "The Nexus does not recognize this code."
- Already used: "This code has already been claimed."
- Generic: "The rift destabilized. Try again."
- Email already reserved: "A warrior already guards this name."
- No existing account on sign-in: "No warrior found. The Nexus is invite only — ask an existing member for a code."

**`ClassCarousel`** (inline in `LoginForm.tsx`): single-class-at-a-time view, ‹/› arrows + dot indicators, color-coded border per class. Same 5 classes as onboarding: mage, warrior, rogue, healer, archer.

**`signInWithGoogleForInvite()`** in `src/lib/supabase/auth.ts`: sets a `nexus_auth_intent=invite` cookie (SameSite=Lax, 5min TTL) then calls `signInWithOAuth` with the standard `redirectTo` (no query params). The cookie survives the Google cross-site redirect; the callback reads it and routes to the invite step, then clears it. This avoids adding a second URL to the Supabase redirect allowlist.

**Landing screen — third option (existing members)**: below the two main CTAs a divider labeled "ALREADY A MEMBER" precedes a muted "SIGN IN WITH GOOGLE" button that calls the standard `signInWithGoogle()`. Auth callback checks `profiles.username` for the signed-in user:
- Username set → `/home` (existing member)
- No username → `/login?error=no_account` → red error on landing: "No warrior found. The Nexus is invite only — ask an existing member for a code."
Styled subordinately (dim border, muted text brightens on hover) so it does not compete with the invite/reserve CTAs.

## Onboarding Flow
- **New users**: name → `/onboarding/birthday` → `/onboarding/class` → `/onboarding/welcome` → chat/crew
- **Existing users without birthday**: home page detects missing `birthday` and redirects to `/onboarding/birthday`
- Birthday page (`/onboarding/birthday`): three-dropdown UI (month/day/year); validates real dates (rejects Feb 30, future dates); saves as `YYYY-MM-DD`; redirects to class selection (with `crew` param) or `/onboarding/welcome` (no crew)
- `crewId`, `welcome`, and `invite` query params are forwarded through the birthday → class steps so the user lands in the right crew after onboarding
- **Per-crew class selection**: `chat/[crewId]/page.tsx` guards on `crew_members.class` (per-crew, can be null for new crews). `onboarding/class/page.tsx` skips selection using the same `crew_members.class` check — **NOT** `profiles.avatar_class` (global). Using the global field caused an infinite redirect loop for users who had a global class but joined a new crew. `profiles.avatar_class` is kept in sync by `selectClassAction` as a best-effort display value only.
- **Welcome screen redirect**: `selectClassAction` with `welcome=1` redirects to `/onboarding/welcome?crew=${crewId}` ONLY when `crew_members` count for the user equals 1 (their first ever crew). Prevents redirect loop on subsequent crew joins.
- **`invite` URL param threading**: threaded through birthday → class → welcome as a hidden form field + URL param. Known v1 limitation: unauthenticated users clicking an invite link lose the code through the OAuth flow (auth callback always goes to `/home`). Consequence: `app_invites.used_by` is never set for those users, so `"Recruited by"` never appears on their profile pages. To test the recruited-by display while already logged in, navigate directly to `/onboarding/welcome?invite=<code>&crew=<crewId>`. To force-test without going through the flow, run: `UPDATE app_invites SET used=true, used_by='<userId>', used_at=now() WHERE code='<code>';`

### Welcome Screen — `/onboarding/welcome`
- Server component reads `crew` and `invite` params
- If valid unused invite code found: fetches inviter's username; if `crew` param present, marks invite used + awards 50 seed coins + sends `recruit_arrived` push to inviter (all in `Promise.all`, idempotent via `coin_log source='seed'` check)
- Passes `inviterUsername` + `validInviteCode` (for no-crew path) to `WelcomeClient`
- **Invited state**: heading "You're in the Nexus.", subtext "[inviter] recruited you. Now find your crew."
- **Organic state**: heading "The Nexus is yours.", subtext "Build your crew. Start the fight."
- If `crewId` present: single "ENTER THE NEXUS" button → `/chat/${crewId}?welcome=1`
- If no `crewId`: "ENTER CREW CODE" (inline 6-char join form via `joinCrewFromWelcomeAction`) + "START YOUR OWN CREW" (→ `/onboarding/create`)
- Join form passes `inviteCode` as hidden field so invite is processed even when user first lands without a crew
- Key files: `src/app/(app)/onboarding/welcome/page.tsx`, `WelcomeClient.tsx`, `actions.ts`

## Dev Mode
- Controlled by `profiles.is_dev` boolean (default false) — **not hardcoded emails**
- To grant dev mode: `UPDATE profiles SET is_dev = true WHERE id IN (SELECT id FROM auth.users WHERE email = '...')`
- Dev section in `/profile` shows four toggle rows + utility rows:
  - **Spawn Boss Mode** (`nexus_dev_mode`) — enables game event UI in chat
  - **Push Diagnostics** (`nexus_push_diag`) — shows/hides CHECK / SYNC SUB / SEND TEST buttons and push status output; hidden by default to keep the section clean
  - **Infinite Coins** (`nexus_infinite_coins`) — bypasses 25-coin gate for invite forging; home header and InviteArsenal show `∞` when on; sub-label shows live DB coin balance when off; dispatches `nexus-infinite-coins-change` CustomEvent so `HomeClient` reacts immediately without remount
  - **Feat: AFK Exp** (`nexus_afk_exp`) — shows AFK XP accumulated bar + CLAIM button in home screen `ProfileBanner`; dispatches `nexus-afk-exp-change` CustomEvent; hidden from all non-dev users
  - User ID (copy button), Email (copy button), Local Flags reset

### Game Events — Dev-Only Gate
All boss/game event features are disabled for regular users and only activate when **both** `profiles.is_dev = true` (server) and `nexus_dev_mode = '1'` in localStorage (client toggle):

**Server-side (`award-xp`)**: Fetches sender's `is_dev` in Batch 1. Boss spawn (raid creation + `BOSS_SPAWN:` system message) and `LEVEL_UP:` message insertion only run when `isDevUser = true`.

**Server-side (`check-void-spawn`)**: Auto-spawn loop is disabled (no-op). Manual trigger for a specific `crew_id` still works for the dev panel.

**Client-side** — all gated by reading `localStorage.getItem('nexus_dev_mode') === '1'`:
- `MessageList`: hides boss cards, artifact drops, level-up banners, and all system messages
- `ChatHeader` / `DMHeader`: hides boss HP bar + countdown
- `ChatInput`: hides DamageFloat, "Next Boss" label, and RAID ACTIVE indicator. **XP stats row (level, XP counter, XP floats, progress bar) is visible to all users** — only the boss-specific parts are dev-only.

Member avatars and online dots in ChatInput are not gated — those are chat features, not game features.

## Routing — Next.js 16 Proxy
- `src/proxy.ts` — exports `proxy()` + `config.matcher`; **DO NOT add `src/middleware.ts`** (Next.js 16 errors if both exist)
- Protected prefixes: `/home`, `/chat`, `/vault`, `/party`, `/profile`, `/onboarding`, `/friends`, `/dm`
- Uses `getSession()` (cookie-only) NOT `getUser()` — `getUser()` adds 100–300ms per nav
- Build: `next build --webpack` in vercel.json — Turbopack breaks next-pwa and conflicts with proxy.ts

## Architecture Notes

### Realtime Delivery (dual-path + dedup)
- **Sender**: insert DB → broadcast on `messages:{crewId}` → instant display
- **Receiver** (MessageList): Broadcast fires first (~50ms), Postgres Changes INSERT fires as backup
- `addMessage` in chatStore deduplicates by id — both paths can fire for the same message
- **Broadcast payload is slim** — only core `Message` fields (`id, crew_id, user_id, content, message_type, element_type, xp_awarded, created_at`); no profile. MessageList resolves the sender profile from its `profilesRef` (populated from server-fetched `memberProfiles`).
- Postgres Changes requires `messages` + `active_raids` in `supabase_realtime` publication (migration `20240103000001`)

### XP Sync — real-time for all crew members
- `award-xp` edge function returns `new_total_xp` in response
- Sender: calls `addXP(10)` immediately on send (optimistic — float + bar advance, zero network delay), then `setCrewXP(data.new_total_xp)` on award-xp response (quiet authoritative sync, no second float). Broadcasts `xp_update` on `messages:{crewId}` channel.
- Receivers: `receiveXP(earned, newTotal)` action in chatStore sets absolute XP + spawns XP float
- Broadcast handler deduplicates by `sender_id` — sender gets `setCrewXP` (no float), others get `receiveXP`

### Online Presence
- **Single presence channel**: ChatInput's `messages:{crewId}` channel is the sole presence channel. ChatHeader has NO presence channel — having two concurrent presence channels from the same Supabase singleton client causes interference and breaks dot display.
- `ch.track({ username, typing: false })` is called in the `.subscribe()` callback (status === `'SUBSCRIBED'`) so every user enters presence state as soon as the chat opens — **not** only when they type. Uses `userProfileRef.current.username` (ref, not closure) to guarantee the current username is used.
- `join` and `leave` presence events update `onlineUserIds` immediately; `sync` reconciles full state on reconnect
- `onlineUserIds` is seeded with the current user's own ID on mount (optimistic)
- Green dot `#66bb6a` (2×2, `rounded-full`, `border-[1.5px] border-black`) positioned at `-bottom-0.5 -right-0.5` on the 24×24 avatar wrapper
- ChatHeader still updates `last_seen` in DB every 60s (for unread count cursors) — this is separate from Realtime presence

### MessageList — stale-while-revalidate
- sessionStorage key `nexus-msgs-{crewId}`: load cached → `setMessages` + `setHistoryLoaded` in same tick → React 18 batches both so skeleton never flashes on cache hit
- Background Supabase fetch merges with any Realtime messages already in store; result saved back (capped 50)
- `setMessages([])` before cache/fetch prevents stale messages from a previous crew bleeding in
- Cache is written **even if the component unmounts** before the fetch completes (navigating away early) — the fetched rows are stored so the next visit gets a cache hit. Without this, rapidly tapping a crew and going back would permanently prevent the cache from being seeded.

### MessageList — message grouping
Consecutive messages from the same user within 60 seconds are visually grouped (no repeated avatar/header). `showHeader = false` for continuation messages.
- `lastUserId` + `lastMsgTime` tracked in the display-list loop; both reset to null/0 on day dividers, boss cards, artifacts, level-up banners, and system messages — these all break grouping so the next regular message shows a fresh header
- **Spacing**: first in group → `pt-[var(--space-5)] pb-0` (16px, `--space-5` from globals.css); continuation → `pt-[var(--space-2)] pb-0` (4px, `--space-2`). Between-group gap = 16px; within-group gap = 4px.
- **Avatar**: only rendered for `showHeader = true` (first in group). Continuation messages (`showHeader = false`) skip the avatar element entirely and use `pl-10` (40px = 32px avatar + 8px gap) on the content div to keep text aligned.
- **Pre-pass accumulation**: a single pre-pass loop builds both `groupXPMap` and `groupCoinMap` (Map<msgId, number>). The group-leader bubble receives `xpOverride` and `coinOverride` props; `xpOverride` counts up via `requestAnimationFrame` in `MessageBubble`. `coinOverride` state is maintained internally but not rendered — coin totals are home-only.
- **Message bubble header format**: `username · [dot] · class · [dot] · +XP XP` — all items center-aligned with `gap-[4px]`. Purple 2×2px dot separators. Class label `#b3b3b3`, XP amber `#f59e0b`. No pixel sprite in the header; no coin display. Row `gap-[8px]` between avatar and content column.

### ChatInput — send flow
`insert_message` RPC → `addMessage` (optimistic) → broadcast slim payload on `messages:{crewId}` → `award-xp` edge function (patches `xp_awarded` back + broadcasts `xp_update`) → `attack-boss` edge function (if raid active)

- **Single channel**: `messages:{crewId}` is configured with presence and handles message broadcasting, typing presence, and online presence. There is no separate `typing:{crewId}` channel.
- **Send icon**: `Send` from `pixelarticons/react/Send` (16px); `text-primary` when textarea has text, `text-muted` when empty.
- **"Next Boss" label**: always visible (right side of XP stats row) — not gated by dev mode.
- **Member avatars**: 24×24px squares (`w-6 h-6`, no `rounded-full`, no border) — matches Figma `size-[24px]`. Online dot shown via `onlineUserIds` from `messages:{crewId}` presence state.
- **XP floats**: animate bottom-to-top with fade-in then fade-out — `opacity: [0,1,1,0]`, `y: [0,-12,-26,-42]`, `times: [0, 0.15, 0.65, 1]` over 1.4s. Text shows `+{amount} XP` in gold `#ffd700`. Float anchors inline after the Members count text via a `relative inline-block` span — no static label, animation only.
- **XP progress bar spring**: `type: 'spring', stiffness: 300, damping: 28` — tuned so the bar starts moving visibly within the first frame, reaching the target in ~250ms. This matches the float's fade-in timing (~210ms to full opacity) so both animations feel simultaneous. Do **not** drop stiffness below ~280 — slow springs have near-zero initial velocity and appear to lag behind the float.

### award-xp — query batching + anti-spam
- **Batch 1** (always, parallel): previous message gap + burst window count + crew name/XP + sender's `is_dev` flag — 4 queries in one `Promise.all`
- **Batch 2** (only when not spam-blocked, parallel): today's message count + combo count + daily XP log count — 3 queries in one `Promise.all`
- Anti-spam layers: (1) hard stop if prior message <2000ms ago, (2) hard stop if ≥4 messages in last 30s, (3) multiplier 1.0 / 0.5 / 0.1 at 30 / 60 daily message thresholds
- Spam checks gate XP only — **notifications always fire** regardless. Implemented via `xpBlocked` flag; do NOT use early returns before the notification block.
- **Coins**: awarded via `increment_user_coins` RPC + `coin_log` insert (parallel) when `!xpBlocked`. Response includes `coins_earned`; `ChatInput` calls `addUserCoins(coins_earned)` on receipt.
- **Boss spawn + LEVEL_UP message** only execute when sender's `isDevUser = true` (see Dev Mode above)
- Notifications use a **single batch fetch** to `send-notification` per event (one call for all recipients, not a per-member loop). Response includes `notif_count` + `notif_results` logged by ChatInput as `[award-xp] ...`.

### HomeClient — stale preview fix
`router.refresh()` on every home mount forces a background server re-fetch. A `useEffect([initialCrews])` sync effect applies refreshed `initialCrews` prop into `crews` state (useState only runs once on mount).

### HomeClient — realtime channels
Home page subscribes to one `messages:{crewId}` channel per crew for live preview updates. **Broadcast events only** for crew channels — `postgres_changes` subscriptions on `messages` were removed to eliminate a persistent server-side listener that fired on every INSERT across all of the user's crews. If a preview update is missed, `router.refresh()` on mount catches it.

**Exception**: a single `postgres_changes` UPDATE subscription on `profiles` (channel `home-profile-coins:{userId}`) keeps the coin balance live. This is one subscription on the user's own profile row — not per-crew.

### Home Page — birthday guard
`home/page.tsx` reads `birthday` from the cached home profile. If null, redirects to `/onboarding/birthday` before rendering the home screen. This handles existing users who registered before the birthday field was added.

### Home Page — profile banner stats
`home/page.tsx` fetches `totalMessages` (estimated count of non-system messages by the user) in the same `Promise.all` as crew membership. Uses `count: 'estimated'` — exact count forces a seq scan for a stat display that doesn't need precision. Displayed in `ProfileBanner` as `"{N} group chats · {N} msg"` (formatted with `toLocaleString()`). Edit icon uses `MagicEdit` from `pixelarticons/react/MagicEdit` (16px).

### Home Page — Squads + Friends sections
The home body is split into two labeled sections below the profile banner:
- **"Squads"** — crew list (group chats only — DM crews are filtered out). Label uses `font-body font-medium text-[14px] text-primary tracking-[0.2px]`. Empty state shows inline create/join prompt.
- **"Friends"** — accepted 1:1 friends, rendered only when `friends.length > 0`. Same label style. Tapping a friend navigates to `/dm/[friendId]`. Uses `FriendCard` component inside `HomeClient.tsx`.

Data fetching in `home/page.tsx`:
- Stage 1 `Promise.all` fetches `friendships` (accepted only) alongside profile, crew_members, messages
- Stage 2 crews SELECT includes `is_dm, dm_partner_1, dm_partner_2`; DM crews are split off into `dmCrewMap` (friendId → crewId) and `dmLastMsgMap` (friendId → last message) before building Squads summaries
- `buildFriends(friendshipRows, profiles, userId, dmCrewMap, dmLastMsgMap)` resolves friend user IDs → `FriendSummary[]`; `dmCrewMap`/`dmLastMsgMap` default to empty Maps in the no-membership early-return path
- Friend profiles fetched in Stage 2 `Promise.all` alongside crew data (parallel, no waterfall)
- DM last messages come from the same `getCachedCrewLastMessage` calls already made for all memberships — no extra queries

`FriendSummary` interface (`{ id, username, avatarUrl, dmChannelId, lastDMMessage }`) is exported from `HomeClient.tsx` and imported by `page.tsx`. `dmChannelId` is null until the first DM is opened; `lastDMMessage` shows the most recent DM content + timestamp in `FriendCard`.

Header spacing: `pb-2` bottom padding, `paddingTop: max(env(safe-area-inset-top), 8px)`, icon gap `gap-4`.

### Home Page — HomeActionSheet (+ button)
The `+` button opens `HomeActionSheet`. Three menu options (no coin gate on any row):
- **Create a Crew** — transitions to inline create form
- **Join a Crew** — transitions to inline join form
- **Invite a Friend** — always tappable; shows `[Coins 10px] [N] coins available` sub-label in `rgba(255,255,255,0.4)` system-ui. Tapping dismisses the sheet and opens **InviteArsenal** full-screen modal.

Sheet design: `bg-[#0a0612]`, full-width rows min 44px, `border-l-2 border-transparent active:border-purple` on active row, dismisses on outside tap.

### Home Page — InviteArsenal (full-screen modal)
`src/app/(app)/home/InviteArsenal.tsx` — slides up from bottom (`z-[60]`, spring 320/32) over the home screen. Opened by tapping "Invite a Friend" in the action sheet; no coin gate on open.

**Header**: back chevron (`ChevronLeft` from pixelarticons, 24px tertiary) → closes modal. Title `INVITE ARSENAL` (Press Start 2P 14px). Subtitle `"Spend coins. Recruit warriors."` (system-ui 13px rgba(255,255,255,0.4)). Coin balance: `Coins` from pixelarticons (16px) + count (Press Start 2P 12px, `#ffd700`).

**Forge button** (full-width, min-height 56px):
- Label `FORGE INVITE CODE` (Press Start 2P 10px) + sub-label `25 coins` (system-ui 11px)
- Active (coins ≥ 25): `#bf5fff` bg, white labels. On tap: calls `generateAppInviteAction` server-side. On success: `onCoinsDeducted()` (immediate -25 in header), toast "Code forged." in `#66bb6a`, reload list. If server returns insufficient-coins error: toast "Not enough coins." in `#ff4444`. Users can forge as many codes as they have coins for — no per-user unused-code limit.
- Disabled (coins < 25): `rgba(255,255,255,0.1)` bg, muted labels, not tappable. Below: "Keep fighting to earn more coins." in `rgba(255,255,255,0.4)` system-ui 12px.

**Code list** (scrollable, newest first): all `app_invites` rows for current user via `getInviteCodesAction`.
- **UNUSED card**: `rgba(255,255,255,0.05)` bg, `1px solid rgba(255,255,255,0.1)` border. Top row: code (Press Start 2P 13px `#ffffff`, letter-spaced) + UNUSED badge (`rgba(191,95,255,0.15)` bg, `#bf5fff` border/text). Bottom row: formatted date + Copy Code button (`transparent` bg, `#bf5fff` border/text; flips to "Copied!" `#66bb6a` for 2s).
- **USED card**: `rgba(255,255,255,0.02)` bg, `1px solid rgba(255,255,255,0.05)` border. All text `rgba(255,255,255,0.4)`. Top row: code (Press Start 2P 13px muted) + USED badge (muted style). Bottom row: date + "Claimed by [username]" (no copy button).
- **Empty state**: centered, `Coins` from pixelarticons (32px dimmed), "No codes forged yet." (Press Start 2P 8px muted) + "Spend 25 coins to recruit a warrior." (system-ui 13px muted).
- **Realtime**: subscribes to `postgres_changes` on `app_invites` filtered by `inviter_id=eq.{userId}` to update status live when a code is claimed. **Requires** `app_invites` in `supabase_realtime` publication (migration `20240103000010`).

`generateAppInviteAction` (in `src/app/(app)/home/actions.ts`):
- Always generates a new code — no existing-unused-code check (users can forge multiple)
- Re-validates coin balance server-side before deducting
- Generates 6-char code from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no ambiguous chars)
- Up to 10 uniqueness retries; parallel insert + `increment_user_coins(-25)` + `coin_log` insert
- Calls `revalidateTag(\`profile:${user.id}\`, 'max')` after deduction

`getInviteCodesAction` (in `src/app/(app)/home/actions.ts`):
- Fetches all `app_invites` for current user (service client, ordered newest first)
- Resolves `used_by` UUIDs → usernames in one `.in()` profiles query
- Returns `InviteCodeData[]` (id, code, used, created_at, used_by_username)

### Home Page — SwipeableCrewCard leave button
Swipe left on a crew card to reveal the leave action (`LEAVE_REVEAL = 104px`). Leave button design (matches Figma node 50:516):
- Background: `#ef4444`
- Layout: `flex-row items-center justify-center gap-2` (icon beside text — **not** stacked)
- Padding: `px-3 py-2` (12px horizontal, 8px vertical), `h-full overflow-hidden`
- Icon: `Logout` from `pixelarticons/react/Logout` (16px, white)
- Label: `"LEAVE"` in `font-silkscreen text-[16px] text-white whitespace-nowrap leading-none`
- `CrewCardContent` outer div has `pr-2` (8px right padding) to create 8px gap between the timestamp and the revealed leave button edge

### Home Page — LeaveConfirmSheet (bottom sheet)
Triggered by tapping the swipe-reveal leave button on a crew card. Matches Figma node 56:145.
- Container: `bg-surface border-t border-border flex flex-col gap-6 p-4`; `paddingBottom: max(env(safe-area-inset-bottom), 24px)`
- **Header** (`flex flex-col gap-2`):
  - Label: Press Start 2P 8px `text-tertiary` — `"LEAVE CREW"` (or `"DELETE CREW"` when last member)
  - Title + desc (`flex flex-col gap-1`): crew name in DM Sans Bold 18px primary; description in DM Sans Regular 12px secondary
  - Description copy: `"Your XP and artifact gains will be redistributed to the remaining members."` / `"You are the last member. This will permanently delete the crew and all its history."`
- **Buttons** (`flex flex-col gap-2`):
  - Confirm: `w-full h-[48px] bg-[#ef4444]`, Press Start 2P 8px `text-primary`; `"LEAVE CREW"` / `"DELETE CREW"` / `"..."` (pending)
  - Cancel: `w-full h-[48px]`, Press Start 2P 8px `text-tertiary`; `"CANCEL"`

### ChatHeader — NotifSheet (bottom sheet)
Triggered by tapping the bell icon in `ChatHeader`. Matches Figma node 54:337.
- Container: `bg-surface border-t border-border flex flex-col gap-6 p-4 overflow-hidden`; `paddingBottom: max(env(safe-area-inset-bottom), 24px)`
- **Header** (`flex flex-col gap-2`):
  - Crew label: Press Start 2P 8px `text-tertiary`
  - Title + subtitle (`flex flex-col gap-1`): `"Notifications"` in DM Sans Bold 18px primary; `"Control what pulls you back into the chat."` in DM Sans Regular 12px secondary
- **Settings card**: `flex flex-col gap-4 py-4 border border-[rgba(168,85,247,0.5)] bg-surface overflow-hidden` — purple 50%-opacity border
  - Three `NotifToggleRow` rows (`px-4`): Messages / Raid Alerts / Victory; separated by `border-t border-border` dividers
  - Each row: label DM Sans Medium 14px `text-secondary`, description DM Sans Regular 12px `text-tertiary`, toggle 40×24px (purple when on / `#27272a` off), knob `w-4 h-4` animates `left: 4 → 20` via spring `stiffness 400 / damping 30`
- **Close button**: `w-full font-silkscreen text-[16px] text-muted` — `"Close"` (title-case, not all-caps)

### ChatHeader — props and spacing
`ChatHeader` accepts only `{ crew, initialXP, initialRaid, currentUserId, crewId }`. It has **no** `members`, `memberLastSeen`, or `initialCoins` props — member avatars live in ChatInput; coins are home-only. Do not add a second presence channel here (see Online Presence note above).

Header spacing: `px-4 pb-2` (16px horizontal, 8px bottom), `paddingTop: max(env(safe-area-inset-top), 8px)`, heading row `h-10`. Left side: `gap-2` (8px) between back button and crew name group. Crew name button has `gap-1` (4px) between the underlined name and the dropdown chevron. Crew name uses `style={{ textDecoration: 'underline' }}` (inline style, **not** the Tailwind `underline` class) — iOS Safari strips `text-decoration` from class-applied styles on elements inside `<button>`; inline style bypasses this. Dropdown chevron is `ChevronRight` from pixelarticons with `style={{ transform: 'rotate(90deg)' }}`. All icons `style={{ width: 24, height: 24 }}`. Back arrows across all screens use `ChevronLeft` from pixelarticons with `color: var(--color-tertiary)`.

### Page Transitions — SlidePage + useSlideBack
All "detail" pages (chat, DM, profile, friends, vault) slide in from the right on mount and slide back out on close.

- **`SlidePage`** (`src/components/ui/SlidePage.tsx`) — client component that wraps the page's outermost `motion.div`. Enter: spring `stiffness 380 / damping 36` (~280ms). Exit: ease-in tween `[0.32,0,0.67,0]` 280ms, then fires `router.back()` (or `router.replace(backHref)` when `backHref` is set) after 290ms. Guards against double-fire with `exiting` flag.
  - **`backHref` prop** — optional string; when set, `goBack()` calls `router.replace(backHref)` instead of `router.back()`. Used by the chat page when `?welcome=1` is present, and by `ProfileClient`/`FriendsClient` (always `backHref="/home"`) so back navigation is reliable even when there is no browser history entry (e.g. direct URL load or page refresh).
- **`useSlideBack()`** — hook that returns the `goBack` callback from SlidePage context. Use this **instead of `router.back()`** in all back buttons on slide pages. Falls back to no-op if called outside a SlidePage (safe).
- **Wired in**: `ChatHeader`, `DMHeader`, `ProfileClient`, `FriendsClient` all call `useSlideBack()`. `VaultClient` wraps in SlidePage for the entrance animation but has no explicit back button.
- **Back button tap target**: back buttons must be at least 44px wide (not just 24px for the icon) to be reliably tappable on mobile. Use `style={{ width: 44 }}` or `w-11` on the `<button>` wrapper.
- **Onboarding → chat back navigation**: after any onboarding flow (create crew, join crew, class selection), the final redirect to `/chat/[crewId]` always includes `?welcome=1`. The chat page passes `backHref="/home"` to `SlidePage` when this param is present, so the back button skips the onboarding history and goes directly to home. `WelcomeDetector` strips `?welcome=1` from the URL bar client-side via `window.history.replaceState` without triggering a re-render.
- `html, body` has `overflow-x: hidden` in `globals.css` to prevent a horizontal scrollbar during the off-screen initial position.

### Vault Page — navigation
`VaultClient` has **no** `BottomNav`. Users return via swipe-back / browser back — no nav bar needed.

### Friends Page — `/friends`
- Opened via the `Bookmark` icon from `pixelarticons/react/Bookmark` in the home header
- Page title is **"FRIENDS"** (Press Start 2P 18px)
- Server component fetches accepted friendships + pending (incoming/outgoing) in parallel; resolves profiles for all involved user IDs in one `.in()` query
- `FriendsClient` manages local state for optimistic mutations (send, accept, decline, remove, cancel)
- **Layout**: single scrollable column — no tabs. Sections stack vertically: search input → Requests (collapsible) → Friends
- **Search input**: `h-[48px] border border-border px-4`, `font-body text-[14px]`, placeholder `"Search by @username"`. Shows "Results" section label + result rows while query ≥ 2 chars (debounced 300ms).
- **Requests section**: only rendered when `incoming.length > 0 || outgoing.length > 0`. Collapsible via `requestsOpen` state; chevron (`ChevronRight` 18px from pixelarticons) animates rotate 0°→90° when open. AnimatePresence height transition on body.
  - **Outgoing row**: avatar 40px, name (DM Sans SemiBold 16px primary), `"Sent Friend Request"` (Silkscreen 12px tertiary), CANCEL button: `border border-purple w-[88px] px-4 py-4 font-pixel text-[8px] text-purple`
  - **Incoming row**: avatar 40px, name, `"Wants to be your friend"` subtitle, accept button `border border-[#22c55e] p-3` (`Check` 16px green from pixelarticons) + decline button `border border-[#ef4444] p-3 w-[40px] h-[40px]` (`Close` 12px red from pixelarticons)
- **Friends section**: always rendered. Friend row: 40px avatar, name (DM Sans SemiBold 16px primary), `"est. {year}"` subtitle (Silkscreen 12px tertiary, year from `friendship.created_at`). Tapping the row navigates to `/dm/[friendId]`. Remove button (`UserMinus` 16px from pixelarticons) on right — uses `e.stopPropagation()` so tapping it does not open the DM.
- User + section rows use: `gap-4` between items, `tracking-[0.2px]` on text columns
- Guest guard: `isGuest` prop (`user.is_anonymous === true`); ADD button disabled + Google sign-in banner shown; `sendFriendRequestAction` also blocks anonymous users server-side
- **No BottomNav** — users go back via `useSlideBack()` (SlidePage context)
- Header: `pb-2`, `paddingTop: max(env(safe-area-inset-top), 8px)`, back icon (`ChevronLeft` from pixelarticons, 24px, `color: var(--color-tertiary)`) + title `gap-2`

### Member Profile Page — `/chat/[crewId]/member/[userId]`
- Route: `src/app/(app)/chat/[crewId]/member/[userId]/page.tsx` + `MemberProfileClient.tsx`
- Opened by tapping any avatar or username in `MessageBubble` — `onAvatarTap` callback passed from `MessageList` navigates to this route (works for own messages too)
- **Security**: viewer must be a member of the crew; target must also be a crew member — both checked before any data is returned; non-members redirect to `/chat/{crewId}` or `/home`
- **Data** (single parallel fetch): profile (username, avatar_url, birthday), target's crew-specific class, `get_member_crew_stats` RPC (msg count + total XP in one call), friendship status between viewer and target, `inviterUsername` (service client query on `app_invites` where `used_by = userId` — service role needed because invitee cannot read their own row under RLS)
- **Displays**: animated PixelSprite (scale=4), 64×64 avatar, username, class label, `RECRUITED BY [NAME]` (Silkscreen 8px `rgba(255,255,255,0.4)`, only when present), message count, XP earned in crew, birthday (month + day, e.g. "JAN 15"), friend action button
- **Friend states**: ADD COMPANION (none) → REQUEST SENT (pending_sent) → ACCEPT (pending_received) → COMPANIONS ✓ (accepted); guests see disabled button + sign-in hint
- `isSelf` guard: shows "YOU" badge and hides friend button when viewing own profile
- SlidePage wrapper for slide-in/out; `useSlideBack()` for back button

### DM Page — `/dm/[friendId]`
- Route: `src/app/(app)/dm/[friendId]/page.tsx`
- Server component: verifies accepted friendship, calls `get_or_create_dm(friendId)` RPC to get/create the DM crew, then renders the full chat UI
- Security: friendship check runs before the RPC — unauthenticated or non-friend access redirects to `/home`
- `get_or_create_dm` is idempotent — safe to call on every page load; returns the existing crew id if one already exists
- **Header**: `DMHeader` component (`src/components/chat/DMHeader.tsx`) — shows `ChevronLeft` from pixelarticons back button (24px, `var(--color-tertiary)`), friend 32×32px avatar, friend username (Press Start 2P 14px, `underline`), `"1:1 CHAT"` label (Silkscreen 8px muted). Boss countdown bar renders below if a raid is active and `nexus_dev_mode` is on (same style as ChatHeader).
- **Chat UI**: reuses `MessageList` + `ChatInput` directly — same realtime, XP, boss raid, and artifact pipeline as group chats
- `DMHeader` updates `crew_members.last_seen` every 60s (same as `ChatHeader`) for unread cursor accuracy
- No class selection redirect — DM crew members are auto-assigned `berserker` at channel creation
- No invite button, no vault link, no notification settings in the DM header (simplified)

### PWA / Push Architecture
- **Service worker**: `public/sw-push.js` — handwritten, zero dependencies, committed to git
  - next-pwa's generated `sw.js` uses multi-arg `importScripts()` which silently kills installation on iOS Safari
  - `sw-push.js` handles only `push` + `notificationclick` events; no workbox precaching
  - Registered by `SWRegister` component (root layout) and `subscribeToPush()` in notifications.ts
  - On push receive, posts `{type:'nexus-push-received', ts}` to all open clients — ProfileClient DevSection listens for this to confirm the SW handler fired
  - Uses bare `navigator.setAppBadge` (not `self.navigator`) and strips `badge` option from `showNotification` (iOS doesn't support it; can cause silent rejection)
  - Fallback: if full `showNotification` options are rejected, retries with minimal `{body}` only
- **Registration**: `SWRegister` (`src/components/ui/SWRegister.tsx`) — production-only, runs once in root layout
- **Subscription storage**: `push_subscriptions` table (endpoint UNIQUE, crew_id nullable). `subscribeToPush()` does INSERT only — **no delete before insert**. Deleting first creates a zero-row window that races with the debug FAB's auto-check and risks data loss if the insert then fails. `23505` (unique_violation / row already exists) is treated as success.
- **Subscription recovery**: if `INSERT` fails for a non-23505 reason (e.g. stale APNs token that was 410'd and the row deleted, but the browser still holds the old endpoint), `subscribeToPush()` automatically unsubscribes and creates a fresh APNs token. `PushRefresh` (app layout) calls `subscribeToPush()` on every mount so recovery is automatic on next app open.
- **`nexus-push-subscribed` event**: `subscribeToPush()` dispatches this on `window` when it succeeds. `PushDebugFAB` listens and re-runs `checkStatus()` so the dot goes green without a manual REFRESH tap.
- **Badge**: `BadgeClear` component clears app icon badge on focus/visibilitychange; SW sets it on push receive
- **Preferences**: `notification_preferences` table; `send-notification` edge function checks before sending
- **`message_received` notification format**: title = `"Name from Group Name"`, body = content preview or `"sent"` if empty
- **`recruit_arrived` notification**: sent to inviter when a new user joins via their invite code. Title: "Your recruit arrived.", body: "[new_username] just entered the Nexus.", url: `/home`. No preference gate (`null` in `PREF_COLUMN` — always delivered). **Deployed 2026-06-05.**
- `VAPID_SUBJECT` **must** be a `mailto:` URI — bare email breaks iOS APNs
- iOS push only works in standalone PWA mode (iOS 16.4+, added to Home Screen)
- **iOS foreground suppression**: iOS does NOT show push banners when the PWA window is active. Always test push with the PWA completely closed (swiped away from app switcher).
- **iOS notification tag — CRITICAL**: The `tag` passed to `showNotification` must be **unique per notification** (we append `-{timestamp}`). If multiple pushes share the same tag and an earlier one is still unread in the Notification Center, iOS silently replaces it without playing a sound or showing a banner — subsequent messages appear to never arrive. Stacking notifications (unique tags) is the correct behavior for a chat app.
- **iOS push debugging workflow**: (1) Open push debug FAB → tap SUBSCRIBE (VERBOSE) — it logs every step including the exact DB insert error. (2) Check `fn HTTP` status from SEND TEST — **401 means `send-notification` was redeployed without `--no-verify-jwt`** (see deployment rules below). (3) If `expired_deleted`, the APNs endpoint was 410'd; tap FORCE RESUB. (4) Ensure PWA is fully swiped away before testing. (5) "Last push" timestamp in FAB updates even for foreground-suppressed pushes (Cache API written before `showNotification`).
- **Subscription cleanup**: `send-notification` deletes the DB row on 410/404 from APNs. `PushRefresh` on the next app open calls `subscribeToPush()` which detects the missing row, unsubscribes the stale browser endpoint, and creates a fresh APNs token automatically.
- PWA/SW disabled in dev; test push notifications against production Vercel deployment only
- `subscribeToPush()` uses `getSession()` (not `getUser()`) — cookie-only, never fails due to network
- VAPID env vars must be set in **Supabase Edge Function secrets** (separate from Vercel env vars)

### Adding a new notification type — checklist
1. Add the type to `NotificationType` union in `send-notification/index.ts`
2. Add it to `PREF_COLUMN` map (`null` = always deliver, or map to a preferences column)
3. Add a `case` to `buildPayload()` returning `{ title, body, icon, data: { url } }`
4. Call `send-notification` from the trigger point (server action or edge function) using the pattern below
5. **Deploy**: `supabase functions deploy send-notification --project-ref tlveyeisjbythssmocth --no-verify-jwt`
   - The `--no-verify-jwt` flag is **mandatory every time** — omitting it redeploys with JWT verification on, which causes all calls from `award-xp` (no auth header) to return `401 UNAUTHORIZED_NO_AUTH_HEADER` and silently breaks all push notifications for every user.

### Edge function deployment rules
- **`git push` to Vercel does NOT deploy Supabase Edge Functions** — must run manually every time the function code changes.
- **Always use `--no-verify-jwt` for `send-notification`**: `award-xp` calls it via raw `fetch()` with no Authorization header. Without this flag the function returns `401 UNAUTHORIZED_NO_AUTH_HEADER` and no pushes are delivered.
- Deploy command: `supabase functions deploy send-notification --project-ref tlveyeisjbythssmocth --no-verify-jwt`
- Deploy `award-xp` separately (no `--no-verify-jwt` needed — it is called by authenticated clients): `supabase functions deploy award-xp --project-ref tlveyeisjbythssmocth`
- Deploy `react-to-message` (no `--no-verify-jwt` needed — called by authenticated clients with anon key): `supabase functions deploy react-to-message --project-ref tlveyeisjbythssmocth`

### Inter-function call pattern (award-xp → send-notification)
`send-notification` is deployed with `--no-verify-jwt`. Call it via raw `fetch()` with **no Authorization header** — do NOT use `supabase.functions.invoke()` or pass any Bearer token (both return 401):
```ts
const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`
fetch(fnUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({...}) })
```
Server actions (Next.js) calling `send-notification` directly also use this same pattern with no auth header.

- **Batch notifications**: `send-notification` accepts either `user_id: string` (single, backward compat) or `user_ids: string[]` (batch). Batch mode fetches all preferences and subscriptions in two `.in()` queries, then iterates per user. `award-xp` always uses the batch form. Server actions use single `user_id`.

### Reactions System
- **Data model**: `messages.reactions` JSONB column — `{ emoji: [userId, userId, ...] }`. Empty arrays are pruned; the column defaults to `{}`.
- **Quick-pick emojis**: `['🔥', '💧', '⚡', '🌿', '🌑', '🔮']` — map 1:1 to the six element types (fire, water, lightning, nature, shadow, arcane).
- **Trigger**: long-press (500 ms) or right-click a message bubble → opens a Discord-style bottom sheet via `createPortal` on `document.body`. `hasMoved` ref cancels the long press on scroll; backdrop tap closes the sheet.
- **Text selection disabled**: message container and `<p>` text carry `select-none` + `WebkitUserSelect: none`. The outer div's `touchstart` calls `e.preventDefault()` to suppress the iOS native text-selection callout (source of brief emoji flash on long-press). Avatar, username span, and reaction chips each call `e.stopPropagation()` on `touchEnd` to preserve their own tap actions despite the parent `preventDefault`.
- **Sheet layout** (z-[80] sheet, z-[70] backdrop, spring 320/32 slide-up): emoji quick-pick row (6 `QUICK_REACTIONS` + 😊 opens native keyboard), `border-t border-border` divider, Copy Text action row (min-h-[52px]).
- **Native emoji keyboard**: tapping 😊 focuses a hidden `<input>` (off-screen `position: fixed`). On mobile this surfaces the native emoji keyboard. `onInput` reads the first grapheme cluster via `Intl.Segmenter` (fallback: spread), then calls `handleReaction`.
- **Optimistic update + rollback**: store is patched immediately via `updateMessage`; on edge function error the store is reverted to the pre-tap state.
- **Edge function** (`react-to-message`): verifies crew membership, calls `toggle_reaction` RPC, returns `{ reactions, hype_man_heal, heal_amount }`. Called with the anon key from `MessageBubble` — no `--no-verify-jwt` needed.
- **Realtime sync**: the Postgres changes `UPDATE` subscription in `MessageList` patches reactions on updates. Race-condition guard: if the DB update carries `reactions:{}` but local already has reactions (award-xp updates `xp_awarded` before `react-to-message` runs), local reactions are preserved until the react-to-message Postgres UPDATE arrives with the correct state.
- **Reaction chips**: rendered below the bubble, sorted by count descending, zero-count chips hidden. Own active reaction highlighted `bg-[rgba(191,95,255,0.15)] border-[#bf5fff]` (chat purple). Tapping a chip toggles it.
- **Hype Man passive** (`class = 'hype_man'`): when a Hype Man *adds* (not removes) a reaction, `react-to-message` awards 5 XP to the crew (`source = 'reaction_heal'` in `crew_xp_log`). The edge function returns `hype_man_heal: true, heal_amount: 5`; `MessageBubble` shows a `+5 HEAL` float in `#66bb6a` that animates upward from the chip row.
- **`currentUserId` prop**: required on `MessageBubble` — determines active/inactive chip state and builds the toggle payload. Passed from `MessageList.currentUserId`.

### Pixel Sprites
- Component: `src/components/game/PixelSprite.tsx`
- Sprites: `public/sprites/{spriteId}/{direction}.png` — 8 directions: south, south-east, east, north-east, north, north-west, west, south-west
- Each sprite is 24×24px native; rendered with `image-rendering: pixelated` and CSS keyframe bob animation
- `CLASS_TO_SPRITE` map in PixelSprite.tsx links `AvatarClass` → sprite folder; uncomment entries as sprites are added
- Currently available: `necromancer`
- **Do NOT use `next/image` for sprites** — use plain `<img>` with `imageRendering: pixelated`; next/image has iOS PWA rendering quirks for pixel art

## Caching Architecture

### Server (unstable_cache via createServiceClient)
Always use `createServiceClient()` inside cache functions (service role, no cookies) — `createClient()` reads cookies and disables cross-request sharing. Verify auth + membership with cookie-based client **before** calling the cached function.

| Cache | TTL | Tag | Invalidated by |
|---|---|---|---|
| Home profile (username, avatar_url, birthday, coins, created_at) | 60s | `profile:{userId}` | saveBirthdayAction, revalidateProfileAction |
| Home member profiles + counts | 60s | `crew-members:{crewId}` (all crews) | joinCrewAction, leaveCrewAction |
| Home last message preview | 30s | TTL only | TTL only |
| Vault crew (name, created_at) + artifacts | 300s | `vault:{crewId}`, `artifacts:{crewId}` | TTL only |
| Chat member profiles | 60s | `crew-members:{crewId}` | joinCrewAction, leaveCrewAction |
| Profile page (username, avatar_url, avatar_class, is_dev, created_at) | 60s | `profile:{userId}` | revalidateProfileAction |

`/profile` page also fetches `inviterUsername` in the same `Promise.all` (service client, `app_invites` where `used_by = userId`). Displayed as `"Recruited by [name]"` (Silkscreen 8px tertiary) below the group chats · msg stats line. Not cached — it's a one-time fact.

**Never cache:** `crews.total_xp`, `crews.level`, `active_raids`, `crew_members.last_seen`, auth sessions

**Next.js 16:** `revalidateTag(tag, 'max')` — second arg required; single-arg form is deprecated.

### Client
- Message history: `nexus-msgs-{crewId}` in sessionStorage (50 msg cap, stale-while-revalidate)
- Service worker: `sw-push.js` handles push/notificationclick only (no caching routes)

## localStorage Keys
| Key | Value | Purpose |
|---|---|---|
| `nexus_first_message` | timestamp ms | triggers InstallPrompt after 10s |
| `nexus_install_prompted` | `'1'` | never show install prompt again |
| `nexus_crew_created` | `'1'` | triggers NotificationPrompt via WelcomeDetector |
| `nexus_notif_prompted` | timestamp ms | throttles NotificationPrompt to 24h |
| `nexus_notif_state` | `granted\|denied\|pending` | cached permission state |
| `nexus_dev_mode` | `'1'` | enables game event UI (boss bars, XP stats, system messages) — only meaningful when `profiles.is_dev = true` |
| `nexus_push_diag` | `'1'` | shows push diagnostics block in dev section (CHECK / SYNC SUB / SEND TEST) |
| `nexus_infinite_coins` | `'1'` | bypasses coin gate for invite forging; shows `∞` in home header and InviteArsenal; dev-only |
| `nexus_afk_exp` | `'1'` | shows AFK XP accumulated bar + CLAIM button in home ProfileBanner; dev-only feature flag; dispatches `nexus-afk-exp-change` CustomEvent |

## Disabled Features (wired for future)
- Voice notes: button removed; `XP_VALUES['voice']` + element type `lightning` still defined server-side
- Image upload: button removed; upload logic, `browser-image-compression`, `chat-images` bucket still exist

## Migrations (supabase/migrations/)
- `20240101000000_initial_schema.sql` — tables, RLS, indexes, seed bosses
- `20240101000001_push_subscriptions.sql` — push_subscriptions table
- `20240101000002_last_seen.sql` — crew_members.last_seen, damage_raid fn, increment_crew_xp fn
- `20240101000003_push_notifications_fix.sql` — crew_id nullable, endpoint UNIQUE, expiry_notif_sent ⚠ apply manually if not present
- `20240101000004_leave_crew_fn.sql` — leave_crew fn
- `20240101000005_avatar_url_and_storage.sql` — profiles.avatar_url, storage bucket
- `20240102000001_notification_preferences.sql` — notification_preferences table
- `20240102000002_username_unique_constraint.sql` — username unique via lower()
- `20240103000001_realtime_and_insert_message.sql` — ⚠ MUST BE APPLIED: enables supabase_realtime publication for messages + active_raids; creates insert_message fn
- `20240103000002_push_subscriptions_update_rls.sql` — UPDATE policy on push_subscriptions (needed for upsert)
- `20240103000003_birthday.sql` — adds `birthday date` column to profiles
- `20240103000004_crew_notification_mutes.sql` — crew_notification_mutes + crew_notification_preferences tables
- `20240103000005_batch_query_rpcs.sql` — `get_unread_counts` + `get_crew_member_msg_counts` RPCs
- `20240103000006_member_crew_stats_rpc.sql` — `get_member_crew_stats` RPC
- `20240103000007_coins.sql` — `profiles.coins`, `coin_log` table, `increment_user_coins` RPC, adds `profiles` to realtime publication
- `20240103000008_signup_bonus_and_retroactive_coins.sql` — updates `handle_new_user` trigger to grant 50-coin signup bonus on account creation; one-time retroactive award for all existing users (50 signup + 1 per message sent); idempotent via `coin_log` source = `'signup_bonus'` guard
- `20240103000009_app_invites.sql` — `app_invites` table + RLS (inviter reads own, inviter inserts own)
- `20240103000011_reserved_users.sql` — `reserved_users` table (invite-only waitlist); RLS: public insert, service-role-only select/update
- `20240103000012_reactions.sql` — `messages.reactions` JSONB column (default `'{}'`) + `toggle_reaction` row-locking Postgres function

### Manual SQL applied directly (no migration file)
```sql
-- profiles.is_dev — dev mode flag
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_dev boolean NOT NULL DEFAULT false;

-- Dev mode access
UPDATE profiles SET is_dev = true WHERE id IN (
  SELECT id FROM auth.users WHERE email IN ('shenraymonds@gmail.com', 'legaspi.riley@gmail.com')
);

-- DM channel support (applied 2026-06-04)
ALTER TABLE crews ADD COLUMN IF NOT EXISTS is_dm boolean NOT NULL DEFAULT false;
ALTER TABLE crews ADD COLUMN IF NOT EXISTS dm_partner_1 uuid REFERENCES auth.users(id);
ALTER TABLE crews ADD COLUMN IF NOT EXISTS dm_partner_2 uuid REFERENCES auth.users(id);

CREATE OR REPLACE FUNCTION get_or_create_dm(other_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid := auth.uid(); v_crew_id uuid; v_p1 uuid; v_p2 uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_user_id = other_user_id THEN RAISE EXCEPTION 'Cannot DM yourself'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM friendships WHERE status = 'accepted'
    AND ((requester_id = v_user_id AND addressee_id = other_user_id)
      OR (requester_id = other_user_id AND addressee_id = v_user_id))
  ) THEN RAISE EXCEPTION 'Not friends'; END IF;
  IF v_user_id < other_user_id THEN v_p1 := v_user_id; v_p2 := other_user_id;
  ELSE v_p1 := other_user_id; v_p2 := v_user_id; END IF;
  SELECT id INTO v_crew_id FROM crews
    WHERE is_dm = true AND dm_partner_1 = v_p1 AND dm_partner_2 = v_p2 LIMIT 1;
  IF v_crew_id IS NOT NULL THEN RETURN v_crew_id; END IF;
  INSERT INTO crews (name, invite_code, is_dm, dm_partner_1, dm_partner_2, level, total_xp)
  VALUES ('dm:'||v_p1::text||':'||v_p2::text,
    'dm'||substr(md5(gen_random_uuid()::text),1,6), true, v_p1, v_p2, 1, 0)
  RETURNING id INTO v_crew_id;
  INSERT INTO crew_members (crew_id, user_id, class)
  VALUES (v_crew_id, v_p1, 'berserker'), (v_crew_id, v_p2, 'berserker')
  ON CONFLICT DO NOTHING;
  RETURN v_crew_id;
END; $$;

-- friendships table (applied 2026-06-04)
create table if not exists friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
alter table friendships enable row level security;
create policy "friendships: users see own"
  on friendships for select using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "friendships: users can send requests"
  on friendships for insert with check (auth.uid() = requester_id);
create policy "friendships: addressee can accept"
  on friendships for update using (auth.uid() = addressee_id) with check (auth.uid() = addressee_id);
create policy "friendships: either party can delete"
  on friendships for delete using (auth.uid() = requester_id or auth.uid() = addressee_id);
```

## Supabase Type System Rules
- All row interfaces **must** extend `Record<string, unknown>` — without it, `Database['public'] extends GenericSchema` evaluates to `never` and every `.from()` / `.rpc()` returns `never`
- All table definitions in `Database` must include `Relationships: []`
- All RPC calls must be declared in `Database.public.Functions` with `Args` + `Returns` before use
- `supabase/` directory must be excluded from `tsconfig.json` — Deno imports + globals incompatible with Next.js compiler
- Property access on `Record<string, unknown>` types resolves to `unknown` — use `as` casts when assigning to narrower types (e.g. `row.last_seen as string | null`)
- Supabase query builder returns `PromiseLike` not `Promise` — do NOT chain `.catch()` / `.finally()`; use `async/await` with try/catch

## Code Rules
- TypeScript strict throughout; server components by default; `'use client'` only when interactivity needed
- All game logic in Supabase Edge Functions; Realtime for all live state
- Mobile-first, 390px (iPhone 14); three font roles — `font-pixel` (Press Start 2P) for game UI/logos/level badges, `font-body` (DM Sans) for names/messages/timestamps, `font-silkscreen` (Silkscreen) for XP stats/labels
- Never hardcode constants; never expose `SUPABASE_SERVICE_ROLE_KEY` client-side
- Always handle loading + error states; add `loading.tsx` alongside every data-fetching `page.tsx`
- **Loading skeleton conventions** — wrap skeleton content in `<DelayedSkeleton>` (`src/components/ui/DelayedSkeleton.tsx`) so it only renders after 300ms; fast loads never flash. Use `bg-border animate-pulse` blocks on `bg-black` (home/chat) background. Structure must mirror the real page layout precisely:
  - `home/loading.tsx`: header (logo + 2 icons) → profile banner (48×48 avatar + text rows + AFK XP bar) → Squads label + 3 crew card rows (40×40 avatar, XP/level row, name+timestamp row, preview row, `pr-2`)
  - `chat/[crewId]/loading.tsx`: header (back + crew name + chevron | 3 right icons) → message rows (avatar shown on group-start, `pl-10` offset on continuations) → input (member avatar row + XP stats/bar + h-12 input box). **No BottomNav.**
  - `dm/[friendId]/loading.tsx`: header (back + 32×32 avatar + username + label) → message rows (all left-aligned, same grouping pattern) → input (2-avatar row + XP stats/bar + h-12 input box)
- Clean up Realtime subscriptions on unmount; use `cancelled` flag in async effects
- RLS on every table from day one
- Server data fetching: `Promise.all` for independent queries; stages — (1) `getSession()` + params, (2) queries needing userId/crewId, (3) queries depending on stage 2
- Logout from `/profile` only — `signOut()` then `router.push('/login')`
- Server actions creating/joining crews must call `revalidatePath('/home')` before redirect
- Edge Function notifications: use a **single batch fetch** to `send-notification` with `user_ids[]` — never loop per member
- `unstable_cache`: always `createServiceClient()` inside the function; verify auth first with cookie client

## Image Rules
- Compress client-side before upload: `browser-image-compression` with `maxSizeMB: 0.5`, `maxWidthOrHeight: 1024`, `useWebWorker: true`, `fileType: 'image/webp'`
- Upload with `cacheControl: '31536000'` for CDN cache hit rate
- Always `next/image` — never raw `<img>`; whitelist hostnames in `next.config.ts` under `images.remotePatterns`
- **Exception**: pixel art sprites in `PixelSprite.tsx` use plain `<img>` with `imageRendering: pixelated` — next/image interferes with pixel-perfect rendering on iOS PWA
- Profile pictures from `profiles.avatar_url` (synced on every Google login); fall back to initials; use `Avatar.tsx` everywhere
- Chat images: `chat-images` bucket, path `{crewId}/{userId}/{timestamp}.webp`

## Design Language

### Color Tokens (Figma variables → CSS custom properties → Tailwind utilities)
Defined in `:root` in `globals.css` and mirrored in the `@theme` block for Tailwind utility generation (e.g. `bg-surface`, `text-muted`, `border-border`).

| Token | CSS var | Value | Tailwind |
|---|---|---|---|
| Paper | `--color-paper` | `#f6f6f6` | `bg-paper`, `text-paper` |
| Primary (text) | `--color-primary` | `#fafafa` | `text-primary` |
| Secondary | `--color-secondary` | `#e4e4e7` | `text-secondary` |
| Tertiary | `--color-tertiary` | `#a1a1aa` | `text-tertiary` |
| Muted | `--color-muted` | `#71717a` | `text-muted` |
| Border | `--color-border` | `#27272a` | `border-border` |
| Surface (cards) | `--color-surface` | `#111111` | `bg-surface` |
| Purple (accent) | `--color-purple` | `#a855f7` | `bg-purple`, `text-purple` |

Chat/game accent colors (used inline, not tokenized):
| Role | Value |
|---|---|
| Background | `#000000` (home), `#0a0612` (chat) |
| Primary accent | `#bf5fff` (chat purple) |
| Secondary accent | `#00e5ff` (cyan) |
| XP / gold | `#ffd700` |
| Danger/boss | `#ff4444` |
| Success/heal | `#66bb6a` |

### Font Roles
| Role | Font | Variable | Use |
|---|---|---|---|
| `font-pixel` | Press Start 2P | `--font-press-start-2p` | Game UI, logos, level badges, buttons |
| `font-body` | DM Sans | `--font-dm-sans` | Names, messages, timestamps |
| `font-silkscreen` | Silkscreen | `--font-silk` (`@theme`: `--font-silkscreen`) | XP stats, labels, secondary game text |

Note: next/font variable for Silkscreen is `--font-silk` (not `--font-silkscreen`) to avoid a circular reference with the `@theme` entry `--font-silkscreen: var(--font-silk)`.

### Icon Library — pixelarticons
- **Package**: `pixelarticons` — pixel art SVG React components on 24×24 grid; no CSS import needed
- **Usage**: `import { ComponentName } from 'pixelarticons/react/ComponentName'` → `<ComponentName style={{ width: N, height: N, color: 'X' }} aria-hidden="true" />`; all icons use `fill: currentColor` so Tailwind `text-*` classes also work
- **Named exports only**: `import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'` — do NOT use default imports
- **Icons in use**:
  | Location | Component | Import path | Size |
  |---|---|---|---|
  | ChatHeader — back button | `ChevronLeft` | `pixelarticons/react/ChevronLeft` | 24×24, `color: var(--color-tertiary)` |
  | ChatHeader — crew dropdown | `ChevronRight` rotated 90° | `pixelarticons/react/ChevronRight` | 24×24, `color: var(--color-primary)` |
  | ChatHeader — notifications | `Bell` / `BellOff` | `pixelarticons/react/Bell`, `BellOff` | 24×24 |
  | ChatHeader — invite | `UserPlus` | `pixelarticons/react/UserPlus` | 24×24 |
  | ChatHeader — vault | `Notebook` | `pixelarticons/react/Notebook` | 24×24 |
  | ChatInput — send | `Send` | `pixelarticons/react/Send` | 16×16 |
  | Home header — friends | `AvatarSquare` | `pixelarticons/react/AvatarSquare` | 24×24 |
  | Home header — add | `PlusBox` | `pixelarticons/react/PlusBox` | 24×24 |
  | Home profile banner — edit | `MagicEdit` | `pixelarticons/react/MagicEdit` | 16×16 |
  | Home header — coin badge | `TokeCircle` | `pixelarticons/react/TokeCircle` | **24×16** (amber pill badge) |
  | InviteArsenal — coins | `Coins` | `pixelarticons/react/Coins` | 16px |
  | Home — crew card leave (swipe-reveal) | `Logout` | `pixelarticons/react/Logout` | 16×16, white |
  | Friends — back chevron | `ChevronLeft` | `pixelarticons/react/ChevronLeft` | 24×24, `color: var(--color-tertiary)` |
  | Friends — search | `Search` | `pixelarticons/react/Search` | 16×16, `color: var(--color-muted)` |
  | Friends — requests chevron | `ChevronRight` | `pixelarticons/react/ChevronRight` | 18×18, animated rotate 0°/90° |
  | Friends — accept request | `Check` | `pixelarticons/react/Check` | 16×16, `color: #22c55e` |
  | Friends — decline request | `Close` | `pixelarticons/react/Close` | 12×12, `color: #ef4444` |
  | Friends — remove friend | `UserMinus` | `pixelarticons/react/UserMinus` | 16×16 |
  | DMHeader — back chevron | `ChevronLeft` | `pixelarticons/react/ChevronLeft` | 24×24, `color: var(--color-tertiary)` |
  | Profile — back chevron | `ChevronLeft` | `pixelarticons/react/ChevronLeft` | 24×24, `color: var(--color-tertiary)` |
- **Do not use lucide-react** for chat or home UI icons — lucide-react is only used for `X` (close) in modals/sheets

Framer Motion for all animations. Scanline overlay on game screens for RotMG feel.
