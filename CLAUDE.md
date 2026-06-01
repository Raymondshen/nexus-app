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
- Next.js 14 App Router
- TypeScript throughout
- Tailwind CSS for styling
- Supabase for Auth, Postgres, Realtime, Storage, Edge Functions
- Framer Motion for animations
- Zustand for client-side game state
- date-fns for time-based game logic
- next-pwa for PWA configuration
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
      vault/[crewId]/page.tsx
      party/[crewId]/page.tsx
      onboarding/page.tsx
      onboarding/create/page.tsx
      onboarding/join/page.tsx
      layout.tsx
    api/
    layout.tsx
    page.tsx
  components/
    ui/
      Button.tsx
      Input.tsx
      Modal.tsx
    chat/
      MessageList.tsx
      MessageBubble.tsx
      ChatInput.tsx
      ChatHeader.tsx
    game/
      XPBar.tsx
      BossCard.tsx
      ArtifactCard.tsx
      BossPhaseAlert.tsx
    pixel/
      SageMage.tsx
      (other character sprites)
  lib/
    supabase/
      client.ts
      server.ts
      middleware.ts
    game/
      xp.ts
      boss.ts
      artifacts.ts
    utils/
      index.ts
  store/
    gameStore.ts
    chatStore.ts
  types/
    index.ts

## Database Tables
profiles
  - id uuid (references auth.users)
  - username text
  - avatar_class text
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

## XP Rules
- Text message        = 10 XP
- Voice note          = 25 XP
- Image / GIF         = 20 XP
- Reaction            = 5 XP
- Daily Drop response = 50 XP
- First message today = 20 XP bonus
- Reply within 60sec  = 5 XP combo bonus

## Boss Rules
- The Void spawns after 24hrs of crew silence
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
- arcane    = daily drop responses

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
2. Database schema + RLS policies
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

## Completed Work
### Auth Flow (src/app/(auth)/ + src/app/auth/)
- Root layout: Press Start 2P font, #0a0612 background, Nexus metadata
- Auth layout: scanline overlay, purple ambient glow, floating pixel particles, Nexus logo, purple-bordered card
- Login page: Google OAuth button + guest username form, no email/password
- src/lib/supabase/auth.ts: signInWithGoogle, signInAsGuest, signOut, getUser, isGuest
- src/app/auth/callback/route.ts: exchanges OAuth code, redirects to /home
- src/app/(app)/layout.tsx: auth guard + GuestBanner client component
- src/components/ui/GuestBanner.tsx: shows GUEST badge + Save Progress + LOG OUT for anonymous users
- src/types/index.ts: GuestUser + MessageWithProfile types added
- src/components/ui/Button.tsx: primary/secondary/danger variants, pixel drop-shadow, loading dots
- src/components/ui/Input.tsx: dark bg, purple focus ring, label + error, font-sans on input
- tsconfig paths updated: @/* → ./src/*
- App router moved to src/app/ (root app/ removed)

### Chat + XP (src/app/(app)/chat/ + src/components/chat/ + supabase/functions/)
- src/app/(app)/chat/[crewId]/page.tsx: server component; parallel queries in 3 stages (auth+params → crew/members/messages/raid → profiles); single crew_members query serves both membership check and member list; accepts ?welcome=1 to trigger WelcomeDetector
- src/app/(app)/chat/[crewId]/loading.tsx: pulsing skeleton shown instantly on tab tap (header + message bubbles + input + bottom nav)
- src/components/chat/ChatHeader.tsx: crew name, LVL badge, member avatars, animated XP bar, boss HP bar, +XP float animations, user initial button → logout bottom sheet
- src/components/chat/MessageList.tsx: Realtime subscription on messages table, auto-scroll, date dividers, message grouping by sender
- src/components/chat/MessageBubble.tsx: sent/received layout, element dots, system message variants (boss/xp/artifact), tap-to-react
- src/components/chat/ChatInput.tsx: textarea (Enter to send, Shift+Enter newline), send/attach/mic buttons, calls award-xp edge function; ⚔ SPAWN BOSS dev button (visible when no active raid); sets nexus_first_message localStorage key on first send; fontSize 16px to prevent iOS auto-zoom; spawn-boss error handling: parses non-JSON responses as `Server error ${status}`, shows actual server error message instead of generic "Network error"
- src/store/chatStore.ts: Zustand — messages, crewXP, crewLevel, xpFloats, activeRaid
- src/lib/game/xp.ts: XP_VALUES, calculateXP, getElementType, getLevelFromXP, getXPProgress constants + helpers
- supabase/functions/award-xp/index.ts: calculates base XP + first-today + combo bonuses, updates crews.total_xp, spawns The Void at 500 XP threshold
- src/app/api/test/spawn-boss/route.ts: POST endpoint — verifies crew membership, creates active_raids row + BOSS_SPAWN system message using service role key; entire handler wrapped in try/catch so unhandled throws return JSON `{ error }` instead of HTML 500; auth error logged to server console

### PWA + Notifications (fully wired)
- public/manifest.json: name, icons, shortcuts (chat + vault), theme #0a0612, standalone portrait
- public/icons/icon-192.png + icon-512.png: pixel N on dark bg, gold sword — generated via scripts/generate-icons.mjs (@napi-rs/canvas)
- public/offline.html: zero-dependency standalone page, pixel N div logo, 30s auto-retry, redirects on navigator online event
- next.config.ts: next-pwa enabled in production only; CacheFirst static assets (30d), NetworkFirst API/Supabase/pages (10s timeout), offline fallback /offline.html, auth routes excluded from SW
- src/lib/notifications.ts: isSupported (checks NEXT_PUBLIC_VAPID_PUBLIC_KEY), requestPermission, subscribeToPush (gets SW registration, calls pushManager.subscribe, saves endpoint/p256dh/auth to push_subscriptions via upsert on endpoint), getPermissionState, savePermissionState
- src/components/ui/InstallPrompt.tsx: iOS Safari step-by-step + Android Chrome native prompt; shows 10s after nexus_first_message set, once per device (nexus_install_prompted key)
- src/components/ui/NotificationPrompt.tsx: RAID ALERTS sheet; calls subscribeToPush() after permission granted; shows after nexus_crew_created set, throttled 24h (nexus_notif_prompted key); 3 states: visible → granted (auto-dismiss) / denied (settings instructions)
- src/components/ui/WelcomeDetector.tsx: client component that sets nexus_crew_created in localStorage when ?welcome=1 param detected, then strips param from URL
- supabase/migrations/20240101000001_push_subscriptions.sql: push_subscriptions table (user_id, crew_id nullable, endpoint, p256dh, auth) with RLS (select/insert/delete own rows)
- supabase/migrations/20240101000003_push_notifications_fix.sql: makes crew_id nullable on push_subscriptions, adds UNIQUE index on endpoint, adds expiry_notif_sent to active_raids
- supabase/functions/send-notification/index.ts: real web-push via npm:web-push — sets VAPID details from env, sends to all user subscriptions, deletes 410/404 expired endpoints
- supabase/functions/award-xp/index.ts: on boss spawn, queries crew_members and fires send-notification (boss_spawned) for each member
- supabase/functions/attack-boss/index.ts: on boss defeat, queries crew_members and fires send-notification (boss_defeated) for each member
- supabase/functions/check-raid-expiry/index.ts: cron-triggered function; finds raids expiring within 2 hours where expiry_notif_sent=false, marks them sent, fires send-notification (raid_expiring) for all crew members
- src/app/layout.tsx: Viewport export with viewportFit=cover, themeColor #0a0612; appleWebApp capable + black status bar; apple-touch-icon + manifest link
- src/app/(app)/layout.tsx: renders InstallPrompt + NotificationPrompt alongside existing auth guard
- Crew creation (onboarding/create/actions.ts): redirects to /chat/${crewId}?welcome=1 so WelcomeDetector fires on first load
- VAPID env vars: NEXT_PUBLIC_VAPID_PUBLIC_KEY (client), VAPID_PRIVATE_KEY + VAPID_SUBJECT (Edge Function secrets only)

### Home Screen (src/app/(app)/home/)
- src/app/(app)/home/page.tsx: server component; fetches user's crews with last message preview + unread counts (messages after last_seen from other users) + profile cache for realtime sender resolution; parallel query stages
- src/app/(app)/home/HomeClient.tsx: crew cards (name, LVL badge, last message preview, unread badge, relative timestamp); per-crew Realtime subscriptions update previews and badges live; sorts by most recent activity; tapping a crew updates last_seen (marks as read) then navigates to /chat/[crewId]; create crew bottom sheet reuses createCrewAction; user initial → logout bottom sheet; FAB + header + button to create; empty state with create/join CTAs
- src/app/(app)/home/loading.tsx: pulsing skeleton shown instantly on navigation
- Unread count uses crew_members.last_seen as read cursor — messages after last_seen from other users = unread; ChatHeader updates last_seen every 60s; HomeClient updates it immediately on crew tap
- Post-login flow: auth/callback → /home; onboarding page redirects existing crew members to /home

### Vault
- src/app/(app)/vault/[crewId]/page.tsx: parallel queries (auth+params → membership/crew/artifacts simultaneously)
- src/app/(app)/vault/[crewId]/loading.tsx: pulsing skeleton shown instantly on tab tap

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
- Clean up Realtime subscriptions on component unmount
- RLS must be enabled on every table from day one
- Server component data fetching: always use Promise.all for independent queries; structure in stages: (1) auth.getUser() + params together, (2) all queries that only need userId/crewId together, (3) queries that depend on stage-2 results. Never await sequentially when queries are independent.
- Add loading.tsx alongside every page.tsx that does server-side data fetching — shows instantly on navigation before server render completes
- Logout: GuestBanner handles guest logout; ChatHeader user-initial button handles auth user logout; HomeClient has its own user-menu logout — all call signOut() from src/lib/supabase/auth then router.push('/login')

## Design Language
- Dark theme throughout — background #0a0612
- Pixel aesthetic — chunky, high contrast
- Primary accent — purple #bf5fff
- Secondary accent — cyan #00e5ff
- XP color — gold #ffd700
- Danger/boss — red #ff4444
- Success/heal — green #66bb6a
- Font stack — Press Start 2P for headings/game UI,
  system-ui for body text and chat messages
- Framer Motion for all animations
- Scanline overlay on game screens for RotMG feel