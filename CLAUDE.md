# Nexus — Project Context

## What Is Nexus
Nexus is a group messaging app where the group chat is an RPG.
Texting your friends is how you fight. Every message earns XP.
Boss fights drop into the chat and must be defeated collectively.
Winning earns artifacts that live permanently in the Memory Vault.
The longer a crew plays together the richer their shared world becomes.

## Core Concept
- Messaging = combat actions
- Group XP accumulates from chat activity
- Boss fights trigger at XP thresholds or behavior patterns
- Artifacts drop on boss defeat and live in the Memory Vault
- Chat UI visually evolves as the crew levels up
- Characters are pixel art in RotMG top-down style

## Tech Stack
- Next.js 16 App Router
- TypeScript throughout
- Tailwind CSS for styling
- Supabase for Auth, Postgres, Realtime, Storage, Edge Functions
- Framer Motion for animations
- Zustand for client-side game state
- date-fns for time-based game logic
- next-pwa v5 for PWA + service worker
- Deployed on Vercel

## Project Structure
src/
  app/
    (auth)/
      login/page.tsx
      signup/page.tsx
      layout.tsx
    (app)/
      chat/[crewId]/page.tsx
      chat/[crewId]/loading.tsx
      vault/[crewId]/page.tsx
      vault/[crewId]/loading.tsx
      party/[crewId]/page.tsx
      home/page.tsx
      home/HomeClient.tsx
      home/actions.ts
      home/loading.tsx
      profile/page.tsx
      profile/ProfileClient.tsx
      profile/loading.tsx
      onboarding/page.tsx
      onboarding/create/page.tsx
      onboarding/create/actions.ts
      onboarding/join/page.tsx
      onboarding/join/actions.ts
      layout.tsx
    api/
    layout.tsx
    page.tsx
  components/
    ui/
      Button.tsx
      Input.tsx
      Avatar.tsx
      BottomNav.tsx
      GuestBanner.tsx
      InstallPrompt.tsx
      NotificationPrompt.tsx
      PushRefresh.tsx
      WelcomeDetector.tsx
      ErrorBoundary.tsx
    chat/
      MessageList.tsx
      MessageBubble.tsx
      ChatInput.tsx
      ChatHeader.tsx
    game/
      XPBar.tsx
      BossCard.tsx
      ArtifactCard.tsx
      ArtifactDropRenderer.tsx
      BossPhaseAlert.tsx
      DamageFloat.tsx
      LevelUpBanner.tsx
      VaultClient.tsx
    pixel/
      SageMage.tsx
      (other character sprites)
  lib/
    supabase/
      client.ts
      server.ts
    game/
      xp.ts
      boss.ts
      artifacts.ts
    notifications.ts
    sounds.ts
    config.ts
  store/
    gameStore.ts
    chatStore.ts
  types/
    index.ts
  proxy.ts  ← Next.js 16 route proxy (auth guard); replaces middleware.ts
worker/
  index.js  ← service worker push + notificationclick handlers (injected by next-pwa)

## Database Tables
profiles
  - id uuid (references auth.users)
  - username text (unique, case-insensitive)
  - avatar_class text
  - avatar_url text nullable (synced from Google OAuth on every login)
  - created_at timestamp

crews
  - id uuid
  - name text
  - invite_code text (6 chars, unique)
  - level integer default 1
  - total_xp integer default 0
  - created_at timestamp

crew_members
  - id uuid
  - crew_id uuid (references crews)
  - user_id uuid (references profiles)
  - class text
  - joined_at timestamp
  - last_seen timestamp nullable (used as unread cursor + online presence)

messages
  - id uuid
  - crew_id uuid (references crews)
  - user_id uuid (references profiles)
  - content text
  - message_type text (text|voice|image|reaction|system)
  - element_type text (fire|water|lightning|nature|shadow|arcane)
  - xp_awarded integer
  - created_at timestamp

crew_xp_log
  - id uuid
  - crew_id uuid
  - user_id uuid
  - xp_amount integer
  - source text
  - created_at timestamp

bosses
  - id uuid
  - name text
  - type text (void|ghost|flood|scheduled)
  - max_hp integer
  - weak_element text
  - description text

active_raids
  - id uuid
  - crew_id uuid
  - boss_id uuid
  - current_hp integer
  - max_hp integer
  - phase integer default 1
  - started_at timestamp
  - expires_at timestamp
  - defeated_at timestamp nullable
  - mvp_user_id uuid nullable
  - expiry_notif_sent boolean default false

artifacts
  - id uuid
  - crew_id uuid
  - name text
  - rarity text (common|rare|epic|legendary)
  - source_boss_id uuid
  - earned_at timestamp
  - mvp_user_id uuid
  - asset_type text
  - metadata jsonb

push_subscriptions
  - id uuid
  - user_id uuid
  - crew_id uuid nullable
  - endpoint text (UNIQUE)
  - p256dh text
  - auth text
  - created_at timestamp

notification_preferences
  - user_id uuid primary key (references auth.users)
  - notif_messages boolean default true
  - notif_raids boolean default true
  - notif_victory boolean default true
  - updated_at timestamp

## Postgres Functions (supabase/migrations/)
- create_crew(p_name, p_invite_code) → uuid
- join_crew(p_invite_code) → uuid
- insert_message(p_crew_id, p_content, p_message_type) → messages row
  — computes element_type server-side matching client getElementType() logic
- leave_crew(p_crew_id) → jsonb {ok|deleted}
- damage_raid(p_raid_id, p_damage, p_user_id) → (current_hp, phase, defeated_at)
- increment_crew_xp(p_crew_id, p_xp_delta) → (new_total_xp, new_level)
- is_crew_member(p_crew_id) → boolean (helper used in RLS policies)

All functions are SECURITY DEFINER. All are declared in Database.Functions in src/types/index.ts.

## XP Rules
- Text message        = 10 XP
- Voice note          = 25 XP (disabled in UI, wired for future)
- Image / GIF         = 20 XP (disabled in UI, wired for future)
- Reaction            = 5 XP
- Daily Drop response = 50 XP
- First message today = 20 XP bonus
- Reply within 60sec  = 5 XP combo bonus

## Boss Rules
- The Void spawns after crew crosses every 500 XP threshold
- Boss fight window = 48 hours
- Boss has 3 phases (100-60%, 60-30%, 30-0% HP)
- Phase 3 = enrage, crew must hit frequency threshold
- Defeating boss = artifact drops into chat

## Element System
- fire      = short rapid messages (under 20 chars)
- water     = long messages (over 150 chars)
- lightning = voice notes
- nature    = images and GIFs
- shadow    = reactions only
- arcane    = daily drop responses / system messages

## Character Classes
- Berserker   = high attack, spam-based
- Sage        = high arcane, long messages
- Ghost       = assassin, silence-based crit
- Hype Man    = healer, reaction-based
- The Voice   = AoE mage, voice notes
- Meme Lord   = trickster, image-based

## Current Build Phase
PHASE 1 — Prove The Loop
Building in this exact order:
1. ✅ Supabase client setup + TypeScript types
2. ✅ Database schema + RLS policies
3. ✅ Auth screens (Google OAuth + guest mode)
4. ✅ Crew creation and join flow
5. ✅ Group chat with Supabase Realtime
6. ✅ XP system with animated bar
7. ✅ The Void boss spawn + fight UI
8. Win state + artifact card drop
9. ✅ PWA configuration + push notifications (fully wired)
10. End to end audit

## Auth Strategy
- Primary: Google OAuth via Supabase (`signInWithOAuth` → `/auth/callback`)
- Secondary: Guest mode via Supabase anonymous sessions (`signInAnonymously`)
- No email/password auth in this project
- Guest data stored in localStorage (`guest_username`, `guest_data`)
- Guest badge + Save Progress button shown in app header for guests
- Save Progress triggers Google OAuth; guest session is abandoned on upgrade
- Enable anonymous sign-ins: Supabase Dashboard → Authentication → Settings

## Routing — Next.js 16 Proxy Convention
Next.js 16 uses `proxy.ts` instead of `middleware.ts` for route interception.
- File: `src/proxy.ts` — exports `proxy()` function + `config.matcher`
- Auth guard: unauthenticated requests to protected routes redirect to /login
- Protected prefixes: /home, /chat, /vault, /party, /profile, /onboarding
- Build command in vercel.json: `next build --webpack` (next-pwa requires webpack;
  Turbopack breaks it and generates an internal proxy.ts that conflicts with ours)
- DO NOT add a `src/middleware.ts` — Next.js 16 errors if both exist

## Completed Work

### Auth Flow (src/app/(auth)/ + src/app/auth/)
- Root layout: Press Start 2P font, #0a0612 background, Nexus metadata
- Auth layout: scanline overlay, purple ambient glow, floating pixel particles, Nexus logo, purple-bordered card
- Login page: Google OAuth button + guest username form, no email/password
- src/lib/supabase/auth.ts: signInWithGoogle, signInAsGuest, signOut, getUser, isGuest
- src/app/auth/callback/route.ts: exchanges OAuth code, redirects to /home
- src/app/(app)/layout.tsx: auth guard + GuestBanner + InstallPrompt + NotificationPrompt + PushRefresh
- src/components/ui/GuestBanner.tsx: shows GUEST badge + Save Progress + LOG OUT for anonymous users
- src/types/index.ts: GuestUser + MessageWithProfile types added
- src/components/ui/Button.tsx: primary/secondary/danger variants, pixel drop-shadow, loading dots
- src/components/ui/Input.tsx: dark bg, purple focus ring, label + error, font-sans on input
- tsconfig paths updated: @/* → ./src/*

### Chat + XP (src/app/(app)/chat/ + src/components/chat/ + supabase/functions/)

#### Chat page (src/app/(app)/chat/[crewId]/page.tsx)
Server component; 2-stage parallel fetch:
- Stage 1: getSession() + params (cookie-only, instant)
- Stage 2: crew_members (user_id + last_seen + profiles join), crews, active_raids — all parallel
- Messages are NOT fetched server-side; MessageList fetches its own history client-side
- Page renders header + input + nav immediately; message history appears once client fetch resolves
- Membership check via RLS on crew_members; redirects to /home if not a member
- Accepts ?welcome=1 to trigger WelcomeDetector

#### Chat loading (src/app/(app)/chat/[crewId]/loading.tsx)
Pulsing skeleton matching the full chat layout (header + messages + input + bottom nav placeholder).
Shown instantly on navigation before server render completes.

#### MessageList (src/components/chat/MessageList.tsx)
- Fetches own message history client-side on mount (async IIFE, crewId dependency)
  — descending order + limit 50 + reverse = newest 50 in chronological order
  — merges with any messages already in store (Realtime events that arrived during fetch)
  — shows inline skeleton while loading; campfire empty state when genuinely no messages
  — cancelled flag prevents stale state on rapid navigation
- Realtime: single channel `messages:{crewId}` subscribing to both:
  1. Broadcast `new_message` events (instant delivery from sender)
  2. Postgres Changes INSERT (backup path for missed broadcasts / reconnects)
- Both handlers validate `msg.content` is a string before calling addMessage (prevents TypeError crash)
- addMessage in chatStore deduplicates by id (no doubles from dual delivery path)
- Auto-scroll only when user is within 120px of bottom
- Display items: date dividers, BossCard (system BOSS_SPAWN:uuid), ArtifactDropRenderer (ARTIFACT_DROP:uuid), LevelUpBanner (LEVEL_UP:n), MessageBubble
- Guards against malformed messages: skips any row where content is not a string

#### ChatInput (src/components/chat/ChatInput.tsx)
- textarea (Enter to send, Shift+Enter newline); fontSize 16px prevents iOS auto-zoom
- Send flow: insert_message RPC → addMessage (optimistic) → broadcast on `messages:{crewId}` → award-xp edge function → attack-boss edge function (if raid active)
- Maintains a dedicated broadcast channel ref (`msgChannelRef`) that joins `messages:{crewId}` on mount
- Broadcast sends the full MessageWithProfile so receivers have sender name without a profile lookup
- Typing presence on separate channel `typing:{crewId}` (Supabase Presence); indicator shown during active raid only
- Rate limit: 30 messages / 60s (client-side guard)
- ⚔ SPAWN BOSS dev button visible when no active raid
- Voice and image upload buttons DISABLED (wired for future)

#### ChatHeader (src/components/chat/ChatHeader.tsx)
Crew name, LVL badge, member avatars with online dots (last_seen < 5min), animated XP bar,
boss HP bar when raid active, share/invite modal, +XP float animation, user avatar → /profile.
Updates crew_members.last_seen every 60s (online presence).

#### Realtime delivery architecture
- Sender path: insert DB → broadcast to `messages:{crewId}` channel → instant display for all connected clients
- Receiver path (MessageList): Broadcast listener fires first (~50ms), Postgres Changes fires as backup
- Postgres Changes requires `messages` and `active_raids` to be in the `supabase_realtime` publication
  → see migration 20240103000001_realtime_and_insert_message.sql
- addMessage deduplication handles both paths firing for the same message

#### Zustand store (src/store/chatStore.ts)
messages, crewXP, crewLevel, xpFloats, activeRaid, damageFloats.
addMessage deduplicates by id. setMessages replaces array (called by MessageList on history load).

#### XP lib (src/lib/game/xp.ts)
XP_VALUES, calculateXP, getElementType, getLevelFromXP, getXPProgress constants + helpers.
element_type logic is mirrored server-side in insert_message Postgres function and award-xp edge function.

#### Edge functions
- supabase/functions/award-xp/index.ts: calculates base XP + first-today + combo bonuses, updates crews.total_xp + messages.xp_awarded + messages.element_type, spawns The Void at 500 XP threshold, sends message_received push to other crew members. All notification fetches are awaited with Promise.allSettled (not fire-and-forget) so Deno runtime doesn't terminate before pushes complete.
- supabase/functions/attack-boss/index.ts: atomic HP decrement via damage_raid RPC; on defeat fires boss_defeated push for all crew members
- supabase/functions/check-raid-expiry/index.ts: cron-triggered; finds raids expiring within 2h, fires raid_expiring push, marks expiry_notif_sent
- src/app/api/test/spawn-boss/route.ts: POST endpoint — verifies crew membership, creates active_raids row + BOSS_SPAWN system message using service role key

### PWA + Notifications (fully wired)
- public/manifest.json: name, icons, shortcuts (chat + vault), theme #0a0612, standalone portrait
- public/icons/icon-192.png + icon-512.png: pixel N on dark bg, gold sword
- public/offline.html: zero-dependency standalone page, 30s auto-retry
- next.config.ts: next-pwa enabled in production only; CacheFirst static assets (30d), NetworkFirst API/Supabase/pages (10s timeout), offline fallback /offline.html, auth routes excluded from SW
- worker/index.js: custom service worker — handles `push` event (showNotification) and `notificationclick` (focus or open tab at data.url). Must exist; without it push messages are received but silently discarded.
- src/lib/notifications.ts:
  - isSupported(): checks Notification + serviceWorker + PushManager + VAPID key
  - subscribeToPush(): calls getSubscription() first (safer on iOS than always calling subscribe()); retries once after 1.5s if first attempt fails; validates upsert to push_subscriptions; returns null on failure
  - requestPermission(), getPermissionState(), savePermissionState()
- src/components/ui/PushRefresh.tsx: null-render client component — re-runs subscribeToPush() on every app load when permission is granted, keeping the DB row live after silent invalidation
- src/components/ui/InstallPrompt.tsx: iOS Safari step-by-step + Android Chrome native prompt; shows 10s after first message, once per device
- src/components/ui/NotificationPrompt.tsx: bottom sheet on crew creation; throttled 24h; states: visible → granted (auto-dismiss) / denied (settings instructions) / sub_failed (subscription failed after OS permission granted — shows retry prompt with Home Screen hint)
- src/app/(app)/profile/ProfileClient.tsx notifications section: ENABLE button checks subscribeToPush() return value; shows inline error + RETRY label if subscription fails
- supabase/functions/send-notification/index.ts: web-push via npm:web-push; TTL: 86400; supports types: message_received, boss_spawned, boss_defeated, raid_expiring, crew_silent; checks notification_preferences before sending; deletes 410/404 expired endpoints
- VAPID env vars: NEXT_PUBLIC_VAPID_PUBLIC_KEY (client), VAPID_PRIVATE_KEY + VAPID_SUBJECT (Edge Function secrets only)
  — VAPID_SUBJECT MUST be a mailto: URI (e.g. mailto:you@example.com); bare email breaks iOS APNs
- iOS push: only works in standalone PWA mode (iOS 16.4+, added to Home Screen)
- Dev mode: PWA/SW disabled in dev; push notifications can only be tested against a production Vercel deployment

### Home Screen (src/app/(app)/home/)
- src/app/(app)/home/page.tsx: server component; parallel queries — profiles + crew_members together, then all crew/message/unread queries together; unread count queries use head:true (zero body egress)
- src/app/(app)/home/HomeClient.tsx: SwipeableCrewCard — swipe right-to-left (88px) reveals LEAVE button; single openCardId ensures only one card open; tap open card closes it; LeaveConfirmSheet (last member → DELETE CREW); per-crew Realtime message preview subscriptions; Create Crew bottom sheet (calls createCrewAction server action)
- src/app/(app)/home/actions.ts: leaveCrewAction — if last member deletes crew (CASCADE), else redistributes MVP artifacts then deletes crew_members row; revalidates /home
- src/app/(app)/onboarding/create/actions.ts: createCrewAction — calls create_crew RPC, redirects to /chat/{id}?welcome=1; calls revalidatePath('/home') before redirect so the new crew row appears on back-navigation
- src/app/(app)/onboarding/join/actions.ts: joinCrewAction — calls join_crew RPC; calls revalidatePath('/home') before redirect
- src/app/(app)/home/loading.tsx: pulsing skeleton shown instantly on navigation
- Unread count cursor: crew_members.last_seen; ChatHeader updates it every 60s; HomeClient updates immediately on crew tap
- Post-login flow: auth/callback → /home

### Profile Page (src/app/(app)/profile/)
- src/app/(app)/profile/page.tsx: server component — fetches auth + profile (username, avatar_url, isDev flag)
- src/app/(app)/profile/ProfileClient.tsx: client component with:
  - Avatar display (Google photo or initials, 80px)
  - Username input with inline SAVE button; case-insensitive uniqueness pre-check before DB write; error states: success / taken / error
  - Notifications section: ENABLE button → requestPermission() → subscribeToPush(); shows sub_failed error + RETRY if subscription fails; when granted shows 3 toggle switches (Messages / Raid Alerts / Victory) — prefs upserted on each change
  - LOG OUT button → signOut() → router.push('/login')
  - Back navigation via router.back()
  - Dev section (shenraymonds@gmail.com only): userId copy, email copy, reset localStorage flags
- src/app/(app)/profile/loading.tsx: pulsing skeleton
- Logout handled exclusively from profile page

### Vault
- src/app/(app)/vault/[crewId]/page.tsx: parallel queries (auth+params → membership/crew/artifacts simultaneously)
- src/app/(app)/vault/[crewId]/loading.tsx: pulsing skeleton shown instantly on tab tap
- src/components/game/VaultClient.tsx: grid + timeline view toggle; filter tabs (ALL/RELICS/GEAR/LEGENDARY); artifact detail modal with share-as-image (html-to-image); BottomNav included

### ErrorBoundary (src/components/ui/ErrorBoundary.tsx)
Class component wrapping client components where render errors are possible.
RELOAD button calls window.location.reload() — setState reset was unreliable for server component stream errors and has been removed.

## Migrations (supabase/migrations/) — run in Supabase SQL editor
- 20240101000000_initial_schema.sql: tables, RLS, indexes, seed bosses
- 20240101000001_push_subscriptions.sql: push_subscriptions table
- 20240101000002_last_seen.sql: crew_members.last_seen, damage_raid fn, increment_crew_xp fn
- 20240101000003_push_notifications_fix.sql: crew_id nullable, endpoint UNIQUE, expiry_notif_sent
- 20240101000004_leave_crew_fn.sql: leave_crew fn
- 20240101000005_avatar_url_and_storage.sql: profiles.avatar_url, storage bucket
- 20240102000001_notification_preferences.sql: notification_preferences table
- 20240102000002_username_unique_constraint.sql: username unique (case-insensitive via lower())
- 20240103000001_realtime_and_insert_message.sql: ⚠ MUST BE APPLIED — enables supabase_realtime publication for messages and active_raids tables; creates insert_message Postgres function

## Disabled Features (wired for future)
- Voice notes: ChatInput voice button removed; XP_VALUES['voice'] = 25 still defined; element type 'lightning' still assigned server-side
- Image upload: ChatInput attach button removed; upload logic, browser-image-compression, chat-images bucket all still exist and work; element type 'nature' still assigned server-side

## localStorage Keys
- nexus_first_message: timestamp (ms) of user's first sent message — triggers InstallPrompt after 10s
- nexus_install_prompted: '1' — set after install prompt dismissed or accepted, never shows again
- nexus_crew_created: '1' — set by WelcomeDetector when ?welcome=1 detected — triggers NotificationPrompt
- nexus_notif_prompted: timestamp (ms) — throttles NotificationPrompt to once per 24h
- nexus_notif_state: 'granted' | 'denied' | 'pending' — cached permission state

## Supabase Type System Rules
- All row interfaces MUST extend `Record<string, unknown>` (e.g. `interface Profile extends Record<string, unknown>`)
  — Without this, `Database['public'] extends GenericSchema` evaluates to `never` inside the Supabase client's
    conditional type machinery, causing every `.from()` query and `.rpc()` call to return `never`.
- All table definitions in `Database` MUST include `Relationships: []` (required by `GenericTable` shape).
- All Supabase RPC functions used in the app MUST be declared in `Database.Functions` with `Args` and `Returns`.
- The `supabase/` directory MUST be excluded from `tsconfig.json` — Deno Edge Functions use `https://esm.sh/`
  imports and the `Deno` global which are incompatible with the Next.js TypeScript compiler.
- When adding a new `.rpc('fn_name', ...)` call, add `fn_name` to `Database.public.Functions` first.
- Property access on types extending `Record<string, unknown>` resolves through the index signature (`unknown`), not the explicit property type. Use `as` casts when assigning to a narrower type (e.g. `row.last_seen as string | null`).
- Supabase query builder returns `PromiseLike`, not a full `Promise` — do NOT chain `.catch()` or `.finally()` directly. Use `async/await` with try/catch/finally instead.

## Code Rules
- Always use TypeScript with strict types
- Server components by default
- Use client components only when interactivity is needed
- Mark client components with 'use client' at top
- All game logic runs server-side in Supabase Edge Functions
- Supabase Realtime for all live state updates
- Mobile-first, optimized for 390px width (iPhone 14)
- Press Start 2P font for all game UI elements
- Never hardcode values that belong in constants
- Never expose SUPABASE_SERVICE_ROLE_KEY to the client
- Always handle loading and error states
- Clean up Realtime subscriptions on component unmount; use a cancelled flag in async effects to prevent stale state updates
- RLS must be enabled on every table from day one
- Server component data fetching: always use Promise.all for independent queries; structure in stages: (1) auth.getSession() + params together, (2) all queries that only need userId/crewId together, (3) queries that depend on stage-2 results. Never await sequentially when queries are independent.
- Add loading.tsx alongside every page.tsx that does server-side data fetching — shows instantly on navigation before server render completes
- Logout: handled from /profile page only — ProfileClient calls signOut() then router.push('/login')
- Server actions that create or join crews MUST call revalidatePath('/home') before redirect so the new crew row appears immediately on back-navigation
- Edge Function notification fetches: always use Promise.allSettled() — fire-and-forget fetches may be terminated by the Deno runtime before completion

## Image Rules
- All user-uploaded images MUST be compressed client-side with `browser-image-compression` before upload: `maxSizeMB: 0.5`, `maxWidthOrHeight: 1024`, `useWebWorker: true`, `fileType: 'image/webp'`
- Upload to Supabase Storage with `cacheControl: '31536000'` (1-year header) to maximise CDN cache hit rate
- All images displayed in the app MUST use `next/image` — never a raw `<img>` tag — so Vercel's image CDN handles resizing and caching
- Remote image hostnames must be whitelisted in `next.config.ts` under `images.remotePatterns` before use
- Profile pictures come from `profiles.avatar_url` (synced from Google OAuth metadata on every login); fall back to a styled initials box — never fetch the OAuth URL directly from the client
- The `src/components/ui/Avatar.tsx` component handles the image-vs-initials decision; use it for all avatar display points
- Chat images are stored in the `chat-images` Supabase Storage bucket (public, 5 MB limit, images only); path format: `{crewId}/{userId}/{timestamp}.webp`
- Artifact images and any future game assets follow the same compress → upload → serve-via-next/image pipeline

## Design Language
- Dark theme throughout — background #0a0612
- Pixel aesthetic — chunky, high contrast
- Primary accent — purple #bf5fff
- Secondary accent — cyan #00e5ff
- XP color — gold #ffd700
- Danger/boss — red #ff4444
- Success/heal — green #66bb6a
- Font stack — Press Start 2P for headings/game UI, system-ui for body text and chat messages
- Framer Motion for all animations
- Scanline overlay on game screens for RotMG feel
