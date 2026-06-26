# Nexus

Group chat RPG: messages → XP → boss fights → artifacts. Pixel art (RotMG style).

## Stack
Next.js 16 App Router · TypeScript · Tailwind · Framer Motion · Zustand · Supabase (Auth, Postgres, Realtime, Storage, Edge Functions) · next-pwa v5 · Vercel · @tanstack/react-virtual v3

Icons: `pixelarticons` — `import { X } from 'pixelarticons/react/X'` · `<X style={{ width, height, color }} />` · named exports only · never lucide-react in chat/home UI

Build: `next build --webpack` (Turbopack breaks next-pwa + proxy.ts)

## Database Tables
```
profiles            id, username (unique case-insensitive), first_name, last_name, avatar_class, avatar_url, avatar_storage_key, custom_avatar (bool default false), birthday, is_dev, coins (int default 0), gem_balance (int default 0), last_gem_claim (timestamptz nullable), status (text nullable ≤100 chars), last_active_at (timestamptz nullable), created_at
crews               id, name, invite_code (6 chars unique), level, total_xp, created_at, is_dm (bool default false), dm_partner_1 (uuid nullable), dm_partner_2 (uuid nullable), image_url, image_storage_key, last_message_preview (text nullable), last_message_at (timestamptz nullable), last_message_sender_id (uuid nullable)
crew_members        id, crew_id, user_id, class, joined_at, last_seen, ability_bank (int default 0), stat_boosts (jsonb default '{}')
messages            id, crew_id, user_id, content, message_type, element_type, xp_awarded, reactions (jsonb default '{}'), reply_to_id, reply_preview, reply_username, image_url, image_blur_hash, pinned (bool default false), pinned_by (uuid nullable), pinned_at (timestamptz nullable), pin_expires_at (timestamptz nullable), created_at
crew_xp_log         id, crew_id, user_id, xp_amount, source, created_at
bosses              id, name, type (void|ghost|flood|scheduled), max_hp, weak_element, description
active_raids        id, crew_id, boss_id, current_hp, max_hp, phase, started_at, expires_at, defeated_at, mvp_user_id, expiry_notif_sent, last_boss_attack_at (timestamptz nullable), guard_user_id (uuid nullable), guard_expires_at (timestamptz nullable), volley_expires_at (timestamptz nullable) — supabase_realtime
crew_combat_members id, raid_id (→ active_raids CASCADE), user_id (→ profiles CASCADE), class, current_hp, max_hp, ability_bank (int default 0), is_downed (bool default false), downed_at (timestamptz nullable), guard_expires_at (timestamptz nullable), momentum_stack (int default 0), last_msg_at (timestamptz nullable), created_at — UNIQUE(raid_id, user_id); supabase_realtime
revive_tokens       crew_id (PK → crews CASCADE), count (int default 5) — supabase_realtime
artifacts           id, crew_id, name, rarity (common|rare|epic|legendary), source_boss_id, earned_at, mvp_user_id, asset_type, metadata
push_subscriptions  id, user_id, crew_id (nullable), endpoint (UNIQUE), p256dh, auth, created_at
notification_preferences   user_id (PK), notif_messages, notif_raids, notif_victory, updated_at
friendships         id, requester_id, addressee_id, status (pending|accepted), created_at — UNIQUE(requester_id, addressee_id)
coin_log            id, user_id, crew_id (nullable), coins, source, created_at
app_invites         id, code (text unique), inviter_id (uuid → profiles), used (bool), used_by (uuid → profiles), used_at (timestamptz), created_at
reserved_users      id, email (text unique), username, class, first_name, last_name, created_at, converted (bool default false)
announcements       id, text (1–500 chars), active (bool default true), created_at
polls               id, message_id (uuid → messages nullable), crew_id, creator_id, question (1–200 chars), options (jsonb string[]), votes (jsonb default '{}' — `{"0":["userId",...]}`), expires_at, closed_at, created_at
squad_definitions   id, crew_id, creator_id, word (1–100 chars, comma-separated aliases), definition (1–500 chars), created_at — UNIQUE INDEX (crew_id, lower(word))
definition_suggestions  id, definition_id (→ squad_definitions CASCADE), crew_id, suggester_id, suggested_definition (1–500 chars), created_at — UNIQUE(definition_id, suggester_id); REPLICA IDENTITY FULL
friendship_xp       user_a (uuid), user_b (uuid), total_xp (int) — canonical order: user_a < user_b (UUID); UNIQUE(user_a, user_b)
friendship_xp_log   id, user_a, user_b, sender_id, xp_awarded (int), source (dm|mention), awarded_at
notes               id, crew_id, created_by, url, og_title, og_image_url, source_domain, section_id (uuid → board_sections nullable, ON DELETE SET NULL), created_at
board_sections      id, crew_id, created_by, name (1–100 chars), position (int), created_at — INDEX (crew_id, position, created_at)
```

DM channels: `crews` rows with `is_dm = true` · `dm_partner_1 < dm_partner_2` (UUID order) · both partners in `crew_members` class=berserker · filtered from home Squads; shown in Friends only

## Postgres Functions
All `SECURITY DEFINER`. Declared in `Database.Functions` in `src/types/index.ts` (re-exports `Database` type from sub-files).

- `create_crew(p_name, p_invite_code)` → uuid
- `join_crew(p_invite_code)` → uuid
- `leave_crew(p_crew_id)` → jsonb `{ok|deleted}`
- `insert_message(p_crew_id, p_content, p_message_type, p_reply_to_id?, p_reply_preview?, p_reply_username?, p_image_url?, p_image_blur_hash?)` → messages row
- `damage_raid(p_raid_id, p_damage, p_user_id)` → `(current_hp, phase, defeated_at)`
- `increment_crew_xp(p_crew_id, p_xp_delta)` → `(new_total_xp, new_level)`
- `is_crew_member(p_crew_id)` → boolean
- `get_or_create_dm(other_user_id)` → uuid
- `get_unread_counts(p_crew_ids, p_cutoffs)` → `TABLE(crew_id, unread_count)`
- `get_crew_member_msg_counts(p_crew_id)` → `TABLE(user_id, msg_count)`
- `get_member_crew_stats(p_crew_id, p_user_id)` → `TABLE(msg_count, total_xp)`
- `increment_user_coins(p_user_id, p_amount)` → void
- `toggle_reaction(p_message_id, p_emoji, p_user_id)` → jsonb
- `create_poll(p_crew_id, p_question, p_options, p_expires_at)` → messages row
- `vote_on_poll(p_poll_id, p_option_index)` → jsonb
- `close_poll(p_poll_id)` → void
- `claim_daily_gem(p_user_id, p_local_midnight)` → jsonb `{claimed, gem_balance}`
- `pin_message(p_message_id, p_duration_minutes?)` → jsonb — admin only, cap=5, duration≤525960 min
- `unpin_message(p_message_id)` → jsonb — admin only
- `update_active()` → void — sets `profiles.last_active_at = now()` for caller; used as presence heartbeat
- `init_combat_members(p_raid_id, p_crew_id, p_crew_level)` → void — creates `crew_combat_members` rows for dev members only; seeds `ability_bank` from `crew_members.ability_bank`; adds HP stat boost from `crew_members.stat_boosts` to `max_hp`
- `apply_boss_damage(p_raid_id, p_member_id, p_final_dmg)` → `(new_hp, is_downed, downed_at)` — atomic boss-to-member hit
- `use_revive_token(p_raid_id, p_target_user_id)` → jsonb `{ok, new_hp?, tokens_remaining?}` — spends token, restores target to full HP

## Game Values

XP: first-msg-today=10 (flat, one-time per UTC day) · all other messages=1 · reactions use `react-to-message` (unchanged)
Anti-spam: gap < 5s since sender's last message → 0 XP, 0 coins, 0 damage (soft block)

Coins: text/voice/image=1 · reaction/system=0 · generate-invite=−25 · seed-to-new-user=+50 · blocked when softBlocked
- `handle_new_user` trigger → 50 signup bonus · invite alphabet: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
- Balance in `profiles.coins`; `chatStore.userCoins`; shown in `AccountPreview` (bare `TokeCircle` 24×16 + Silkscreen number) and profile hero glass badge
- Tap-tooltip: shows "25 COINS = 1 CREW INVITE" for 2s; coins awarded only when neither anti-spam layer fires

Friendship XP: 1pt per DM send or @mention · 10pt daily cap (local midnight, tracked in `friendship_xp_log` by `sender_id`) · `award-friendship-xp` edge function · fully launched
- `friendship_xp` cumulative bilateral XP; canonical pair `user_a < user_b`; home card heart badge (purple→pink) + profile hero glass badge; realtime via `home-fxp-a:{userId}` + `home-fxp-b:{userId}`
- Tap-tooltip: "EARN FRIENDSHIP POINTS, SPEND ON COSMETICS SOON" for 2s

Gems: 1/day on first message in any crew · `award-gem` edge function + `claim_daily_gem` RPC are sole authority — client never awards
- `profiles.gem_balance` + `last_gem_claim`; both blocked from client writes by `profiles_protect_gem_columns` trigger
- Client gate (`src/shared/utils/gems.ts`, idb-keyval `nexus_gem_claimed_at`): display/debounce only; checked in `ChatInput.send()` fire-and-forget
- Fully launched: `GemCounter` in `FloatingBackButton` right-icon row, `GemToast` on earn always shown; "Reset Gem Cooldown" in dev page nulls `last_gem_claim` for caller + clears idb-keyval key

Boss: The Void at every 500 XP (`BOSS_XP_THRESHOLD`) · 48h window · 3 phases · defeat → artifact drop
- Artifact rarity roll: legendary 5% / epic 15% / rare 30% / common 50%
- Phase multipliers: 1→1.0×, 2→1.3×, 3→1.6× boss damage
- Boss attacks: phase 1/2 = every 2h, phase 3 = every 1h (was Vercel cron `*/30 * * * *` — removed; trigger via dev panel)
- Downed members auto-regen after 8h without a revive token

Combat System (always-on): 5 combat classes assigned on onboarding class select
| Class | HP | Ability | Cost | Effect |
|---|---|---|---|---|
| warrior | 42 | GUARD | 2 charges | Taunt + DEF+40% for 60s |
| healer | 32 | MEND | 2 charges | INT-scaled crew-wide heal (no revive) |
| archer | 28 | VOLLEY | 2 charges | Boss takes +20% dmg for 30s + ATK hit |
| rogue | 24 | BACKSTAB | 2 charges | Guaranteed crit (2.5× if boss HP>50%) |
| mage | 24 | CAST | 2 charges | 3× ATK arcane nuke |

**Ability Bank**: replaces MP entirely. All abilities cost a flat **2 charges**. Eligible messages earn **1 charge** (text ≥5 chars OR image, not soft-blocked, not exact repeat of sender's prior message). Bank persists across raids: `crew_members.ability_bank` is the durable store; `crew_combat_members.ability_bank` is the live HUD value. Both are synced on every earn/spend by `attack-boss`. New raids are seeded from `crew_members.ability_bank` via `init_combat_members`. CombatHUD shows bank count labeled "MSGS".

Stat scaling: `round(base × (1 + 0.018 × (level - 1)))` · crit chance: `min(0.05 + dex × 0.006, 0.50)` · damage reduction: `boss_dmg × phase_mult × (1 - def / (def + 100))`
**Stat boosts**: each player earns +1 to a random stat (`hp`, `atk`, `dex`, `def`, `int`) on boss defeat — persisted in `crew_members.stat_boosts` (jsonb). Boosts are additive after level scaling: `stat = round(base × scale) + boost`. HP boost is applied at raid init via `init_combat_members`; all other boosts applied in `statsAtLevel` in `attack-boss`. `COMBAT:stat_up:{username}:{stat}` system messages announce boosts in the combat log.
Rogue momentum: +5% ATK per stack (cap 25%, max 5 stacks), resets on Backstab, decays if >1h since last message
Passives: warrior Last Stand (+20% dmg dealt when HP < 30%) · healer Second Wind (+15% to all healing produced — both @mend and self-heal on normal attack; `@mend = int×1.5×1.15`, `selfHeal = dmg×0.0575`) · archer Precision (high DEX = highest natural crit chance) · rogue Momentum (see above) · mage Arcane Ward (DEF×1.3 while HP < 40%, recomputed each incoming hit)

Leveling: exponential curve — `xpForLevel(n) = round(120 × 1.0435^(n-1))` · `LEVEL_CAP = 100` · constants in `src/shared/constants/config.ts` (`LEVEL_XP_BASE=120`, `LEVEL_XP_GROWTH_RATE=1.0435`) · formula mirrored in `award-xp` + `react-to-message` edge functions · 5 tiers every 20 levels: Rookie (1–20) → Adventurer (21–40) → Veteran (41–60) → Elite (61–80) → Mythic (81–100) · `isTierBoundary` flag on level-up `DisplayItem` for future tier-up celebration

Elements: fire=<20 chars · water=>150 chars · lightning=voice · nature=images · shadow=reactions · arcane=daily/system

Chat Classes: Berserker (spam) · Sage (long) · Ghost (silence crit) · Hype Man (reactions) · The Voice (voice) · Meme Lord (images)
Combat Classes (stored in `crew_members.class`): warrior · healer · archer · rogue · mage — same field, swapped at onboarding class select when combat is enabled

Quick-pick emojis: `['🔥','💧','⚡','🌿','🌑','🔮']`

## Auth
- Google OAuth: `signInWithOAuth` → `/auth/callback` → `/home`
- Anonymous: `signInAnonymously`; guest badge + Save Progress in header
- `src/proxy.ts` only — DO NOT add `src/middleware.ts` (Next.js 16 errors if both exist)
- Protected routes: `/home` `/chat` `/vault` `/party` `/profile` `/onboarding` `/friends` `/dm`
- Auth check: `getSession()` (cookie-only), NOT `getUser()` (100–300ms overhead)

### Login — `/login`
Invite code path (step machine: `landing → invite-code → invite-oauth → invite-profile`):
1. `validateInviteCodeAction` — checks `app_invites`, does not consume
2. Sets cookies `nexus_invite_code` + `nexus_auth_intent=invite` (SameSite=Lax, 5min) → Google OAuth
3. Callback reads cookies → `invite-profile` step `?code=XXX`, clears cookies
4. `checkReservedUserAction()` — auto-completes if fully reserved
5. `completeInviteFlowAction` — re-validates, upserts profile, marks invite used

Reserve path: `reserved_users` insert only, no auth session. Gmail-only.

Error copy: invalid → "The Nexus does not recognize this code." · used → "This code has already been claimed." · generic → "The rift destabilized. Try again."

### Onboarding
`name → /onboarding/birthday → /onboarding/class → /onboarding/welcome → chat/crew`
- Class guard on `crew_members.class`, NOT `profiles.avatar_class` (global caused redirect loops)
- `selectClassAction` → welcome ONLY when `crew_members` count = 1
- Welcome screen: marks invite used + 50 seed coins + `recruit_arrived` push to inviter

## Dev Mode
`profiles.is_dev = true` — grant: `UPDATE profiles SET is_dev = true WHERE id IN (SELECT id FROM auth.users WHERE email = '...')`

Dev section in `/profile/developer`: Announcements · Push Diagnostics (`nexus_push_diag`) · Infinite Coins (`nexus_infinite_coins`) · Spawn Boss Mode (`nexus_dev_mode`) · Chat Camera (`nexus_chat_camera`) · Pin Feature (`nexus_pin_feature`) · Reset Gem Cooldown · AFK Exp (`nexus_afk_exp`) · Reset Friendship XP — FEATURES section
- Combat Testing panel: crew picker + 7 actions — Spawn Boss, Force Phase 2, Force Phase 3, End Raid, Down Yourself, Add Revive Token, Reset Combat
- Server actions in `src/app/(app)/profile/developer/actions.ts`: `spawnBossAction`, `forceRaidPhaseAction`, `endRaidAction`, `selfDownAction`, `addReviveTokenAction`, `resetCombatAction` — all protected by `requireDev()`
- `DeveloperClient` receives `userCrews: { id: string; name: string }[]` prop; fetched via nested select `crew_members → crews(id, name, is_dm)`, DM crews filtered out

Server-side (`award-xp`): boss spawn + `LEVEL_UP:` only when `isDevUser = true`

Client-side (`localStorage.nexus_dev_mode === '1'`): `MessageList` hides boss/artifact/level-up system msgs + cards; `ChatInput` hides DamageFloat + RAID ACTIVE indicator

## Storage Keys

sessionStorage: `nexus-msgs-{crewId}` (JSON, 50 msg cap) · `nexus_chat_from` (`'/home'`)

localStorage:
| Key | Value |
|---|---|
| `nexus_first_message` | timestamp ms |
| `nexus_install_prompted` | `'1'` |
| `nexus_crew_created` | `'1'` |
| `nexus_notif_prompted` | timestamp ms |
| `nexus_notif_state` | `granted\|denied\|pending` |
| `nexus_dev_mode` | `'1'` |
| `nexus_push_diag` | `'1'` |
| `nexus_infinite_coins` | `'1'` |
| `nexus_afk_exp` | `'1'` |
| `nexus_chat_camera` | `'1'` |
| `nexus_pin_feature` | `'1'` |
| `nexus_dismissed_banners` | JSON array of IDs |

## Architecture

### Source Layout (feature-based)
```
src/
├── app/                        Next.js routing (page.tsx / layout.tsx stay here — never move them)
│   ├── layouts/SlidePage.tsx   Page transition wrapper + useSlideBack()
│   ├── navigation/BottomNav.tsx
│   └── (app)/…/page.tsx        Server components only; import Clients from features/
├── features/
│   ├── chat/
│   │   ├── components/
│   │   │   ├── input/          ChatInput, InputActionsSheet, GifPickerSheet
│   │   │   ├── messages/       MessageList, MessageBubble, LinkPreviewCard
│   │   │   ├── sheets/         SquadDetailsSheet, PinDurationSheet, PinListSheet,
│   │   │   │                   NotifSheet, CrewImageUploadModal, DefinitionCreateSheet,
│   │   │   │                   SuggestDefinitionSheet, ReviewSuggestionSheet, ChatSheetReact
│   │   │   ├── polls/          PollCard, PollCreatorSheet
│   │   │   ├── header/         ChatHeader, DMHeader
│   │   │   └── navigation/     FloatingBackButton, DMOverlayBack, ShareModal
│   │   └── screens/            DefinitionsClient
│   ├── combat/
│   │   ├── components/         CombatHUD, CombatLog, AbilityButton, BossCard, DamageFloat
│   │   ├── screens/            VaultClient
│   │   └── utils/combat.ts     Stat scaling, class helpers
│   ├── events/
│   │   ├── components/         EventCreationSheet, EventRegistrationSheet,
│   │   │                       EventSheetBottomPreview, EventCard, EventCardMessage
│   │   └── screens/            GroupEventsClient, EventPageInfoClient
│   ├── home/
│   │   ├── components/         InviteArsenal
│   │   ├── screens/            HomeClient
│   │   └── utils/homePreviewCache.ts
│   ├── friends/
│   │   └── screens/            FriendsClient, InboxClient
│   ├── auth/
│   │   └── screens/            LoginForm
│   ├── onboarding/
│   │   └── screens/            BirthdayClient, ClassSelectClient, WelcomeClient
│   └── profile/
│       ├── components/         NotesGrid, AccountPageMember
│       └── screens/            ProfileClient, DeveloperClient, AnnouncementsClient,
│                               ErrorLogsClient, MemberProfileClient
├── shared/
│   ├── supabase/               client.ts, server.ts, auth.ts, imageLoader.ts
│   ├── constants/config.ts     BOSS_XP_THRESHOLD, LEVEL_XP_BASE, etc.
│   ├── utils/                  xp.ts, gems.ts, notifications.ts, sounds.ts,
│   │                           og-preview.ts, imageCompress.ts, imageProcessing.ts,
│   │                           index.ts (cn/clsx helpers), ErrorLogger.tsx
│   ├── hooks/useOGPreview.ts
│   ├── icons/                  Campfire.tsx, GifIcon.tsx, SettingsCogIcon.tsx
│   └── components/
│       ├── ui/                 Button, Input, Avatar, DelayedSkeleton,
│       │                       ErrorBoundary, SessionRefresher
│       ├── banners/            MarqueeBanner, AnnouncementBanner, GuestBanner
│       ├── overlays/           AvatarUploadModal, BackgroundUploadModal, ImagePreviewOverlay
│       ├── pwa/                InstallPrompt, SWRegister, WelcomeDetector,
│       │                       NotificationPrompt, PushRefresh, PushDebugFAB, BadgeClear
│       └── game/               PixelSprite, GemToast, LevelUpBanner, CoinIcon,
│                               FriendshipXPBar, FriendshipXPToast, GemCounter
├── store/                      chatStore.ts, combatStore.ts (cross-feature — stay here)
└── types/
    ├── index.ts                Re-export barrel + Database type (import from '@/types' — unchanged)
    ├── shared.ts               AvatarClass, MessageType, OGPreview, GuestUser
    ├── profile.ts              Profile, GemClaimResult, CoinLog, FriendshipXP, FriendshipXPLog
    ├── chat.ts                 Crew, CrewMember, Message, MessageWithProfile, CrewXPLog,
    │                           Announcement, Poll, SquadDefinition, DefinitionSuggestion
    ├── notifications.ts        PushSubscription, NotificationPreferences, CrewNotificationPreferences
    ├── friends.ts              FriendshipStatus, Friendship, FriendProfile
    ├── events.ts               EventRsvpStatus, Event, EventRsvp
    ├── board.ts                Note, PublicNote, BoardSection
    ├── combat.ts               CombatClass, CombatEventKind, CombatEvent, ActiveRaid,
    │                           CombatMember, ReviveToken
    └── system.ts               ReservedUser, AppInvite, ClientError, PendingDeletion
```

**Rules:** `app/(app)/*/page.tsx` are server components only — they import Client components from `features/`. Server actions (`actions.ts`) stay colocated with their route in `app/`. `src/proxy.ts` stays at root (Next.js middleware — never rename or duplicate as `middleware.ts`). Stores stay at `src/store/` because both chatStore and combatStore are used across multiple features. All type sub-files are re-exported from `src/types/index.ts` — import from `'@/types'` everywhere (zero import-path churn). Sub-file imports (`'@/types/combat'` etc.) are also valid for direct domain use.

### Realtime / Messaging
- Channel `messages:{crewId}`: broadcast (sender→instant) + Postgres Changes INSERT (backup) + presence (typing only) + typing
- `addMessage` deduplicates by id; broadcast payload has no profile (resolved from `profilesRef`)
- `prependMessages` deduplicates by id before prepending older batches to the front of the array
- XP sync: sender `addXP(n)` optimistic → `setCrewXP(data.new_total_xp)` → broadcasts `xp_update`; receivers `receiveXP(earned, newTotal)`; dedup by `sender_id`
- **Presence (online/offline)**: timestamp-derived, not socket-state. `profiles.last_active_at` is the authority — online = `last_active_at > now() - 45s`. No `is_online` boolean, no cleanup cron.
  - Heartbeat (30s interval, foreground only): `update_active()` RPC + broadcasts `{ event: 'active', user_id, ts }` on `messages:{crewId}`; piggybacked on every message send
  - Initial seed: on mount fetches `last_active_at` for all member IDs from `profiles` (covers users active in other crews)
  - Staleness sweep (15s, pure local): `sweepOnlineUserIds(45_000)` recomputes `chatStore.onlineUserIds` from `lastActiveMap` — no network call
  - Backgrounded: heartbeat interval stopped on `visibilitychange→hidden`; timestamp ages naturally; sweep drops stale entries within 45s. No iOS throttle fights.
  - Foregrounded: heartbeat fires immediately + interval restarts + channel re-tracked for typing
  - `chatStore.lastActiveMap: Record<userId, timestamp_ms>` · `setLastActive(uid, ts)` · `sweepOnlineUserIds(thresholdMs)`
- Typing: Supabase Presence (`ch.track({ username, typing })`) on `messages:{crewId}`; `presence:sync` reads typing state only — NOT used for online status

### MessageList
- **Virtualization**: `useVirtualizer` (`@tanstack/react-virtual` v3) — absolute-position strategy, `measureElement` for accurate variable heights, `overscan: 5`, `getItemKey` uses `message.tempId ?? message.id` (or item `.key`) — `tempId` is set on every optimistic message and kept through reconciliation so the virtualizer key is stable when the real `id` is patched in, preventing the remeasure/reposition that causes messages to appear at the wrong scroll position
- **Initial load**: stale-while-revalidate — `nexus-msgs-{crewId}` sessionStorage → immediate render; background fetch newest 50 (`ORDER BY created_at DESC LIMIT 50`) merges with in-flight Realtime msgs, writes back to cache; `setMessages([])` before load prevents crew bleed
- **Cursor pagination**: scroll-up within 120 px triggers `fetchOlderMessages` — keyset query `WHERE crew_id=? AND created_at < cursor ORDER BY created_at DESC LIMIT 50` hits existing `messages_crew_id_created_at` index; batches prepended via `chatStore.prependMessages` (deduplicates by id)
- **Scroll restoration after prepend**: capture `scrollTop` + `virtualizer.getTotalSize()` before `prependMessages`; in `useBrowserLayoutEffect` (pre-paint) set `el.scrollTop = prevScrollTop + (newTotalSize - prevTotalSize)` — keeps every visible item at the same pixel row without index arithmetic
- **Continuous-load guard**: `anchorPendingRef` stays `true` from before `prependMessages` until the layout effect fires; `handleScroll` checks both `isFetchingOlderRef` and `anchorPendingRef` so the window between `finally` and the layout effect cannot trigger a second fetch
- **Display items**: `useMemo` builds typed `DisplayItem[]` array — `spacer | empty | divider | boss | artifact | level_up | message`; two separate `useMemo` passes for `groupXPMap` + `groupCoinMap`; group leader gets `xpOverride` / `coinOverride` prop. System messages whose content starts with `COMBAT:` or `BOSS_SPAWN:` are always skipped (early `continue`) — they are shown in `CombatLog` inside the HUD instead of the chat bubble list
- **Scroll**: initial → `scrollTop = scrollHeight`; new Realtime append → `virtualizer.scrollToIndex(last, 'end', smooth)` if near bottom or own send; `skipAutoScrollRef` prevents auto-scroll fighting anchor restoration in the same render cycle
- **Pinned scroll**: `findIndex` on items array by message id → `virtualizer.scrollToIndex(idx, 'center', smooth)`
- Postgres Changes UPDATE: skip `reactions:{}` when local has reactions (award-xp race); patch also picks up pin fields (`pinned`, `pinned_by`, `pinned_at`, `pin_expires_at`)
- **Combat HP/phase source of truth**: on Postgres Changes INSERT for `message_type === 'system'` with combat content, parses the system message to patch combatStore — `COMBAT:attack/volley/backstab/cast` → `patchRaid({ current_hp: parts[4] })`; `COMBAT:phase` → `patchRaid({ phase })`; `COMBAT:victory/escaped` → `setActiveRaid(null)` + `setAllMembers([])`. This is more reliable than `active_raids` realtime UPDATEs, which arrive out of order and would overwrite correct HP with stale values.
- Each message bubble wrapped in `<div id="msg-{id}">` for legacy DOM scroll-to-pin fallback

### MessageBubble — text rendering
`renderMessageContent` — splits on `@username` tokens, then `renderWithLinks` (URL → `<a>`) + `renderWithDefinitions` (alias regex → blue `<span>`) on each text segment. Early returns for `message_type === 'system'` and `'poll'` narrow type before the reaction sheet render.

Long-press sheet (500ms / right-click) → emoji quick-pick + Reply + Copy Text + Pin (admin only). `PinDurationSheet` portal opens when pin tapped.

OG previews: `extractFirstUrl` → `useOGPreview` hook → `<LinkPreviewCard>` below body; text-only messages without `image_url` only.

### ChatInput
- Props: `{ crewId, userId, userProfile, memberProfiles, crewName, inviteCode?, creatorId?, isDM? }`
- Send flow: `addMessage(optimisticMsg)` synchronously (with `tempId` field for stable virtualizer key) → `insert_message` RPC → reconcile in place: if postgres_changes beat the RPC `removeMessage(raw.id)` first, then always `updateMessage(tempId, { id: raw.id })` (never remove-and-reinsert the temp) → broadcast → `award-xp` → `attack-boss` (if raid); on RPC error `removeMessage(tempId)` rollback
- Input row (inactive): `PlusBox` 24×24 + `GifIcon` 24×24 outside border box, 16px gaps; border `#27272a`
- Input row (focused): icons slide out (motion.div `width→0`), border turns `--color-purple`, icons use `marginRight: -16` to cancel flex gap
- **Hybrid input/textarea**: default/empty/single-line renders as `<input type="text">`; swaps to `<textarea>` (3-line cap, `overflowY: auto`) when text width exceeds container. Overflow detected via hidden `<span ref={mirrorRef}>` (matching `font-body` + `fontSize: 14` + `fontVariationSettings`) measured against `innerContainerRef` clientWidth — 2px forward buffer, 6px hysteresis before swapping back. `recheckOverflow()` called on every keystroke (`handleInput`) and on container resize (`ResizeObserver`). Element swap mechanics: `isMultiline` state + `isMultilineRef` (kept in sync on every render) + `pendingCaretPosRef` → `useLayoutEffect([isMultiline])` focuses new element and restores caret in same paint cycle. No `setTimeout`/`requestAnimationFrame` focus hacks. `textareaRef` valid only when multiline; `inputRef` valid only when single-line; `getActiveField()` / `focusField()` helpers abstract over both. Textarea height computed from `getComputedStyle` lineHeight + padding × 3 lines, not hardcoded px.
- @mention overlay: transparent input/textarea + `aria-hidden` div; purple `<mark>` for valid tokens; overlay scroll synced to active field (effect re-registers on `isMultiline` change)
- Slash commands: `/birthdays` → `message_type: 'system'`
- System message content formats: `JOIN:username` (no inviter) or `JOIN:username:inviterUsername` (with inviter, set by `joinCrewFromWelcomeAction` when a valid unused invite is found); `MessageBubble` parses both formats — `JoinMessage` shows "@username joined the squad" or "invited by @inviter"
- `InputActionsSheet` (`src/features/chat/components/input/InputActionsSheet.tsx`): triggered by `PlusBox` (`[+]`) button; two options — "UPLOAD PHOTO" (`Upload` 16×16, purple border, gated `nexus_chat_camera`) + "CREATE A POLL" (`Chart` 16×16, secondary border); spring slide-up, `pt-24 pb-28 px-16 gap-16`
- `GifPickerSheet` (`src/features/chat/components/input/GifPickerSheet.tsx`): `Search` icon 16×16 in input; "Powered by Klipy" Silkscreen 8px tertiary below; no upload button; spring slide-up, `pt-24 pb-28 px-16`; loads trending on open, switches to search on query input (400ms debounce)
- **Klipy API** (`src/app/api/gif/route.ts`): two endpoints with **different response shapes** — trending (`/web/common-trending`) returns items in `data.clips[]` with flat `file.thumbnail_url`/`thumbnail_url_webp` and `file_meta.gif/webp` for dimensions; search (`/web/gifs/search`) returns items in `data.data[]` with nested `file.sm/md/hd/xs` sub-objects each containing `gif`/`jpg`/`webp` variants. Both share `data.has_next`. Use separate parsers (`parseClipItem` / `parseSearchItem`) — do NOT unify them.
- `GifIcon` (`src/shared/icons/GifIcon.tsx`): custom 24×24 SVG with `currentColor` fill; used as GIF button in ChatInput row
- DM mode hides XP bar + expanded panel
- Combat is always-on — no feature gate; all combat hooks (seed effect, realtime effect, `callAttackBoss`) run unconditionally on mount
- Seed effect calls `store.clearCombatEvents()` before seeding — scopes the combat log to the current crew's raid; combined with the MessageList replay, this ensures events never bleed across crews or raids
- `callAttackBoss` fires fire-and-forget after every message send; no-ops if no active raid or user not in `memberStats`
- `active_raids` Postgres Changes UPDATE handler **only** patches `guard_user_id`, `guard_expires_at`, `volley_expires_at`, `last_boss_attack_at` — it must NOT touch `current_hp` or `phase`; those are owned by COMBAT:* system message INSERTs (see MessageList)
- `AbilityButton` renders (in CombatHUD expanded panel) when `!isDM && userCombatClass && hasJoinedRaid`; prop `username` required

### Pin Feature (dev-gated: `nexus_pin_feature`)
- Admin = crew member with earliest `joined_at`; cap = 5 active pins per crew (`PIN_MAX_PER_CREW`)
- `pin_message` / `unpin_message` RPCs only — `messages_protect_pin_columns` trigger blocks direct client writes
- `PinDurationSheet` (`src/features/chat/components/sheets/PinDurationSheet.tsx`): single-step sheet — message preview (content + "Sent by : @username") + duration `<select>` dropdown (7 presets: 15 min → 1 month + Permanent; `ChevronRight` rotated 90° as indicator) + "PIN IT" button (h-48 bg-purple Silkscreen); `bg-black border-t border-[#27272a]`; opened from long-press sheet
- `PinListSheet` (`src/features/chat/components/sheets/PinListSheet.tsx`): lists active pins; `bg-black` no border-top; header "Pinned Messages" DM Sans Bold 16px; each item: content (Medium 14px secondary) + "Sent by : @user · [expiry]" (Regular 12px tertiary + blue #60a5fa); **admin-only action row** (entire row hidden for non-admins) = "Unpin message" (left, red, 12px) + "Display" label + 40×24px toggle (purple ON thumb-right / #71717a OFF thumb-left); `h-px bg-border/40` dividers with `margin: 12px 0`
- `MarqueeBanner` (`src/shared/components/banners/MarqueeBanner.tsx`): shared marquee; accepts `items[]` for multi-pin continuous scroll (`msg @user • msg @user • …`); also used by ProfileStatusTicker (single `text` prop)
- `FloatingBackButton`: `Note` icon button (count badge) + ticker strip below nav; ticker filters `hiddenPinIds` (chatStore Set, in-memory); tapping ticker scrolls to first visible pin
- `selectActivePins(messages)` exported from chatStore; `hiddenPinIds` + `toggleHiddenPin` in chatStore

### Combat System (always-on)

**System message content formats** (all `message_type: 'system'`, inserted directly — NOT via `insert_message` RPC):
| Content | Meaning |
|---|---|
| `BOSS_SPAWN:{bossName}:{maxHP}` | Boss spawned |
| `COMBAT:attack:{username}:{dmg}:{newBossHP}:{isCrit}` | Normal attack |
| `COMBAT:volley:{username}:{dmg}:{newBossHP}:{newBank}` | Archer volley |
| `COMBAT:backstab:{username}:{dmg}:{newBossHP}:{newBank}` | Rogue backstab |
| `COMBAT:cast:{username}:{dmg}:{newBossHP}:{newBank}` | Mage cast |
| `COMBAT:guard:{username}:{newBank}` | Warrior guard |
| `COMBAT:mend:{username}:{healAmount}:{newBank}` | Healer mend |
| `COMBAT:boss_attack:{targetUsername}:{dmg}:{newTargetHP}` | Boss hits player |
| `COMBAT:downed:{username}:{dmg}` | Player downed |
| `COMBAT:phase:{newPhase}` | Phase transition |
| `COMBAT:victory:{mvpUsername}:{rarity}:{artifactName}` | Boss defeated |
| `COMBAT:escaped:{bossName}` | Raid expired without defeat |
| `COMBAT:stat_up:{username}:{stat}` | +1 stat awarded on victory (stat ∈ hp\|atk\|dex\|def\|int) |

**MessageList combat wiring** (`parseCombatEvent` + `parseDamageFloat` — module-level functions before `MessageList` component):
- `parseCombatEvent(content, messageId?, messageTs?)` — uses actual message `id` and `created_at` timestamp when provided so events can be deduplicated across the realtime and replay paths
- On `postgres_changes INSERT` for `message_type === 'system'`: calls `parseCombatEvent(raw.content, raw.id, Date.parse(raw.created_at))` → `combatStore.addCombatEvent(event)` (capped at 200); calls `parseDamageFloat(content)` → `combatStore.spawnDamageFloat(...)` for attack/volley/backstab/cast only; float x = `window.innerWidth * 0.5 + (Math.random() * 80 - 40)`, y = `window.innerHeight * 0.65`
- Also patches combatStore HP/phase from the same INSERT (see MessageList section above — this is the authoritative path, not `active_raids` realtime UPDATEs)
- **Combat log replay**: after the initial DB fetch merges and calls `setMessages(merged)`, filters system messages from `raid.started_at` onward, parses them, and calls `combatStore.replayCombatEvents(events)` — ensures the log persists across page loads without relying solely on realtime events

**combatStore** (`src/store/combatStore.ts`): Zustand store
- State: `activeRaid | null`, `memberStats: Record<userId, CombatMember>`, `combatEvents: CombatEvent[]` (cap 200), `reviveTokens: number`, `damageFloats: DamageFloat[]`
- Patches: `patchRaid`, `patchMemberHP(userId, hp, downed, downedAt)`, `patchMemberBank(userId, bank)`, `patchMemberMomentum(userId, stack)`, `setAllMembers(members[])`
- Events: `addCombatEvent(event)` — appends, cap 200; `replayCombatEvents(events[])` — merges by event `id` (existing live events take precedence), sorts by `ts`, caps at 200; `clearCombatEvents()` — resets to `[]`
- Floats: `spawnDamageFloat({ id, value, isCrit, x, y })` / `removeDamageFloat(id)`

**Components** (`src/features/combat/components/`):
- `AbilityButton` — class-specific ability button; prop `username: string` required; shows "Cost: 2" + current bank count; disabled when `ability_bank < 2`; renders `null` when `!activeRaid || !member`
- `BossCard` — file exists but is no longer rendered anywhere; timer countdown logic absorbed into `CombatHUD`
- `CombatHUD` — red marquee banner ("RAID IN PROGRESS TAP BANNER TO VIEW") always visible at top; tap toggles expanded panel which slides open **below** the banner. Expanded panel (top→bottom): boss name + last dmg (Silkscreen 12px) · next attack timer + expiry (Silkscreen 11px) · `CombatLog` · member HP list (username 9px + HP bar + hp/max or "DOWNED"). DOM order: `<RaidMarquee>` first, `<AnimatePresence>` panel second — banner is always above the panel. Props: `currentUserId`, `crewId?`, `isDevUser?`, `memberProfiles?: Record<string, { username }>`. Placed as sibling between `MessageList` and `ChatInput` in the chat page flex column; `flex-shrink-0` so it pushes MessageList up as the panel expands. All members auto-join on boss spawn via `init_combat_members` — no manual "JOIN RAID" button.
- `CombatLog` — virtualized scrollable feed of `CombatEvent[]` from combatStore; rendered inside `CombatHUD`'s expanded section (not standalone); returns `null` when `events.length === 0`
- `DamageFloat` — `position: fixed` viewport-overlay floating damage numbers; spawned per attack event

### SquadDetailsSheet (`src/features/chat/components/sheets/SquadDetailsSheet.tsx`)
Trigger: swipe-up or chevron-up · sheet: `z-[70]` (above ticker's z-[60], below action sheets z-[80+]) · `maxHeight: 85vh`
- Header icons (right, `gap-[--space-5]`): `MagicEdit` (rename, creator only) · `Bell` (notifs) · `Library` (→ `/chat/[crewId]/definitions`) · `ChevronRight` rotated 90° (close)
- Member row right side: `User` 16×24 (→ profile) · `MailRight` 16×24 (→ `/dm/[memberId]`, hidden for own row) · `UserMinus` 24×24 red (remove, creator only on others)
- Props: `onOpenGlossary?` + `onDMPress?(memberId)` wired in `ChatInput.tsx`
- Invite code copy: `"Come join my squad on Nexus app {code}"`

`SquadDetailsEditSheet` (inner, Figma 113:516) — triggered by `MagicEdit`, z-[80]/z-[81], `maxHeight: 90vh`, `gap: --space-7`, `padding: --space-7 --space-5`
- **No title heading** — opens directly to group_header (180px, `justify-between`)
- Header: 40×40px square crew image + DM Sans Black 16px `text-primary` name + Silkscreen `text-secondary text-xxs` member count; NO avatar list
- XP bar pinned to bottom of 180px block: `{xpProgress}%` tertiary · total msg secondary (8px Silkscreen)
- Fields (`gap: --space-5`): **Squad Name first** (DM Sans Medium 14px label, `border: 1px solid #3f3f46` input h-48 p-12) → **Squad Profile Picture** (DM Sans Medium 14px label, full-width purple-border h-48 button with `Upload` 16×16 + Silkscreen xs text-purple "upload photo")
- Buttons: `<Button>Save Changes</Button>` + `<Button variant="outlined" color="red">Cancel</Button>`, `gap: --space-5`
- Props stripped to: `crewName`, `memberCount`, `crewImageUrl`, `crewXP`, `xpProgress`, `totalMessages`, `onUploadPhoto`, `onSave`, `onClose` (no members/onlineUserIds/memberMsgCounts/crewLevel)

### InboxClient (`src/features/friends/screens/InboxClient.tsx`)
Single-row `InboxCardPreview` component: avatar 48px · DM Sans Bold name · status subtitle (DM Sans 14px)
- Incoming ("Wants to be your friend"): status `--color-secondary` · green `Check` 16×16 + red `Close` 16×16 icon-only buttons inline
- Outgoing ("Sent friend request"): status `--yellow` · red-bordered `Close` 16×16 icon-only button inline (no fill)

### HomeClient
- Realtime: single `postgres_changes UPDATE` channel on `crews` (`filter: id=in.(crewIds)`, channel `home-crews-preview`) replaces N per-crew broadcast channels; XP-only updates guarded by `updated.last_message_at === cs.lastMessage?.created_at` to prevent false unread increments + `postgres_changes UPDATE` on `profiles` + two friendship XP channels (`home-fxp-a/b:{userId}`)
- Last-message preview comes from denormalized `crews.last_message_preview/at/sender_id` columns (maintained by `update_crew_last_message` trigger); no `messages` table join on home load
- Optimistic preview: `homePreviewCache.ts` module-level consume-once Map; `ChatInput` writes on send, `HomeClient` `useState` initializer reads and patches before first render
- Auto-sort by `lastMessage.created_at` desc; Framer Motion `layout` animates; channel dep `[...crewIds].sort().join(',')`
- `handleCrewTap`: sets `sessionStorage.nexus_chat_from = '/home'` before push

### Page Transitions (`src/app/layouts/SlidePage.tsx`)
- Enter: spring 380/36; skipped on back-nav via `_skipNextSlideEnter` module flag
- Exit: ease-in 150ms; navigation fires in `.then()` after animation
- `nativeSwipe`: no touch handlers (iOS native gesture); `useSlideBack()` hook — use instead of `router.back()`
- `FloatingBackButton`: injects `/home` into history via `replaceState` + `pushState` so swipe-back lands on home

### DM — `/dm/[friendId]`
Server: verifies friendship → `get_or_create_dm(friendId)` → renders chat. `DMOverlayBack`: floating back + friend avatar; initializes `setCrewXP` + `setActiveRaid`; updates `last_seen` every 60s

### award-xp
- Batch 1 (parallel): prev msg gap + crew data + sender `is_dev` + other members
- Batch 2 (parallel, if not soft-blocked): today msg count
- Anti-spam: gap < 5s since sender's last message → 0 XP, 0 coins
- Notifications fire-and-forget BEFORE XP writes — do NOT add early returns before notification block

### Reactions
- `messages.reactions` JSONB: `{ emoji: [userId,...] }`, empty arrays pruned
- Long-press 500ms or right-click → portal sheet; `hasMoved` ref cancels on scroll; `select-none` + `e.preventDefault()` (iOS callout)
- `handleReaction`: optimistic → `supabase.functions.invoke('react-to-message')` → apply `data.reactions`; rollback only on `FunctionsHttpError`
- `react-to-message` returns `{ reactions, hype_man_heal, heal_amount }`; Hype Man +5 XP float

### Polls
`message.content = 'POLL:{pollId}'` · `polls` in supabase_realtime · `Chart` → `PollCreatorSheet` → `create_poll` RPC · `vote_on_poll` one toggleable vote · always `showHeader = true`; 0 XP

### Board (`/profile` → BOARD tab · `/chat/[crewId]/member/[userId]`)
- **Board** = crew-scoped link cards (previously called "notes"). Renamed throughout UI.
- Always scoped to one crew. Own profile (`/profile`) has crew switcher pills + SETTINGS/BOARD tabs (local state, `AnimatePresence mode="wait"`, 150ms ease slide — no history push). Squad member profile shows board only (minimal nav bar + `NotesGrid`, no hero or profile stats).
- `notes` table stores cards; `board_sections` stores named groupings per crew.
- Sections: any crew member can create a section; cards can be assigned on add or moved later (long-press → "Move to Section"). Deleting a section moves its cards to Unsorted (`ON DELETE SET NULL`).
- `NotesGrid` (`src/features/profile/components/NotesGrid.tsx`): all board UI — crew pills, section blocks, card grid, all sheets. Props: `{ viewerId, initialNotes, initialSections, crews, initialCrewId, lockCrew? }`. `lockCrew={true}` hides the crew switcher (used on squad member profile).
- Actions (`src/app/(app)/profile/notes/actions.ts`):
  - `addNoteAction(crewId, url, sectionId?)` — fetches OG preview, inserts note
  - `fetchMoreNotesAction(cursor, crewId)` — keyset pagination, both args required
  - `deleteNoteAction(noteId)` — creator only
  - `moveToSectionAction(noteId, sectionId | null)` — moves card; creator only
  - `fetchCrewBoardAction(crewId)` → `{ notes, sections }` — used on crew switch
  - `createSectionAction(crewId, name)` → `{ section? }` — crew member only; position = `Date.now()`
  - `deleteSectionAction(sectionId)` → `{ error? }` — creator only
- Long-press pattern: 500ms timeout, `hasMoved` ref cancels on movement, `didLongPress` ref prevents tap-open on release → `CardActionSheet` (Open Link · Remove Note for creator · Move to Section)
- `/profile/notes` → redirects to `/profile` (dead route kept for link safety)
- `BoardSection` type in `src/types/board.ts` (re-exported from `@/types`); `notes.Update` includes `section_id`
- Member profile page (`AccountPageMember`): nav bar (back + username) + `NotesGrid` only — no hero, no friend action, no stats

### Squad Glossary (`/chat/[crewId]/definitions`)
`word` stores comma-separated aliases; UNIQUE INDEX `(crew_id, lower(word))`; blue highlight spans, `\b` regex `gi`, sort aliases by length desc
- Suggestion flow: non-creator → `SuggestDefinitionSheet`; creator → `ReviewSuggestionSheet`; realtime on `definition_suggestions` (REPLICA IDENTITY FULL)

### Pixel Sprites
`public/sprites/{spriteId}/{direction}.png` · 8 directions · 24×24px · plain `<img imageRendering: pixelated>` (never `next/image`) · `maxWidth: 'none'` required

### AnnouncementBanner
Below `AccountPreview` · `bg-[var(--color-blue)]/10 border border-[var(--color-blue)]` · swipe `'x'`, `dragElastic 0.15`, 40px threshold · pagination dots for 2+ banners

## Caching

Server (`unstable_cache` via `createServiceClient()` — NOT `createClient()`):
| Cache | TTL | Tag | Invalidated by |
|---|---|---|---|
| Home profile | 60s | `profile:{userId}` | saveBirthdayAction, revalidateProfileAction, updateAvatarAction |
| Home member profiles + counts | 60s | `crew-members:{crewId}` | joinCrewAction, leaveCrewAction, updateAvatarAction |
| Home friend profiles | 60s | `profile:{friendId}` | revalidateProfileAction, updateAvatarAction |
| Home friendships | 60s | `friends:{userId}` | sendFriendRequestAction, acceptFriendRequestAction, removeFriendAction |
| Active announcements | 60s | `announcements` | all announcement CRUD actions |
| Vault crew + artifacts | 300s | `vault:{crewId}`, `artifacts:{crewId}` | TTL only |
| Chat member profiles | 60s | `crew-members:{crewId}` | joinCrewAction, leaveCrewAction |
| Profile page | 60s | `profile:{userId}` | revalidateProfileAction |

Never cache: `crews.total_xp` · `crews.level` · `active_raids` · `crew_members.last_seen` · auth sessions

Next.js 16: `revalidateTag(tag, 'max')` — second arg required

## Edge Functions

```
supabase functions deploy send-notification --project-ref tlveyeisjbythssmocth --no-verify-jwt
supabase functions deploy award-xp --project-ref tlveyeisjbythssmocth
supabase functions deploy award-friendship-xp --project-ref tlveyeisjbythssmocth
supabase functions deploy react-to-message --project-ref tlveyeisjbythssmocth
supabase functions deploy process-avatar --project-ref tlveyeisjbythssmocth --no-verify-jwt
supabase functions deploy award-gem --project-ref tlveyeisjbythssmocth
supabase functions deploy attack-boss --project-ref tlveyeisjbythssmocth
supabase functions deploy boss-attack --project-ref tlveyeisjbythssmocth
```

`git push` does NOT deploy edge functions. Inter-function calls use raw `fetch()`, no Authorization header (never `supabase.functions.invoke()`). `send-notification` accepts `user_id: string` or `user_ids: string[]`.

New notification type checklist:
1. Add to `NotificationType` union in `send-notification/index.ts`
2. Add to `PREF_COLUMN` map (`null` = always deliver)
3. Add `case` to `buildPayload()` → `{ title, body, icon, data: { url } }`
4. Call `send-notification` from trigger point; deploy `--no-verify-jwt`

## PWA / Push
- SW: `public/sw-push.js` — handwritten, no workbox; no multi-arg `importScripts()` (kills iOS Safari)
- Strip `badge` from `showNotification` (iOS rejects); notification `tag` must be unique per notification (`-{timestamp}`)
- Subscribe: INSERT only, no delete-first; `23505` = success; on failure auto-unsubscribe + fresh APNs token
- VAPID vars in Supabase Edge Function secrets; `VAPID_SUBJECT` must be `mailto:` URI
- `message_received`: `"Name from Group Name"` / content or `"sent"` · `mention_received`: `"[sender] mentioned you in [crew]"` · `recruit_arrived`: `"Your recruit arrived."`, no pref gate
- Debugging: 401 = deployed without `--no-verify-jwt`; `expired_deleted` = APNs 410'd → FORCE RESUB

## Images
- `next/image` everywhere; `unoptimized={isSupabaseStorage(url)}` on every Supabase image
- `resolveAvatarUrl(url, displaySize)` on every avatar src (swaps `-256` → `-128` for ≤ 64px)
- Plain `<img>`: pixel sprites · crop target · hero backgrounds in `ProfileClient.tsx`
- Avatar upload: `AvatarUploadModal` → `react-image-crop` → canvas → 128+256px WebP → bucket `avatars`; `process-avatar` edge fn → 64/128/256px AVIF; `custom_avatar = true` blocks Google photo overwrite

## Design Tokens (`src/app/globals.css`)
Colors: `--color-primary` · `--color-surface` · `--color-border` · `--color-purple` · `--color-blue` · `--color-tertiary` · `--color-secondary` · `--color-paper-150`

Game/chat: `--color-bg-chat` (#0a0612) · `--color-chat-purple` (#bf5fff) · `--color-xp` (#ffd700) · `--color-coins` (#f59e0b) · `--color-danger` (#ff4444) · `--color-success` (#66bb6a) · `--color-system-msg` (#1a0d2e)

Figma aliases (globals.css `:root`): `--red` (#ef4444) · `--green` (#22c55e) · `--yellow` (→ `--color-coins`, #f59e0b) · `--purple` (→ `--color-purple`) · `--blue` (→ `--color-blue`) · `--xN` spacing aliases (x1=2px … x7=24px)

Fonts: `font-pixel` = Press Start 2P (game UI) · `font-body` = DM Sans (messages) · `font-silkscreen` = Silkscreen (stats/labels) · Silkscreen next/font var: `--font-silk`

Font sizes: `--text-mini` (8px) → `--text-xxl` (24px) · Spacing: `--space-*`

Icons (`pixelarticons`):
| Location | Component | Size |
|---|---|---|
| Back buttons | `ChevronLeft` | 24×24 |
| Expand/collapse | `ChevronRight` (rotated) | 24×24 |
| PinDurationSheet — duration dropdown | `ChevronRight` (rotated 90°) | 16×16 |
| Chat nav — notifs | `Bell` / `BellOff` | 24×24 |
| Chat nav — pins | `Note` | 24×24 |
| Chat nav — glossary / SquadDetailsSheet header | `Library` | 24×24 |
| SquadDetailsSheet — edit squad (creator) | `MagicEdit` | 24×24 |
| SquadDetailsSheet — member profile button | `User` | 16×24 |
| SquadDetailsSheet — member DM button | `MailRight` | 16×24 |
| SquadDetailsSheet — member remove (creator only) | `UserMinus` | 24×24, `--color-danger` |
| Friends — remove friend (swipe reveal) | `AvatarCircleMinus` | 16×16 |
| Inbox — accept request | `Check` | 16×16 |
| Inbox — decline / cancel request | `Close` | 16×16 |
| ChatInput — send | `Send` | 16×16 |
| ChatInput — poll | `Chart` | 16×16 |
| SquadDetailsEditSheet — upload photo button | `Upload` | 16×16, `var(--color-purple)` |
| ChatInput — creator | `Crown` | 12×12, `var(--color-coins)` |
| Coin badge | `TokeCircle` | 24×16 (not square) |
| AccountPreview — friends | `Notebook` | 12×12, `var(--color-purple)` |
| AccountPreview — invite | `Plus` | 12×12, `var(--color-primary)` |
| Copy / confirm | `Copy`, `Check` | 12×12 |

## Bottom Sheet Patterns

Two named patterns. Every new bottom sheet must use one of these — no custom dismiss logic.

### Sheet (standard — use this for all general sheets)
Backdrop tap + drag-to-dismiss. Spring animation `stiffness 320, damping 32`.

```tsx
{/* Backdrop */}
<motion.div
  className="fixed inset-0 z-[60] bg-black/60"
  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
  onClick={onClose}
/>
{/* Sheet */}
<motion.div
  className="fixed bottom-0 left-0 right-0 z-[70] bg-black border-t border-border"
  initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
  transition={{ type: 'spring', stiffness: 320, damping: 32 }}
  drag="y"
  dragConstraints={{ top: 0, bottom: 0 }}
  dragElastic={{ top: 0, bottom: 1 }}
  onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 400) onClose() }}
  onClick={(e) => e.stopPropagation()}
>
  {/* content */}
</motion.div>
```

Upload modals (AvatarUploadModal, BackgroundUploadModal, CrewImageUploadModal) use `drag={saving ? false : 'y'}` so the sheet is locked during an active upload — consistent with the backdrop being locked the same way.

### Panel (SquadDetailsSheet only — do not use elsewhere)
Full-height swipe-up panel with scroll-integrated pull-to-close (`onPanEnd`, threshold offset > 60 or vel > 300). This custom behavior exists because the panel merges a scrollable member list with the drag gesture and is intentionally different. Do not replicate this pattern for new sheets.

## Migrations (`supabase/migrations/`)
- `20240101000000` — initial schema, RLS, seed bosses
- `20240101000001` — push_subscriptions
- `20240101000002` — crew_members.last_seen, damage_raid, increment_crew_xp
- `20240101000003` — push_subscriptions: crew_id nullable, endpoint UNIQUE, expiry_notif_sent
- `20240101000004` — leave_crew
- `20240101000005` — profiles.avatar_url, storage bucket
- `20240102000001` — notification_preferences
- `20240102000002` — username unique via lower()
- `20240103000001` — ⚠ MUST APPLY: supabase_realtime for messages + active_raids; insert_message
- `20240103000002` — UPDATE policy on push_subscriptions
- `20240103000003` — profiles.birthday
- `20240103000004` — crew_notification_preferences
- `20240103000005` — get_unread_counts, get_crew_member_msg_counts
- `20240103000006` — get_member_crew_stats
- `20240103000007` — profiles.coins, coin_log, increment_user_coins, profiles in realtime
- `20240103000008` — handle_new_user signup bonus
- `20240103000009` — app_invites + RLS
- `20240103000011` — reserved_users
- `20240103000012` — messages.reactions JSONB + toggle_reaction
- `20240103000013` — profiles.custom_avatar, avatars bucket + RLS
- `20240103000015` — tightened chat-images INSERT policy
- `20240103000016` — avatars bucket 10MB limit, HEIC mime types
- `20240103000017` — profiles.avatar_storage_key
- `20240103000018` — crews.image_url + image_storage_key, crew-images bucket
- `20240103000019` — announcements
- `20240103000020` — profiles.first_name, last_name
- `20240103000021` — profiles.status (nullable, max 100 chars)
- `20240103000022` — polls + RPCs; polls in realtime
- `20240103000023` — squad_definitions + RLS + realtime
- `20240103000024` — squad_definitions UPDATE policy (creator-only)
- `20240103000025` — squad_definitions actual_word
- `20240103000026` — definition_suggestions + RLS + realtime (REPLICA IDENTITY FULL)
- `20240103000028` — client_errors table
- `20240103000031` — messages UPDATE policy; insert_message + p_image_url + p_image_blur_hash
- `20240103000032` — drop old insert_message overloads (ambiguous RPC fix)
- `20240103000035` — profiles.gem_balance + last_gem_claim, claim_daily_gem, profiles_protect_gem_columns trigger
- `20240103000036` — messages pin columns, messages_protect_pin_columns trigger, pin_message + unpin_message RPCs
- `20240103000037` — crews last_message_preview/at/sender_id denormalized columns, update_crew_last_message trigger (skips system msgs, out-of-order guard), backfill from messages, crews added to supabase_realtime publication
- `20240103000038` — profiles.last_active_at (timestamptz nullable), update_active() RPC (SECURITY DEFINER, updates own row only)
- `20240103000040` — board_sections table + RLS (view: crew members; insert: crew members; delete: creator); notes.section_id FK (ON DELETE SET NULL); notes UPDATE policy (creator only)
- `20240103000041` — combat system: `active_raids` combat columns (last_boss_attack_at, guard_user_id/expires_at, volley_expires_at); `crew_combat_members` table + RLS + realtime; `revive_tokens` table + RLS + seed; `init_combat_members`, `apply_boss_damage`, `use_revive_token` RPCs
- `20240103000042` — `active_raids` + `revive_tokens` added to supabase_realtime publication (required for Postgres Changes UPDATE events to fire on these tables)
- `fix_damage_raid_ambiguous_column` — damage_raid: qualify `active_raids.defeated_at` in WHERE clause to fix PL/pgSQL `42702: column reference is ambiguous` error; also updated `20240101000002` local file in-place
- `20240103000043` — Ability Bank system: drops `current_mp`/`max_mp` from `crew_combat_members`, adds `ability_bank (int default 0)`; replaces `init_combat_members` (removes MP fields); backfills existing rows from historical message counts
- `20240103000044` — Bank persistence: adds `crew_members.ability_bank (int default 0)`; backfills from historical eligible messages (text ≥5 chars or image, not exact repeat); syncs active raid rows; replaces `init_combat_members` to seed `ability_bank` from `crew_members.ability_bank`
- `20240103000045` — Stat boosts: adds `crew_members.stat_boosts (jsonb default '{}')` — persistent per-member stat boosts earned by defeating bosses (+1 random stat on victory); replaces `init_combat_members` to apply HP boost to `max_hp` on raid init; `attack-boss` reads boosts when computing `statsAtLevel`

Manual SQL applied directly:
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_dev boolean NOT NULL DEFAULT false;
UPDATE profiles SET is_dev = true WHERE id IN (SELECT id FROM auth.users WHERE email IN ('shenraymonds@gmail.com', 'legaspi.riley@gmail.com'));
ALTER TABLE crews ADD COLUMN IF NOT EXISTS is_dm boolean NOT NULL DEFAULT false;
ALTER TABLE crews ADD COLUMN IF NOT EXISTS dm_partner_1 uuid REFERENCES auth.users(id);
ALTER TABLE crews ADD COLUMN IF NOT EXISTS dm_partner_2 uuid REFERENCES auth.users(id);
-- get_or_create_dm fn + friendships table DDL: see git history 2026-06-04
```

## Code Rules
- TypeScript strict · server components default · `'use client'` for interactivity only
- Mobile-first 390px · game logic in Edge Functions · Realtime for live state
- Never hardcode constants · never expose `SUPABASE_SERVICE_ROLE_KEY` client-side
- Loading skeletons: `<DelayedSkeleton>` (300ms) · `bg-border animate-pulse` on `bg-black`
- Clean up Realtime on unmount · `cancelled` flag in async effects · RLS on every table
- Server fetching: `Promise.all` independent queries; session first, then queries
- `unstable_cache`: `createServiceClient()` inside; verify auth with cookie client first

## Supabase Type Rules
- Row interfaces must extend `Record<string, unknown>` (without it `.from()`/`.rpc()` returns `never`)
- **Never use `Omit<T, K>` on interfaces that extend `Record<string, unknown>`** — it collapses all named fields to `unknown`, breaking TypeScript inference on query builders. Always write a standalone `interface` with all fields explicitly listed instead.
- Table definitions must include `Relationships: []`
- All RPCs declared in `Database.public.Functions` with `Args` + `Returns` before use
- `supabase/` excluded from `tsconfig.json` (Deno imports incompatible)
- Query builder returns `PromiseLike` — async/await + try/catch only; no `.catch()` chaining

## Disabled Features
- Voice notes: UI removed; `XP_VALUES['voice']` + element `lightning` still defined server-side
- Image upload in chat: dev-only via `nexus_chat_camera`; upload logic + `chat-images` bucket fully functional

## Gotchas
- `CREATE OR REPLACE FUNCTION` only replaces if signature matches exactly. Adding/removing params creates a new overload — multiple all-DEFAULT overloads cause ambiguous RPC errors. Always `DROP FUNCTION` old signatures before recreating with a different param list.
- Optimistic messages carry `tempId: string` (client-only, never sent to server). The TanStack Virtual key is `message.tempId ?? message.id`. Reconciliation **must always** call `updateMessage(tempId, { id: raw.id })` in place — never `removeMessage(tempId)` on success. Removing and re-adding the message causes a virtualizer key swap, which discards the measured height and misaligns scroll position. Only `removeMessage(tempId)` on RPC error (rollback).
- `insert_message` RPC uses `auth.uid()` internally — returns `null` when called from a service role client. For server-side message inserts (e.g., dev panel `spawnBossAction`), use direct `service.from('messages').insert(...)` instead of the RPC.
- Vercel Hobby plan only allows daily crons (`0 0 * * *`). Sub-daily expressions like `*/30 * * * *` cause every deployment to fail with "Hobby accounts are limited to daily cron jobs." The `boss-attack` cron was removed from `vercel.json` for this reason. Trigger it from the dev panel or upgrade to Pro for sub-daily scheduling.
- **Combat HP/phase must come from system message INSERTs, not `active_raids` realtime UPDATEs.** The UPDATE events for `active_raids` arrive out of order relative to the system messages (network/processing jitter) and will overwrite the correct HP the system message just set. Keep the `active_raids` UPDATE handler strictly to guard/volley/timer fields (`guard_user_id`, `guard_expires_at`, `volley_expires_at`, `last_boss_attack_at`).
- **Don't use Framer Motion `animate={{ width }}` inside a TanStack virtualizer.** With `initial={false}`, Framer Motion has no prior width to interpolate from on first render (the item may not have been mounted before) and snaps to the target value instead of animating. Use a plain `<div>` with CSS `style={{ width: '${pct}%', transition: 'width 0.5s ease-out' }}` for progress bars inside virtualized rows.
- `init_combat_members` only creates `crew_combat_members` rows for users where `profiles.is_dev = true` AND `crew_members.class` is a combat class (`warrior|healer|archer|rogue|mage`). If a dev user has a chat class (e.g., `berserker`) they won't get a combat row and the HUD won't appear — update their `crew_members.class` to a combat class.
- **`RETURNS TABLE` in PL/pgSQL creates implicit output variables that shadow same-named table columns.** A function declared `RETURNS TABLE(..., defeated_at timestamptz)` introduces an implicit variable named `defeated_at` inside the function body. Any `WHERE defeated_at IS NULL` in a subsequent SQL statement becomes ambiguous (PostgreSQL `42702`). Always qualify table columns (`active_raids.defeated_at`) inside any function that uses `RETURNS TABLE`. This error is silently swallowed if the RPC caller only destructures `data` and ignores `error` — the function returns nothing and any fallback arithmetic in the caller uses a stale value.
