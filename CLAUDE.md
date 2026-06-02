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
      vault/[crewId]/page.tsx
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
      onboarding/join/page.tsx
      layout.tsx
    api/
    layout.tsx
    page.tsx
  components/
    ui/
      Button.tsx
      Input.tsx
      Avatar.tsx
      GuestBanner.tsx
      InstallPrompt.tsx
      NotificationPrompt.tsx
      PushRefresh.tsx
      WelcomeDetector.tsx
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
      DamageFloat.tsx
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
    notifications.ts
    sounds.ts
    config.ts
  store/
    gameStore.ts
    chatStore.ts
  types/
    index.ts
worker/
  index.js  ← service worker push + notificationclick handlers (injected by next-pwa)

## Database Tables
profiles
  - id uuid (references auth.users)
  - username text
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
  - last_seen timestamp nullable (used as unread cursor)

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
- src/app/(app)/chat/[crewId]/page.tsx: server component; parallel queries in 3 stages; accepts ?welcome=1 to trigger WelcomeDetector
- src/app/(app)/chat/[crewId]/loading.tsx: pulsing skeleton shown instantly on tab tap
- src/components/chat/ChatHeader.tsx: crew name, LVL badge, member avatars, animated XP bar, boss HP bar; +XP float anchored to the "0/500 XP" label — slides from below and fades out (y:6→y:-16, ease-out, 0.9s); user avatar button navigates to /profile
- src/components/chat/MessageList.tsx: Realtime subscription on messages table, auto-scroll, date dividers, message grouping by sender
- src/components/chat/MessageBubble.tsx: sent/received layout, element dots, system message variants (boss/xp/artifact), tap-to-react
- src/components/chat/ChatInput.tsx: textarea (Enter to send, Shift+Enter newline), send button only — voice and image upload buttons are DISABLED (wired for future); calls award-xp edge function with username included in body; ⚔ SPAWN BOSS dev button (visible when no active raid); fontSize 16px to prevent iOS auto-zoom
- src/store/chatStore.ts: Zustand — messages, crewXP, crewLevel, xpFloats, activeRaid
- src/lib/game/xp.ts: XP_VALUES, calculateXP, getElementType, getLevelFromXP, getXPProgress constants + helpers
- supabase/functions/award-xp/index.ts: calculates base XP + first-today + combo bonuses, updates crews.total_xp, spawns The Void at 500 XP threshold, fires message_received notifications to all other crew members (skips reactions)
- src/app/api/test/spawn-boss/route.ts: POST endpoint — verifies crew membership, creates active_raids row + BOSS_SPAWN system message using service role key

### PWA + Notifications (fully wired)
- public/manifest.json: name, icons, shortcuts (chat + vault), theme #0a0612, standalone portrait
- public/icons/icon-192.png + icon-512.png: pixel N on dark bg, gold sword
- public/offline.html: zero-dependency standalone page, 30s auto-retry
- next.config.ts: next-pwa enabled in production only; CacheFirst static assets (30d), NetworkFirst API/Supabase/pages (10s timeout), offline fallback /offline.html, auth routes excluded from SW
- worker/index.js: custom service worker code injected by next-pwa — handles `push` event (calls showNotification) and `notificationclick` event (focuses existing tab or opens new one at data.url). Without this file push messages are received but never shown.
- src/lib/notifications.ts: isSupported, requestPermission, subscribeToPush (upserts to push_subscriptions on endpoint conflict), getPermissionState, savePermissionState
- src/components/ui/PushRefresh.tsx: null-render client component in app layout — calls subscribeToPush() on every load if permission is granted, keeping the subscription row live after silent invalidation
- src/components/ui/InstallPrompt.tsx: iOS Safari step-by-step + Android Chrome native prompt; shows 10s after first message, once per device
- src/components/ui/NotificationPrompt.tsx: bottom sheet on crew creation; throttled 24h; 3 states: visible → granted (auto-dismiss) / denied (settings instructions)
- src/components/ui/WelcomeDetector.tsx: sets nexus_crew_created in localStorage when ?welcome=1 detected
- supabase/migrations/20240101000001_push_subscriptions.sql: push_subscriptions table with RLS
- supabase/migrations/20240101000003_push_notifications_fix.sql: crew_id nullable, UNIQUE on endpoint, expiry_notif_sent on active_raids
- supabase/migrations/20240102000001_notification_preferences.sql: notification_preferences table with RLS
- supabase/functions/send-notification/index.ts: web-push via npm:web-push; supports types: message_received, boss_spawned, boss_defeated, raid_expiring, crew_silent; checks notification_preferences before sending — if the user's relevant preference is false, skips silently; deletes 410/404 expired endpoints
- supabase/functions/attack-boss/index.ts: on boss defeat, fires send-notification (boss_defeated) for all crew members
- supabase/functions/check-raid-expiry/index.ts: cron-triggered; finds raids expiring within 2h, fires send-notification (raid_expiring), marks expiry_notif_sent
- Notification preference columns: notif_messages (message_received), notif_raids (boss_spawned/raid_expiring/crew_silent), notif_victory (boss_defeated)
- VAPID env vars: NEXT_PUBLIC_VAPID_PUBLIC_KEY (client), VAPID_PRIVATE_KEY + VAPID_SUBJECT (Edge Function secrets only)
- iOS push: only works in standalone PWA mode (iOS 16.4+, added to Home Screen); isSupported() returns false in Safari browser mode — this is correct
- Dev mode: PWA/SW disabled in dev (disable: isDev); push notifications can only be tested against a production Vercel deployment

### Home Screen (src/app/(app)/home/)
- src/app/(app)/home/page.tsx: server component; fetches crews with last message preview + unread counts + memberCount; parallel query stages
- src/app/(app)/home/HomeClient.tsx: SwipeableCrewCard — swipe right-to-left (88px) reveals LEAVE button; single openCardId state in HomeClient ensures only one card is open at a time — starting a drag on any card immediately snaps all others closed; tap open card closes it, tap closed card navigates; LeaveConfirmSheet with context-aware warning (last member → DELETE CREW); per-crew Realtime subscriptions; user avatar button navigates to /profile
- src/app/(app)/home/actions.ts: leaveCrewAction server action — if last member deletes crew (CASCADE), else redistributes MVP artifacts then deletes crew_members row; revalidates /home
- src/app/(app)/home/loading.tsx: pulsing skeleton shown instantly on navigation
- Unread count uses crew_members.last_seen as read cursor; ChatHeader updates it every 60s; HomeClient updates it immediately on crew tap
- Post-login flow: auth/callback → /home

### Profile Page (src/app/(app)/profile/)
- src/app/(app)/profile/page.tsx: server component — fetches auth + profile (username, avatar_url), renders ProfileClient
- src/app/(app)/profile/ProfileClient.tsx: client component with:
  - Avatar display (Google photo or initials, 80px)
  - Username input with inline SAVE button; optimistic update via Supabase client (.from('profiles').update); success/error feedback
  - Notifications section: shows ENABLE button if permission not granted; if granted shows 3 individual sliding toggle switches (Messages, Raid Alerts, Victory) — prefs loaded from notification_preferences on mount, upserted on each toggle change
  - LOG OUT button calls signOut() → /login
  - Back navigation via router.back()
- src/app/(app)/profile/loading.tsx: pulsing skeleton
- Logout is now handled exclusively from the profile page — the old bottom sheets on ChatHeader and HomeClient have been removed

### Vault
- src/app/(app)/vault/[crewId]/page.tsx: parallel queries (auth+params → membership/crew/artifacts simultaneously)
- src/app/(app)/vault/[crewId]/loading.tsx: pulsing skeleton shown instantly on tab tap

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
- Logout: handled from /profile page only — ProfileClient calls signOut() then router.push('/login')

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
