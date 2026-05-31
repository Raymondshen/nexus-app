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
4. Crew creation and join flow
5. ✅ Group chat with Supabase Realtime
6. ✅ XP system with animated bar
7. The Void boss spawn + fight UI
8. Win state + artifact card drop
9. PWA configuration + push notifications
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
- src/app/auth/callback/route.ts: exchanges OAuth code, redirects to /onboarding
- src/app/(app)/layout.tsx: auth guard + GuestBanner client component
- src/components/ui/GuestBanner.tsx: shows GUEST badge + Save Progress for anonymous users
- src/types/index.ts: GuestUser + MessageWithProfile types added
- src/components/ui/Button.tsx: primary/secondary/danger variants, pixel drop-shadow, loading dots
- src/components/ui/Input.tsx: dark bg, purple focus ring, label + error, font-sans on input
- tsconfig paths updated: @/* → ./src/*
- App router moved to src/app/ (root app/ removed)

### Chat + XP (src/app/(app)/chat/ + src/components/chat/ + supabase/functions/)
- src/app/(app)/chat/[crewId]/page.tsx: server component, verifies membership, loads initial data, passes to client components
- src/components/chat/ChatHeader.tsx: crew name, LVL badge, member avatars, animated XP bar, boss HP bar, +XP float animations (Framer Motion)
- src/components/chat/MessageList.tsx: Realtime subscription on messages table, auto-scroll, date dividers, message grouping by sender
- src/components/chat/MessageBubble.tsx: sent/received layout, element dots, system message variants (boss/xp/artifact), tap-to-react
- src/components/chat/ChatInput.tsx: textarea (Enter to send, Shift+Enter newline), send/attach/mic buttons, calls award-xp edge function
- src/store/chatStore.ts: Zustand — messages, crewXP, crewLevel, xpFloats, activeRaid
- src/lib/game/xp.ts: XP_VALUES, calculateXP, getElementType, getLevelFromXP, getXPProgress constants + helpers
- supabase/functions/award-xp/index.ts: calculates base XP + first-today + combo bonuses, updates crews.total_xp, spawns The Void at 500 XP threshold

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