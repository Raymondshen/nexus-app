# Nexus — Project Context

## What Is Nexus
Group messaging app where the chat is an RPG. Every message earns XP, boss fights drop into chat at XP thresholds, and victories mint artifacts stored in the Memory Vault. Characters are pixel art in RotMG top-down style.

## Tech Stack
- Next.js 16 App Router + TypeScript
- Tailwind CSS, Framer Motion, Zustand
- Supabase: Auth, Postgres, Realtime, Storage, Edge Functions
- next-pwa v5 (generates workbox SW at build time — **do not use for push**; see sw-push.js below)
- Deployed on Vercel

## Remaining Work (Phase 1)
- [ ] Win state + artifact card drop
- [ ] End-to-end audit

## Database Tables
```
profiles       id, username (unique case-insensitive), avatar_class, avatar_url, is_dev, created_at
crews          id, name, invite_code (6 chars unique), level, total_xp, created_at
crew_members   id, crew_id, user_id, class, joined_at, last_seen (unread cursor + presence)
messages       id, crew_id, user_id, content, message_type, element_type, xp_awarded, created_at
crew_xp_log    id, crew_id, user_id, xp_amount, source, created_at
bosses         id, name, type (void|ghost|flood|scheduled), max_hp, weak_element, description
active_raids   id, crew_id, boss_id, current_hp, max_hp, phase, started_at, expires_at, defeated_at, mvp_user_id, expiry_notif_sent
artifacts      id, crew_id, name, rarity (common|rare|epic|legendary), source_boss_id, earned_at, mvp_user_id, asset_type, metadata
push_subscriptions  id, user_id, crew_id (nullable), endpoint (UNIQUE), p256dh, auth, created_at
notification_preferences  user_id (PK), notif_messages, notif_raids, notif_victory, updated_at
```

## Postgres Functions
All are `SECURITY DEFINER`. All declared in `Database.Functions` in `src/types/index.ts`.
- `create_crew(p_name, p_invite_code)` → uuid
- `join_crew(p_invite_code)` → uuid
- `leave_crew(p_crew_id)` → jsonb `{ok|deleted}`
- `insert_message(p_crew_id, p_content, p_message_type)` → messages row (computes element_type server-side)
- `damage_raid(p_raid_id, p_damage, p_user_id)` → `(current_hp, phase, defeated_at)`
- `increment_crew_xp(p_crew_id, p_xp_delta)` → `(new_total_xp, new_level)`
- `is_crew_member(p_crew_id)` → boolean (RLS helper)

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

## Dev Mode
- Controlled by `profiles.is_dev` boolean (default false) — **not hardcoded emails**
- To grant dev mode: `UPDATE profiles SET is_dev = true WHERE id IN (SELECT id FROM auth.users WHERE email = '...')`
- Dev section in `/profile` shows: spawn boss toggle, user ID, push diagnostics

## Routing — Next.js 16 Proxy
- `src/proxy.ts` — exports `proxy()` + `config.matcher`; **DO NOT add `src/middleware.ts`** (Next.js 16 errors if both exist)
- Protected prefixes: `/home`, `/chat`, `/vault`, `/party`, `/profile`, `/onboarding`
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
- Sender: calls `setCrewXP(data.new_total_xp)` then broadcasts `xp_update` on `messages:{crewId}` channel
- Receivers: `receiveXP(earned, newTotal)` action in chatStore sets absolute XP + spawns XP float
- Both paths deduplicate by `sender_id` — sender gets `setCrewXP`, others get `receiveXP`

### Online Presence
- Supabase Presence on `online:{crewId}` channel in ChatHeader
- Initial state seeded from `memberLastSeen` server snapshot; real-time updates via `presenceState()` sync events
- 60s DB `last_seen` update kept for server-side initial state accuracy

### MessageList — stale-while-revalidate
- sessionStorage key `nexus-msgs-{crewId}`: load cached → `setMessages` + `setHistoryLoaded` in same tick → React 18 batches both so skeleton never flashes on cache hit
- Background Supabase fetch merges with any Realtime messages already in store; result saved back (capped 50)
- `setMessages([])` before cache/fetch prevents stale messages from a previous crew bleeding in

### ChatInput — send flow
`insert_message` RPC → `addMessage` (optimistic) → broadcast slim payload on `messages:{crewId}` → `award-xp` edge function (patches `xp_awarded` back + broadcasts `xp_update`) → `attack-boss` edge function (if raid active)

- **Single channel**: `messages:{crewId}` is configured with presence and handles both message broadcasting and typing presence. There is no separate `typing:{crewId}` channel.

### award-xp — query batching + anti-spam
- **Batch 1** (always, parallel): previous message gap + burst window count + crew name/XP — 3 queries in one `Promise.all`
- **Batch 2** (only when not spam-blocked, parallel): today's message count + combo count + daily XP log count — 3 queries in one `Promise.all`
- Anti-spam layers: (1) hard stop if prior message <2000ms ago, (2) hard stop if ≥4 messages in last 30s, (3) multiplier 1.0 / 0.5 / 0.1 at 30 / 60 daily message thresholds
- Spam checks gate XP only — **notifications always fire** regardless. Implemented via `xpBlocked` flag; do NOT use early returns before the notification block.
- Notifications use a **single batch fetch** to `send-notification` per event (one call for all recipients, not a per-member loop). Response includes `notif_count` + `notif_results` logged by ChatInput as `[award-xp] ...`.

### HomeClient — stale preview fix
`router.refresh()` on every home mount forces a background server re-fetch. A `useEffect([initialCrews])` sync effect applies refreshed `initialCrews` prop into `crews` state (useState only runs once on mount).

### PWA / Push Architecture
- **Service worker**: `public/sw-push.js` — handwritten, zero dependencies, committed to git
  - next-pwa's generated `sw.js` uses multi-arg `importScripts()` which silently kills installation on iOS Safari
  - `sw-push.js` handles only `push` + `notificationclick` events; no workbox precaching
  - Registered by `SWRegister` component (root layout) and `subscribeToPush()` in notifications.ts
  - On push receive, posts `{type:'nexus-push-received', ts}` to all open clients — ProfileClient DevSection listens for this to confirm the SW handler fired
  - Uses bare `navigator.setAppBadge` (not `self.navigator`) and strips `badge` option from `showNotification` (iOS doesn't support it; can cause silent rejection)
  - Fallback: if full `showNotification` options are rejected, retries with minimal `{body}` only
- **Registration**: `SWRegister` (`src/components/ui/SWRegister.tsx`) — production-only, runs once in root layout
- **Subscription storage**: `push_subscriptions` table; use delete→insert NOT upsert (unique index may not exist in all envs)
- **Badge**: `BadgeClear` component clears app icon badge on focus/visibilitychange; SW sets it on push receive
- **Preferences**: `notification_preferences` table; `send-notification` edge function checks before sending
- **`message_received` notification format**: title = `"Name from Group Name"`, body = content preview or `"sent"` if empty
- `VAPID_SUBJECT` **must** be a `mailto:` URI — bare email breaks iOS APNs
- iOS push only works in standalone PWA mode (iOS 16.4+, added to Home Screen)
- **iOS foreground suppression**: iOS does NOT show push banners when the PWA window is active. Always test push with the PWA completely closed (swiped away from app switcher).
- PWA/SW disabled in dev; test push notifications against production Vercel deployment only
- `subscribeToPush()` uses `getSession()` (not `getUser()`) — cookie-only, never fails due to network
- VAPID env vars must be set in **Supabase Edge Function secrets** (separate from Vercel env vars)
- **Edge function deployment**: `git push` to Vercel does NOT deploy Supabase Edge Functions. Must run manually: `supabase functions deploy <name> --project-ref tlveyeisjbythssmocth`. Deploy both `award-xp` and `send-notification` after any changes.
- **Inter-function calls — JWT auth**: `send-notification` is deployed with `--no-verify-jwt`. `award-xp` calls it via raw `fetch()` with **no Authorization header** — do NOT use `supabase.functions.invoke()` or pass `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` as Bearer tokens (both return 401 UNAUTHORIZED_INVALID_JWT_FORMAT). Pattern:
  ```ts
  const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`
  fetch(fnUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({...}) })
  ```
- **Batch notifications**: `send-notification` accepts either `user_id: string` (single, backward compat) or `user_ids: string[]` (batch). Batch mode fetches all preferences and subscriptions in two `.in()` queries, then iterates per user. `award-xp` always uses the batch form.

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
| Home member profiles + counts | 60s | `crew-members:{crewId}` (all crews) | joinCrewAction, leaveCrewAction |
| Home last message preview | 30s | TTL only | TTL only |
| Vault crew (name, created_at) + artifacts | 300s | `vault:{crewId}`, `artifacts:{crewId}` | TTL only |
| Chat member profiles | 60s | `crew-members:{crewId}` | joinCrewAction, leaveCrewAction |
| Profile (username, avatar_url) | 60s | `profile:{userId}` | revalidateProfileAction |

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

### Manual SQL applied directly (no migration file)
```sql
-- profiles.is_dev — dev mode flag
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_dev boolean NOT NULL DEFAULT false;

-- push_subscriptions endpoint unique index (from migration 3 if not applied)
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key ON push_subscriptions (endpoint);

-- push_subscriptions crew_id nullable (from migration 3 if not applied)
ALTER TABLE push_subscriptions ALTER COLUMN crew_id DROP NOT NULL;

-- notification_preferences table (migration 20240102000001 — apply if table missing)
create table if not exists notification_preferences (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  notif_messages boolean not null default true,
  notif_raids    boolean not null default true,
  notif_victory  boolean not null default true,
  updated_at     timestamptz not null default now()
);
alter table notification_preferences enable row level security;
create policy "Users manage own notification preferences"
  on notification_preferences for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Dev mode + Riley access
UPDATE profiles SET is_dev = true WHERE id IN (
  SELECT id FROM auth.users WHERE email IN ('shenraymonds@gmail.com', 'legaspi.riley@gmail.com')
);
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
- Mobile-first, 390px (iPhone 14); Press Start 2P for all game UI
- Never hardcode constants; never expose `SUPABASE_SERVICE_ROLE_KEY` client-side
- Always handle loading + error states; add `loading.tsx` alongside every data-fetching `page.tsx`
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
| Token | Value |
|---|---|
| Background | `#0a0612` |
| Primary accent | `#bf5fff` (purple) |
| Secondary accent | `#00e5ff` (cyan) |
| XP | `#ffd700` (gold) |
| Danger/boss | `#ff4444` (red) |
| Success/heal | `#66bb6a` (green) |
| Headings/game UI | Press Start 2P |
| Body/chat | system-ui |

Framer Motion for all animations. Scanline overlay on game screens for RotMG feel.
