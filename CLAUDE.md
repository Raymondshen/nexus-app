# Nexus

Group chat RPG: messages → XP → boss fights → artifacts. Pixel art (RotMG style).

## Stack
Next.js 16 App Router · TypeScript · Tailwind · Framer Motion · Zustand · Supabase (Auth, Postgres, Realtime, Storage, Edge Functions) · next-pwa v5 · Vercel · @tanstack/react-virtual v3

Icons: `pixelarticons` — `import { X } from 'pixelarticons/react/X'` · `<X style={{ width, height, color }} />` · named exports only · never lucide-react in chat/home UI

Build: `next build --webpack` (Turbopack breaks next-pwa + proxy.ts)

## Database Tables
```
profiles            id, username (unique case-insensitive), first_name, last_name, avatar_class, avatar_url, avatar_storage_key, custom_avatar (bool default false), birthday, is_dev, coins (int default 0), gem_balance (int default 0), last_gem_claim (timestamptz nullable), status (text nullable ≤100 chars), last_active_at (timestamptz nullable), created_at
crews               id, name, invite_code (6 chars unique), level, total_xp, created_at, is_dm (bool default false), dm_partner_1 (uuid nullable), dm_partner_2 (uuid nullable), image_url, image_storage_key, background_image_url (text nullable), last_message_preview (text nullable), last_message_at (timestamptz nullable), last_message_sender_id (uuid nullable)
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
profile_photos      id, user_id, url, storage_key, created_at — max 30 per user; stored in `profile-photos` bucket
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
- Balance in `profiles.coins`; `chatStore.userCoins`; shown in `AccountPreview` (currency pill row: gems → coins → FXP heart) and profile hero glass badge

Friendship XP: 1pt per DM send or @mention · 10pt daily cap (local midnight, tracked in `friendship_xp_log` by `sender_id`) · `award-friendship-xp` edge function · **dev-gated: `nexus_friendship_xp`**
- `friendship_xp` cumulative bilateral XP; canonical pair `user_a < user_b`; realtime via `home-fxp-a:{userId}` + `home-fxp-b:{userId}` (channels only open when flag is ON)

Gems: 1/day on first message in any crew · `award-gem` edge function + `claim_daily_gem` RPC are sole authority — client never awards
- `profiles.gem_balance` + `last_gem_claim`; both blocked from client writes by `profiles_protect_gem_columns` trigger
- Client gate (`src/shared/utils/gems.ts`, idb-keyval `nexus_gem_claimed_at`): display/debounce only; checked in `ChatInput.send()` fire-and-forget

Boss: The Void at every 500 XP (`BOSS_XP_THRESHOLD`) · 48h window · 3 phases · defeat → artifact drop
- Artifact rarity roll: legendary 5% / epic 15% / rare 30% / common 50%
- Phase multipliers: 1→1.0×, 2→1.3×, 3→1.6× boss damage
- Boss attacks: phase 1/2 = every 2h, phase 3 = every 1h (Vercel cron removed — trigger via dev panel)
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
**Stat boosts**: each player earns +1 to a random stat (`hp`, `atk`, `dex`, `def`, `int`) on boss defeat — persisted in `crew_members.stat_boosts` (jsonb). Boosts are additive after level scaling: `stat = round(base × scale) + boost`. HP boost applied at raid init via `init_combat_members`; all others in `statsAtLevel` in `attack-boss`. `COMBAT:stat_up:{username}:{stat}` system messages announce boosts.
Rogue momentum: +5% ATK per stack (cap 25%, max 5 stacks), resets on Backstab, decays if >1h since last message
Passives: warrior Last Stand (+20% dmg when HP < 30%) · healer Second Wind (+15% to all healing; `@mend = int×1.5×1.15`, `selfHeal = dmg×0.0575`) · archer Precision (high DEX = highest crit chance) · rogue Momentum (see above) · mage Arcane Ward (DEF×1.3 while HP < 40%)

Leveling: `xpForLevel(n) = round(120 × 1.0435^(n-1))` · `LEVEL_CAP = 100` · constants in `src/shared/constants/config.ts` · 5 tiers every 20 levels: Rookie → Adventurer → Veteran → Elite → Mythic

Elements: fire=<20 chars · water=>150 chars · lightning=voice · nature=images · shadow=reactions · arcane=daily/system

Combat Classes (stored in `crew_members.class`): warrior · healer · archer · rogue · mage

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

Error copy: invalid → "The Nexus does not recognize this code." · used → "This code has already been claimed." · generic → "The rift destabilized. Try again."

### Onboarding
`name → /onboarding/birthday → /onboarding/class → /onboarding/welcome → chat/crew`
- Class guard on `crew_members.class`, NOT `profiles.avatar_class` (global caused redirect loops)
- `selectClassAction` → welcome ONLY when `crew_members` count = 1
- Welcome screen: marks invite used + 50 seed coins + `recruit_arrived` push to inviter

## Dev Mode
`profiles.is_dev = true` — grant: `UPDATE profiles SET is_dev = true WHERE id IN (SELECT id FROM auth.users WHERE email = '...')`

Dev section in `/profile/developer`: Announcements · Push Diagnostics (`nexus_push_diag`) · Infinite Coins (`nexus_infinite_coins`) · Spawn Boss Mode (`nexus_dev_mode`) · Chat Camera (`nexus_chat_camera`) · Poll Feature (`nexus_poll_feature`) · Friendship XP System (`nexus_friendship_xp`) · Pin Feature (`nexus_pin_feature`) · Reset Gem Cooldown · AFK Exp (`nexus_afk_exp`) · Reset Friendship XP
- Combat Testing panel: crew picker + 7 actions — Spawn Boss, Force Phase 2, Force Phase 3, End Raid, Down Yourself, Add Revive Token, Reset Combat
- Server actions in `src/app/(app)/profile/developer/actions.ts`: `spawnBossAction`, `forceRaidPhaseAction`, `endRaidAction`, `selfDownAction`, `addReviveTokenAction`, `resetCombatAction` — all protected by `requireDev()`
- `DeveloperClient` receives `userCrews: { id: string; name: string }[]` prop; fetched via nested select `crew_members → crews(id, name, is_dm)`, DM crews filtered out

Server-side (`award-xp`): boss spawn + `LEVEL_UP:` only when `isDevUser = true`
Client-side (`localStorage.nexus_dev_mode === '1'`): `MessageList` hides boss/artifact/level-up system msgs + cards; `ChatInput` hides DamageFloat + RAID ACTIVE indicator

## Storage Keys

sessionStorage: `nexus-msgs-{crewId}` (envelope `{ messages: MessageWithProfile[], savedAt: number }`, 50 msg cap) · `nexus_chat_from` (`'/home'`)
IndexedDB (idb-keyval): `nexus-msgs-{crewId}` — same envelope as sessionStorage; survives iOS PWA kill/relaunch where sessionStorage is cleared

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
| `nexus_friendship_xp` | `'1'` |
| `nexus_poll_feature` | `'1'` |
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
│   │   ├── components/         CombatHUD, CombatLog, AbilityButton, DamageFloat
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
│       ├── components/         NotesGrid, AccountPageMember, VibesGrid, PhotosGrid
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
│       ├── banners/            TickerBanner, AnnouncementBanner, GuestBanner
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

### File Ownership Rules
- `app/(app)/*/page.tsx` — server components only; import Client screens from `features/`
- `app/(app)/*/actions.ts` — server actions stay colocated with their route in `app/`
- `features/{domain}/` — owns its screens, components, hooks; feature-specific code stays inside
- `shared/` — only code reused by 2+ features; never feature-specific logic
- `store/` — chatStore + combatStore stay here because both are used across multiple features
- `src/proxy.ts` — Next.js middleware; never rename or duplicate as `middleware.ts`
- Types: all sub-files re-exported from `src/types/index.ts` — import from `'@/types'` everywhere

### Realtime / Messaging
- Channel `messages:{crewId}`: broadcast (sender→instant) + Postgres Changes INSERT (backup) + presence (typing only)
- `addMessage` deduplicates by id; broadcast payload has no profile (resolved from `profilesRef`)
- XP sync: sender `addXP(n)` optimistic → `setCrewXP(data.new_total_xp)` → broadcasts `xp_update`; receivers `receiveXP(earned, newTotal)`; dedup by `sender_id`
- **Presence**: timestamp-derived. Authority = `profiles.last_active_at`; online = `last_active_at > now() - 45s`. Heartbeat: `update_active()` RPC every 30s (foreground only) + broadcasts `{ event: 'active', user_id, ts }`. Staleness sweep: `sweepOnlineUserIds(45_000)` every 15s (pure local, no network). `chatStore.lastActiveMap: Record<userId, timestamp_ms>`.
- Typing: Supabase Presence (`ch.track({ username, typing })`) — NOT used for online status

### MessageList
- **Virtualization**: `useVirtualizer` (absolute-position, `measureElement`, `overscan: 5`). `getItemKey` uses `message.tempId ?? message.id` — `tempId` keeps the virtualizer key stable through optimistic→real reconciliation.
- **Initial load** (three-tier cache):
  1. `useBrowserLayoutEffect` reads sessionStorage `nexus-msgs-{crewId}` synchronously → instant render if present (same-session navigation)
  2. `useEffect` checks cache envelope `savedAt`: if < 30s old → skip DB fetch entirely (Realtime delivers any delta); if sessionStorage is empty → reads IDB (survives iOS PWA kill, ~5ms async) → shows cached messages, then proceeds to DB fetch to merge
  3. DB fetch (when needed): newest 50 messages, merged with in-flight Realtime msgs; result written to both sessionStorage and IDB
  - `setMessages([])` before load prevents crew bleed
- **Definitions fetch**: resolves creator usernames from `profilesRef.current` (already-loaded member profiles) first; only queries DB for creators who left the crew — eliminates the sequential profile round-trip in the common case
- **Cursor pagination**: scroll-up within 120px → `fetchOlderMessages` — keyset `WHERE created_at < cursor ORDER BY created_at DESC LIMIT 50`; batches prepended via `chatStore.prependMessages`
- **Scroll restoration after prepend**: capture `scrollTop` + `virtualizer.getTotalSize()` before prepend; in `useBrowserLayoutEffect` set `el.scrollTop = prevScrollTop + (newTotalSize - prevTotalSize)`
- **Display items**: single merged `useMemo` pass returns both `groupXPMap` and `groupCoinMap`; builds typed `DisplayItem[]` — `spacer | empty | divider | boss | artifact | level_up | message`; group leader gets `xpOverride` / `coinOverride`. System messages starting with `COMBAT:` or `BOSS_SPAWN:` always skipped — shown in `CombatLog` inside HUD.
- Postgres Changes UPDATE: patches `content` (edit propagation), `xp_awarded`, `element_type`, pin fields; skips `reactions:{}` when local has reactions (award-xp race)
- **Combat HP/phase source of truth**: system message INSERTs patch combatStore (`COMBAT:attack/volley/backstab/cast` → `patchRaid({ current_hp })`; `COMBAT:phase` → `patchRaid({ phase })`; `COMBAT:victory/escaped` → `setActiveRaid(null)`). More reliable than `active_raids` UPDATEs which arrive out of order.

### MessageBubble — text rendering
`renderMessageContent` — splits on `@username` tokens, then `renderWithLinks` + `renderWithDefinitions` on each segment. Early returns for `message_type === 'system'` and `'poll'`.

Avatar images (32px primary, 16px reply) use `avatarImageLoader` — forces 1:1 square crop for consistent circle fill across all user avatar types.

Reply row: `CornerDownRight` icon uses `var(--color-tertiary)` (muted). Reply avatar is 16×16 with `object-cover` + `avatarImageLoader`.

Long-press sheet (500ms / right-click) → emoji quick-pick + Edit Message (own `text`-type messages only) + Reply + Copy Text + Pin (admin only). `PinDurationSheet` portal opens when pin tapped.

OG previews: `extractFirstUrl` → `useOGPreview` hook → `<LinkPreviewCard>` below body; text-only messages without `image_url` only.

### Swipe-to-reply
Only fires on `!isOwn` messages. Swipe left past `SWIPE_THRESHOLD` (64px) to commit.

**DOM structure**: outer `relative flex` container holds the reply icon (`position: absolute, right: 8`) and a **slide wrapper** (`ref={contentRef}, data-group={groupId}`) that contains both the avatar and message content. All transforms go on the slide wrapper so avatar and text always move together.

**Group slide**: `MessageList` computes a `groupId` (the first message's ID in each consecutive same-user run within 60s) and passes it to each `MessageBubble`. On `touchstart`, all `[data-group="${groupId}"]` elements in the DOM are queried once into `groupElsRef` (cache per gesture). `applyGroupTransform(x)` iterates that list — every message in the group slides as a unit.

**Reply icon animation**: hidden for the first 30% of the swipe. From 30–100% a quadratic ease (`delayed²`) drives opacity 0→1 and scale 0.5→1.0, combined with a 0.1s CSS ease-out transition to smooth micro-jitter. Snap-back on release uses 0.22s ease-out.

**Reply state scoping** (`chatStore`): `replyTo` + `replyGroupId` are set atomically by `setReplyTo(msg, groupId?)`. When a drag is confirmed on a message from a different group (`replyGroupId !== groupId`), the existing reply is cleared immediately so the reply bar never shows stale state from an unrelated group. Both `touchend` and `touchcancel` fire `setReplyTo` on commit so iOS gesture interrupts never drop the reply.

**Navigation cleanup**: `chatStore` is a module-level singleton — `replyTo` survives route changes unless explicitly cleared. `ChatInput` has an unmount-only `useEffect` (`[]` deps, cleanup only) that calls `setReplyTo(null)`, so the reply bar is always zeroed when leaving a chat. The reply bar cancel button is 32×32 touch target (icon remains 16×16) with `marginRight: -8` to stay visually flush.

### ChatInput
- Props: `{ crewId, userId, userProfile, memberProfiles, crewName, inviteCode?, creatorId?, isDM?, crewImageUrl?, crewBackgroundImageUrl? }`
- Send flow: `addMessage(optimisticMsg)` synchronously (with `tempId`) → `insert_message` RPC → reconcile: `updateMessage(tempId, { id: raw.id })` in place (never remove-and-reinsert) → broadcast → `award-xp` → `attack-boss`; on RPC error `removeMessage(tempId)` rollback
- **Edit mode**: `chatStore.editTo` holds the message being edited. Set by `MessageBubble` long-press → "Edit Message" in `ChatSheetReact`; cleared on send, cancel, or unmount. `handleEditSend`: optimistic `updateMessage(id, { content })` → `supabase.from('messages').update({ content }).eq('id').eq('user_id', userId)`; rollback to `prevContent` on error. No-op if content unchanged. Edit bar UI rendered above reply bar when `editTo` is set (`MagicEdit` 16×16 + "Editing message" label + `Close` dismiss button). Send button and Enter key both route to `handleEditSend` when in edit mode. Only `text`-type messages are editable — image/GIF messages are excluded.
- Input row (inactive): `GifIcon` 24×24 + `Attachment` 24×24 outside border box, 16px gaps; border `#27272a`. Focused: icons slide out (`width→0`), border → `--color-purple`. When `nexus_poll_feature` is ON, a third `Chart` 24×24 icon appears (width→104, else 64).
- Photo upload: `Attachment` icon always visible; tapping directly triggers `chatImageInputRef.current?.click()` — no dev gate. Preview bar shows whenever `chatImageLocalUrl` is set.
- Poll feature: dev-gated (`nexus_poll_feature`). When enabled, `Chart` icon appears in left group; tapping opens `PollCreatorSheet`. Toggle in `/profile/developer` Features section.
- **Hybrid input/textarea**: renders `<input>` by default; swaps to `<textarea>` (3-line cap) when text width exceeds container. Detected via hidden `<span ref={mirrorRef}>` measured against `innerContainerRef`. `isMultiline` state + `isMultilineRef` kept in sync; `useLayoutEffect([isMultiline])` focuses new element and restores caret in same paint. `getActiveField()` / `focusField()` abstract over both refs.
- @mention overlay: transparent field + `aria-hidden` div; purple `<mark>` for valid tokens; scroll synced on `isMultiline` change
- **Klipy API** (`src/app/api/gif/route.ts`): trending (`/web/common-trending`) → items in `data.clips[]` with flat `file.thumbnail_url`; search (`/web/gifs/search`) → items in `data.data[]` with nested `file.sm/md/hd/xs` sub-objects. Use separate parsers (`parseClipItem` / `parseSearchItem`) — do NOT unify.
- Combat is always-on: `callAttackBoss` fires after every send; `active_raids` UPDATE handler patches only `guard_user_id`, `guard_expires_at`, `volley_expires_at`, `last_boss_attack_at` — never `current_hp` or `phase`
- `AbilityButton` renders when `!isDM && userCombatClass && hasJoinedRaid`; prop `username` required
- Background image upload: hidden `crewBgInputRef` → `resizeImageToBlob(file, 1080, 608)` → `crew-images/{crewId}/bg-{ts}.webp` → `updateCrewBackgroundImageAction` → passes updated URL + `onUploadBackground` callback to `SquadDetailsSheet`

### Pin Feature (dev-gated: `nexus_pin_feature`)
- Admin = crew member with earliest `joined_at`; cap = 5 active pins per crew (`PIN_MAX_PER_CREW`)
- `pin_message` / `unpin_message` RPCs only — `messages_protect_pin_columns` trigger blocks direct client writes
- `PinDurationSheet`: message preview + duration `<select>` (7 presets: 15 min → Permanent; `ChevronRight` rotated 90°) + "PIN IT" button (h-48 bg-purple)
- `PinListSheet`: lists pins; admin-only row = "Unpin message" (red) + "Display" toggle (40×24px, purple ON / #71717a OFF)
- `FloatingBackButton`: `Note` icon (count badge) + ticker strip; ticker filters `hiddenPinIds`; tapping scrolls to first visible pin
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

**MessageList combat wiring** (`parseCombatEvent` + `parseDamageFloat`):
- `parseCombatEvent(content, messageId?, messageTs?)` — uses actual `id` + `created_at` for dedup across realtime and replay paths
- On `postgres_changes INSERT` for `message_type === 'system'`: → `combatStore.addCombatEvent(event)` (cap 200); → `combatStore.spawnDamageFloat(...)` for attack/volley/backstab/cast; float x = `window.innerWidth * 0.5 + (Math.random() * 80 - 40)`, y = `window.innerHeight * 0.65`
- **Combat log replay**: after initial DB fetch, filters system messages from `raid.started_at` onward → `combatStore.replayCombatEvents(events)` — persists log across page loads

**combatStore** (`src/store/combatStore.ts`):
- State: `activeRaid | null`, `memberStats: Record<userId, CombatMember>`, `combatEvents: CombatEvent[]` (cap 200), `reviveTokens: number`, `damageFloats: DamageFloat[]`
- Patches: `patchRaid`, `patchMemberHP`, `patchMemberBank`, `patchMemberMomentum`, `setAllMembers`
- Events: `addCombatEvent` (append, cap 200) · `replayCombatEvents` (merge by id, sort by ts) · `clearCombatEvents`
- Floats: `spawnDamageFloat` / `removeDamageFloat`

**Components** (`src/features/combat/components/`):
- `AbilityButton` — prop `username: string` required; shows "Cost: 2" + bank count; disabled when `ability_bank < 2`; returns `null` when `!activeRaid || !member`
- `CombatHUD` — always-visible red marquee banner; tap toggles expanded panel below. Panel: boss name + last dmg · next attack timer + expiry · `CombatLog` · member HP list. Props: `currentUserId`, `crewId?`, `isDevUser?`, `memberProfiles?`. Placed between `MessageList` and `ChatInput`; `flex-shrink-0`.
- `CombatLog` — virtualized `CombatEvent[]` feed inside HUD expanded section; returns `null` when empty
- `DamageFloat` — `position: fixed` viewport overlay; spawned per attack event

### SquadDetailsSheet (`src/features/chat/components/sheets/SquadDetailsSheet.tsx`)
Trigger: swipe-up · z-[70] · `maxHeight: 85vh`
- Header icons: `MagicEdit` (rename, creator only) · `Bell` (notifs) · `Library` (→ definitions) · `ChevronRight` rotated 90° (close)
- Member row: `User` 16×24 (profile) · `MailRight` 16×24 (DM, hidden own row) · `UserMinus` 24×24 red (remove, creator only)

`SquadDetailsEditSheet` — triggered by `MagicEdit`, z-[80]/z-[81], `maxHeight: 90vh`
- Header: eyebrow (silkscreen mini tertiary) + title (DM Sans Bold md) + subtitle (DM Sans Light xs tertiary)
- "Squad Card Preview" label (DM Sans Medium sm) + 180px live group header preview: background image fill + gradient overlay, crew avatar/initial, crew name (DM Sans Black), member count, XP text + progress bar; CSS `transition: width 0.5s ease-out` on bar (NOT Framer Motion)
- Side-by-side upload buttons (flex row, gap 16): "Profile Photo" + "Background Image", each `h-48` with purple border, `Upload` 16×16 purple + "Upload" silkscreen text
- Squad Name input: `bg-[var(--color-surface-sheet)] border border-[var(--color-border-hover)] h-[48px] p-[12px]`
- "Save Changes" (bg-purple + `boxShadow: '4px 4px 0 rgba(168,85,247,0.5)'`) + "Cancel" (red border) — native buttons
- Props: `crewName`, `memberCount`, `crewImageUrl`, `crewBackgroundImageUrl`, `crewXP`, `xpProgress`, `totalMessages`, `onUploadPhoto`, `onUploadBackground`, `onSave`, `onClose`

### InboxClient (`src/features/friends/screens/InboxClient.tsx`)
Single-row `InboxCardPreview`: avatar 48px · DM Sans Bold name · status subtitle
- Incoming: green `Check` 16×16 + red `Close` 16×16 inline
- Outgoing: red-bordered `Close` 16×16 inline (no fill)

### TickerBanner (`src/shared/components/banners/TickerBanner.tsx`)
Single variant only — no pinned or multi-item mode. Props: `text: string`, `icon: React.ReactNode`, `quoted?: boolean`.
- Container: `overflow-hidden border-t border-b border-border px-2`, `paddingTop/Bottom: 12px`
- Each scroll unit: `[icon][gap 4px][text]` + `Dot` separator (2×2px `#d9d9d9`, `border border-border-hover`, `marginLeft/Right: 8px`)
- Text: `font-silkscreen --text-xxs var(--color-secondary) leading-none`
- Copy count + `animPx` computed via `useLayoutEffect` on `text` change; duration = `Math.max(21, text.length * 0.28 + 15)`
- Used in: `ProfileClient` + `AccountPageMember` (status ticker) · `AccountPreview` in `HomeClient` (status ticker at card bottom)

### HomeClient
- Realtime: single `postgres_changes UPDATE` on `crews` (`home-crews-preview`) + `postgres_changes UPDATE` on `profiles` + two friendship XP channels (`home-fxp-a/b:{userId}`)
- Last-message preview from denormalized `crews.last_message_preview/at/sender_id` — no `messages` join on home load
- Optimistic preview: `homePreviewCache.ts` consume-once Map; `ChatInput` writes on send, `HomeClient` reads before first render
- Auto-sort by `lastMessage.created_at` desc; Framer Motion `layout` animates
- `SheetView` union: `'menu' | 'create' | 'join' | 'class'`; `'class'` is the post-join class picker
- Join flow: `handleJoin` → `joinCrewFromHomeAction` (returns crew info + memberCount) → `view === 'class'` with class picker sheet; `handleClassJoin` → `joinSelectClassAction(crewId, cls)` (no redirect) → `router.push('/chat/...')`
- `joinSelectClassAction` in `src/app/(app)/home/actions.ts`: updates `crew_members.class`, revalidates tag, returns `{ ok: true }` — client controls navigation
- Group chat list section: label = "Group chat" (font-silkscreen text-xs primary); card gap = 20px; label-to-list gap = 20px

### HomeCrewDetailsSheet (`HomeClient`)
Triggered by long-press (500ms) **or swipe-left** (past `SWIPE_OPEN_THRESHOLD = 40px`) on a crew card. Standard bottom sheet pattern (z-[60]/z-[70], spring 320/32, drag-to-dismiss). Swipe-left uses `dragConstraints={{ left: 0, right: 0 }}` + `dragElastic={{ left: 0.25 }}` for rubber-band feel; snaps back on release regardless of distance, opens sheet only when `offset.x < -40`. Leave squad is **only** accessible inside this sheet — there is no swipe-to-reveal leave button.

Layout (flex col, `max-h: 85vh`, `overflow-hidden`):
1. **Group header** (180px, `flex-shrink-0`) — background image + `linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.604) 33%, rgba(0,0,0,0.6) 66%, rgba(0,0,0,0.8) 100%)` overlay; top row: 40×40 crew image + crew name (DM Sans Black md secondary uppercase) + member count (Silkscreen mini secondary) | ChevronRight rotated 90° close; bottom: XP text (Silkscreen mini) + 4px progress bar (bg-purple)
2. **Invite card** (`flex-shrink-0`, px-4 pt-4) — `bg-surface border border-border`, p-16; label "Invite new members" (Silkscreen mini primary); code: Silkscreen xl, gradient `from-[#a855f7] to-[#d946ef]` + `textShadow: '0px 0px 3px #a855f7'`; purple "Copy Code" button (py-12 px-16, shadow, toggles green "copied" on click)
3. **Members label** (`flex-shrink-0`, px-4 pt-4) — "Members" Silkscreen xs primary
4. **Member list** (`flex-1 overflow-y-auto nexus-scroll`, px-4 pt-4, `min-h-0`) — only scrollable region; gap 20px between rows
5. **Leave Squad** (`flex-shrink-0`, px-4 pt-4, pb-safe-area/28px) — full-width h-48 border-red button, `/icons/leave-pixel.svg` 16×16 + "leave squad" Silkscreen xs red

`HomeSquadMemberRow`: 32px circular avatar + `<PixelSprite spriteId nativePx scale={1} animate />` (walk cycle, 180ms/frame, pixel-bob) + name column (DM Sans Bold md primary + `Crown` 12×12 `#f59e0b` if `isCreator`) + subtitle (Silkscreen mini secondary: class · msg count). Creator = member with earliest `joined_at` (fetched in the same query); determined via O(n) reduce on `rawMembers`.

### Page Transitions (`src/app/layouts/SlidePage.tsx`)
- Enter: spring 380/36; skipped on back-nav via `_skipNextSlideEnter` module flag
- Exit: ease-in 150ms; `goBack()` fires `router.replace/back` **simultaneously** with the animation start — the chat page is `position:fixed` so it overlays the previous page while sliding, giving the destination 150ms of free loading time. Swipe-to-close uses the same pattern.
- `nativeSwipe`: no touch handlers; `useSlideBack()` — use instead of `router.back()`

### DM — `/dm/[friendId]`
Server: verifies friendship → `get_or_create_dm(friendId)` → renders chat. `DMOverlayBack`: initializes `setCrewXP` + `setActiveRaid`; updates `last_seen` every 60s

### award-xp
- Batch 1 (parallel): prev msg gap + crew data + sender `is_dev` + other members
- Anti-spam: gap < 5s → 0 XP, 0 coins
- Notifications fire-and-forget BEFORE XP writes — do NOT add early returns before notification block

### Reactions
- `messages.reactions` JSONB: `{ emoji: [userId,...] }`, empty arrays pruned
- `handleReaction`: optimistic → `supabase.functions.invoke('react-to-message')` → apply `data.reactions`; rollback only on `FunctionsHttpError`
- `react-to-message` returns `{ reactions, hype_man_heal, heal_amount }`; Hype Man +5 XP float

### Polls
`message.content = 'POLL:{pollId}'` · `polls` in supabase_realtime · `create_poll` RPC · `vote_on_poll` one toggleable vote · always `showHeader = true`; 0 XP

### Board (`/profile` → BOARD tab · `/chat/[crewId]/member/[userId]`)
- Crew-scoped link cards. `notes` table stores cards; `board_sections` stores named groupings.
- `NotesGrid` (`src/features/profile/components/NotesGrid.tsx`): all board UI. Props: `{ viewerId, initialNotes, initialSections, crews, initialCrewId, lockCrew? }`. `lockCrew={true}` hides switcher (squad member profile).
- Actions in `src/app/(app)/profile/notes/actions.ts`: `addNoteAction`, `fetchMoreNotesAction`, `deleteNoteAction`, `moveToSectionAction`, `fetchCrewBoardAction`, `createSectionAction`, `deleteSectionAction`
- Long-press (500ms) → `CardActionSheet`: Open Link · Remove Note (creator) · Move to Section
- `AccountPageMember`: nav bar (back + username) + `NotesGrid` only — no hero, no stats

### Photos (`/profile` → PHOTOS tab)
Photo gallery. `PhotosGrid` (`src/features/profile/components/PhotosGrid.tsx`).
- Upload: `resizeImageToBlob(file, 800, 800)` → WebP 0.85 → `profile-photos` bucket; max 15 MB input, max 30 photos
- Display: `next/image` + `supabaseImageLoader`, `sizes="(max-width: 480px) 33vw, 160px"` — Supabase render API serves grid-sized thumbnails
- "View Photo" opens the raw storage URL in a new tab (full 800×800 WebP)
- **Long-press** (500ms) → `PhotoActionSheet` — "View Photo" · "Remove Photo" (owner only). `deletePhotoAction` fire-and-forget (optimistic remove)
- Actions: `addPhotoAction(url, storageKey)` · `deletePhotoAction(photoId)` — in `src/app/(app)/profile/actions.ts`
- Rows of 3 (`flex gap-4`); incomplete rows padded with `flex-1` spacers; `AddPhotoCell` dashed tile at end when owner and under limit

### Vibes (`/profile` → VIBES tab)
Music link cards shown as spinning vinyl discs. `VibesGrid` (`src/features/profile/components/VibesGrid.tsx`).
- Only YouTube, Spotify, Apple Music, SoundCloud URLs accepted (`MUSIC_DOMAINS` set + `isMusicUrl`)
- `VinylTrack`: outer container `flex-1 min-w-0 overflow-hidden` with explicit `height: 105` so all vinyl containers match regardless of pin state. Inner 105×105 disc (`borderRadius: 56`) with album art + 8×8 center hole (`bg-background, border-border`) + glass label (`absolute bottom-0 left-0 w-full p-8`) with silkscreen 8px title truncated.
- **Ambient glow**: pinned vinyl only — `absolute inset: -13px` blurred art behind the disc; clipped at outer container bounds (`overflow: hidden`).
- **Long-press** (500ms, owner only) → `VinylActionSheet` — "Open Link" · "Pin as Favorite" / "Unpin" · "Remove Vibe" (red, owner only). Remove calls `deleteNoteAction` optimistically; clears pin if removed vinyl was pinned.
- **Pin**: pinned ID stored in `localStorage` (`nexus_vibes_pinned`). Pinned vinyl always sorted to index 0 via `orderedVinyls` (`useMemo`). Only pinned disc gets `animate-vinyl`. Toggling via `handleTogglePin` in `VibesGrid`.
- Props: `VibesGridProps { initialVinyls: PublicNote[], crews, isOwner }` — callers pass their `initialNotes` data as `initialVinyls`.
- `AddSlot`: same circle dimensions, dashed border, pixel + icon centered
- `AddVibeSheet`: standard bottom sheet; validates URL → `addNoteAction` → prepends to grid
- Rows of 3 (`flex gap-8`); incomplete rows padded with `flex-1` spacers

### Squad Glossary (`/chat/[crewId]/definitions`)
`word` stores comma-separated aliases; UNIQUE INDEX `(crew_id, lower(word))`; blue highlight spans, `\b` regex `gi`, sort aliases by length desc
- Suggestion flow: non-creator → `SuggestDefinitionSheet`; creator → `ReviewSuggestionSheet`; realtime on `definition_suggestions` (REPLICA IDENTITY FULL)

### Pixel Sprites
`public/sprites/{spriteId}/{direction}.png` · 8 directions · 24×24px · plain `<img imageRendering: pixelated>` (never `next/image`) · `maxWidth: 'none'` required

### AccountPreview (`HomeClient`)
Card: `bg-[#111] border border-border rounded-[8px] overflow-hidden pt-4 pb-0 gap-4 flex-col`
- Details row (`px-4`): avatar 48×48 rounded-full · name/stats column (flex-1) · `ChevronRight` 24×24
- Stats line: "Lifetime msg: {totalMessages}" — silkscreen mini tertiary
- Username: DM Sans Bold xl, primary
- Currency pills (left→right): `DiamondGem` 12×12 purple + gradient text → dot → `TokeCircle` 12×12 coins → (FXP gate) dot + `Heart` + gradient text
- Single full-width invite button (`px-4`): `bg-purple`, `Copy` icon 12×12, `boxShadow: 4px 4px 0 rgba(168,85,247,0.5)`
- `TickerBanner` flush at card bottom (no px padding wrapper — fills card width)

### SquadCardPreview (`HomeClient`)
Container: `flex items-center gap-4 h-12 w-full`
- **Group photo** (left): `bg-primary` white `48×48` non-interactive box — crew image or initial letter in black
- **Details column** (flex-1, 3 rows, gap-2):
  - Row 1: `lv. {crew.level}` · 2px dot · `Total MSG. {crew.total_xp}` [unread only: · dot · `+N unread msg` in `var(--green)` flex-1]
  - Row 2: crew name (DM Sans Bold md, primary, flex-1 truncate) + timestamp (DM Sans Light xs, muted, shrink-0) — timestamp only when `lastMessage` exists
  - Row 3 (state-based):
    - **default** (no message): muted, regular — "Your party's journey begins here."
    - **active** (read): secondary, regular — last message content
    - **unread**: primary, **medium weight** — last message content

### AnnouncementBanner
Below `AccountPreview` · `bg-[var(--color-blue)]/10 border border-[var(--color-blue)]` · swipe `'x'`, `dragElastic 0.15`, 40px threshold · pagination dots for 2+ banners

## Caching

Server (`unstable_cache` via `createServiceClient()` — NOT `createClient()`):
| Cache | TTL | Tag | Invalidated by |
|---|---|---|---|
| Home profile | 60s | `profile:{userId}` | saveBirthdayAction, revalidateProfileAction, updateAvatarAction |
| Home member profiles + counts | 300s | `crew-members:{crewId}` | joinCrewAction, leaveCrewAction, updateAvatarAction |
| Home friend profiles | 300s | `profile:{friendId}` | revalidateProfileAction, updateAvatarAction |
| Home friendships | 300s | `friends:{userId}` | sendFriendRequestAction, acceptFriendRequestAction, removeFriendAction |
| Active announcements | 300s | `announcements` | all announcement CRUD actions |
| Vault crew + artifacts | 300s | `vault:{crewId}`, `artifacts:{crewId}` | TTL only |
| Chat member profiles | 300s | `crew-members:{crewId}` | joinCrewAction, leaveCrewAction |
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
- `manifest.json` `start_url: "/home"` — avoids 2-hop redirect chain (`/ → /onboarding → /home`) on icon launch
- `globals.css`: `touch-action: manipulation` on `button, a, [role="button"], label, select, summary` — eliminates 300ms iOS tap delay
- **sw-push.js caching** (in addition to push handling):
  - `nexus-pages-v1` — StaleWhileRevalidate for app navigation (`/home`, `/chat/`, `/vault/`, `/friends`, `/profile`, `/dm/`): serve cached HTML instantly on background-resume, update cache in background. Auth redirects (non-`ok`) are never cached. Bump version string to purge on breaking deploys (activate handler auto-purges old versions).
  - `nexus-static-v1` — CacheFirst for `/_next/static/` (content-addressed, immutable URLs safe to serve forever)
  - `nexus-images-v1` — CacheFirst for Supabase Storage chat images / backgrounds
- `sw.js` (workbox, generated by next-pwa) is **never registered** — `SWRegister` only registers `sw-push.js`. The `runtimeCaching` rules in `next.config.ts` are dead code. All caching is in `sw-push.js`.
- Strip `badge` from `showNotification` (iOS rejects); notification `tag` must be unique per notification (`-{timestamp}`)
- Subscribe: INSERT only, no delete-first; `23505` = success; on failure auto-unsubscribe + fresh APNs token
- VAPID vars in Supabase Edge Function secrets; `VAPID_SUBJECT` must be `mailto:` URI
- Debugging: 401 = deployed without `--no-verify-jwt`; `expired_deleted` = APNs 410'd → FORCE RESUB

## Images
- `next/image` everywhere with `loader={supabaseImageLoader}` for general Supabase storage images
- **Avatar images must use `avatarImageLoader`** (`src/shared/supabase/imageLoader.ts`) — forces square 1:1 output: Supabase render API gets both `width` and `height` (same value) so non-square sources are center-cropped; Google photo URLs get the `-c` square-crop suffix at the correct size. Use on all person/user avatar `<Image>` elements; never use `supabaseImageLoader` for avatars. The shared `Avatar` component (`src/shared/components/ui/Avatar.tsx`) already uses this. Files that render both person avatars AND crew/event images must import both loaders (`import { supabaseImageLoader, avatarImageLoader } from ...`).
- Non-avatar images use `supabaseImageLoader`: crew images (`crew.image_url`), crew backgrounds, event covers, photo grid, OG link previews — anything that is not a person's face.
- Plain `<img>`: pixel sprites · crop target · hero backgrounds in `ProfileClient.tsx` · Vibes OG thumbnails (external URLs, not Supabase storage)
- Avatar upload: `AvatarUploadModal` → `react-image-crop` → canvas → 128+256px WebP → bucket `avatars`; `process-avatar` edge fn → 64/128/256px AVIF; `custom_avatar = true` blocks Google photo overwrite
- Crew background image: `resizeImageToBlob(file, 1080, 608)` → `crew-images/{crewId}/bg-{ts}.webp`; `updateCrewBackgroundImageAction` stores public URL in `crews.background_image_url`
- Profile photos: `resizeImageToBlob(file, 800, 800)` → WebP 0.85 → `profile-photos` bucket; displayed via `next/image` + `supabaseImageLoader`
- `resizeImageToBlob(file, w, h)` in `src/shared/utils/imageCompress.ts`: center-crop canvas → WebP 0.85 quality; used for crew profile 256×256 and background 1080×608

## Design Tokens (`src/app/globals.css`)
Colors: `--color-primary` · `--color-surface` · `--color-border` · `--color-purple` · `--color-blue` · `--color-tertiary` · `--color-secondary` · `--color-paper-150`

Game/chat: `--color-bg-chat` (#0a0612) · `--color-chat-purple` (#bf5fff) · `--color-xp` (#ffd700) · `--color-coins` (#f59e0b) · `--color-danger` (#ff4444) · `--color-success` (#66bb6a) · `--color-system-msg` (#1a0d2e)

Figma aliases: `--red` (#ef4444) · `--green` (#22c55e) · `--yellow` (#f59e0b) · `--purple` · `--blue` · `--xN` spacing (x1=2px … x7=24px)

Fonts: `font-pixel` = Press Start 2P · `font-body` = DM Sans · `font-silkscreen` = Silkscreen (`--font-silk`)

Font sizes: `--text-mini` (8px) → `--text-xxl` (24px) · Spacing: `--space-*`

Icons (`pixelarticons`):
| Location | Component | Size |
|---|---|---|
| Back buttons | `ChevronLeft` | 24×24 |
| Expand/collapse | `ChevronRight` (rotated) | 24×24 |
| PinDurationSheet dropdown | `ChevronRight` (rotated 90°) | 16×16 |
| Chat nav — notifs | `Bell` / `BellOff` | 24×24 |
| Chat nav — pins | `Note` | 24×24 |
| Chat nav — glossary / SquadDetailsSheet header | `Library` | 24×24 |
| SquadDetailsSheet — edit squad (creator) | `MagicEdit` | 24×24 |
| SquadDetailsSheet — member profile | `User` | 16×24 |
| SquadDetailsSheet — member DM | `MailRight` | 16×24 |
| SquadDetailsSheet — member remove (creator only) | `UserMinus` | 24×24, `--color-danger` |
| Friends — remove friend (swipe reveal) | `AvatarCircleMinus` | 16×16 |
| Inbox — accept | `Check` | 16×16 |
| Inbox — decline / cancel | `Close` | 16×16 |
| ChatInput — send | `Send` | 16×16 |
| ChatInput — poll | `Chart` | 16×16 |
| SquadDetailsEditSheet — upload | `Upload` | 16×16, `var(--color-purple)` |
| ChatInput — creator | `Crown` | 12×12, `var(--color-coins)` |
| Coin badge | `TokeCircle` | 24×16 (not square) |
| AccountPreview — invite | `Copy` | 12×12, `var(--color-primary)` |
| Copy / confirm | `Copy`, `Check` | 12×12 |

## Bottom Sheet Patterns

Two named patterns. Every new bottom sheet must use one of these — no custom dismiss logic.

### Sheet (standard — use this for all general sheets)
Backdrop tap + drag-to-dismiss. Spring `stiffness 320, damping 32`.

```tsx
{/* Backdrop */}
<motion.div
  className="fixed inset-0 z-[60] bg-black/60"
  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
  onClick={onClose}
/>
{/* Sheet */}
<motion.div
  className="fixed bottom-0 left-0 right-0 z-[70] bg-[var(--color-surface-sheet)] rounded-tl-[16px] rounded-tr-[16px]"
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

Upload modals use `drag={saving ? false : 'y'}` — sheet locked during active upload.

**Keyboard suppression on open**: every sheet that contains an input or textarea must blur it immediately on mount to prevent the mobile keyboard from auto-popping when the sheet animates in. Pattern — `const inputRef = useRef<HTMLInputElement>(null); useEffect(() => { inputRef.current?.blur() }, [])` — apply the ref to the first focusable field.

### Panel (SquadDetailsSheet only — do not use elsewhere)
Full-height swipe-up with scroll-integrated pull-to-close (`onPanEnd`, threshold offset > 60 or vel > 300). Do not replicate for new sheets.

## Migrations (`supabase/migrations/`)
Early migrations (push_subscriptions through client_errors) cover: initial schema · push subscriptions · last_seen · notifications · XP/coins · app_invites · reactions · avatars · announcements · polls · squad_definitions · definition_suggestions. Full history in `supabase/migrations/`.

Recent:
- `20240103000031` — messages UPDATE policy; insert_message + image fields
- `20240103000032` — drop old insert_message overloads (ambiguous RPC fix)
- `20240103000035` — profiles.gem_balance + last_gem_claim, claim_daily_gem, profiles_protect_gem_columns trigger
- `20240103000036` — messages pin columns, messages_protect_pin_columns trigger, pin_message + unpin_message RPCs
- `20240103000037` — crews last_message_preview/at/sender_id, update_crew_last_message trigger, crews in realtime
- `20240103000038` — profiles.last_active_at, update_active() RPC
- `20240103000040` — board_sections + notes.section_id FK (ON DELETE SET NULL)
- `20240103000041` — combat: active_raids combat columns; crew_combat_members table + realtime; revive_tokens; init_combat_members, apply_boss_damage, use_revive_token RPCs
- `20240103000042` — active_raids + revive_tokens added to supabase_realtime publication
- `fix_damage_raid_ambiguous_column` — qualify `active_raids.defeated_at` (PL/pgSQL 42702 fix)
- `20240103000043` — Ability Bank: drops current_mp/max_mp, adds ability_bank; backfills from message counts
- `20240103000044` — Bank persistence: crew_members.ability_bank; syncs on earn/spend; init_combat_members seeded from it
- `20240103000045` — Stat boosts: crew_members.stat_boosts jsonb; init_combat_members applies HP boost; attack-boss reads all boosts

Manual SQL applied directly:
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_dev boolean NOT NULL DEFAULT false;
UPDATE profiles SET is_dev = true WHERE id IN (SELECT id FROM auth.users WHERE email IN ('shenraymonds@gmail.com', 'legaspi.riley@gmail.com'));
ALTER TABLE crews ADD COLUMN IF NOT EXISTS is_dm boolean NOT NULL DEFAULT false;
ALTER TABLE crews ADD COLUMN IF NOT EXISTS dm_partner_1 uuid REFERENCES auth.users(id);
ALTER TABLE crews ADD COLUMN IF NOT EXISTS dm_partner_2 uuid REFERENCES auth.users(id);
-- get_or_create_dm fn + friendships table DDL: see git history 2026-06-04
ALTER TABLE crews ADD COLUMN IF NOT EXISTS background_image_url text;
```

## Development Rules
- TypeScript strict · server components default · `'use client'` for interactivity only
- Mobile-first 390px · game logic in Edge Functions · Realtime for live state
- Never hardcode constants · never expose `SUPABASE_SERVICE_ROLE_KEY` client-side
- Loading skeletons: `<DelayedSkeleton>` (300ms) · `bg-border animate-pulse` on `bg-black`
- Clean up Realtime on unmount · `cancelled` flag in async effects · RLS on every table
- Server fetching: `Promise.all` independent queries; session first, then queries
- `unstable_cache`: `createServiceClient()` inside; verify auth with cookie client first
- Inspect relevant files before modifying; understand existing patterns first
- Prefer deleting dead code over commenting it out; avoid unnecessary abstractions
- Keep components focused; move business logic into hooks when it aids reuse

## Supabase Type Rules
- Row interfaces must extend `Record<string, unknown>` (without it `.from()`/`.rpc()` returns `never`)
- **Never use `Omit<T, K>` on interfaces that extend `Record<string, unknown>`** — collapses named fields to `unknown`. Write a standalone `interface` with all fields explicitly listed instead.
- Table definitions must include `Relationships: []`
- All RPCs declared in `Database.public.Functions` with `Args` + `Returns` before use
- `supabase/` excluded from `tsconfig.json` (Deno imports incompatible)
- Query builder returns `PromiseLike` — async/await + try/catch only; no `.catch()` chaining

## Disabled Features
- Voice notes: UI removed; `XP_VALUES['voice']` + element `lightning` still defined server-side
- Poll creation in chat: dev-gated via `nexus_poll_feature`; toggle in `/profile/developer` dispatches `nexus-poll-feature-change` event

## Gotchas
- `CREATE OR REPLACE FUNCTION` only replaces if signature matches exactly. Adding/removing params creates a new overload — multiple all-DEFAULT overloads cause ambiguous RPC errors. Always `DROP FUNCTION` old signatures before recreating with a different param list.
- Optimistic messages carry `tempId: string`. Reconciliation **must always** call `updateMessage(tempId, { id: raw.id })` in place — never `removeMessage(tempId)` on success. Removing and re-adding causes a virtualizer key swap, discards measured height, misaligns scroll. Only `removeMessage(tempId)` on RPC error.
- `insert_message` RPC uses `auth.uid()` internally — returns `null` from a service role client. For server-side inserts (e.g., `spawnBossAction`), use `service.from('messages').insert(...)` directly.
- Vercel Hobby plan: daily crons only (`0 0 * * *`). Sub-daily (`*/30 * * * *`) fails every deployment. The `boss-attack` cron was removed for this reason — trigger from dev panel.
- **Combat HP/phase must come from system message INSERTs, not `active_raids` realtime UPDATEs.** UPDATE events arrive out of order and overwrite correct HP. Keep the `active_raids` UPDATE handler to guard/volley/timer fields only.
- **Don't use Framer Motion `animate={{ width }}` inside a TanStack virtualizer.** With `initial={false}`, Framer has no prior width on first render and snaps instead of animating. Use a plain `<div>` with CSS `transition: width 0.5s ease-out` for progress bars inside virtualized rows.
- `init_combat_members` only creates rows for `profiles.is_dev = true` AND `crew_members.class` is a combat class. A dev user with a chat class (e.g., `berserker`) gets no combat row — update `crew_members.class` to a combat class.
- **`RETURNS TABLE` creates implicit output variables that shadow same-named columns.** `RETURNS TABLE(..., defeated_at timestamptz)` makes `WHERE defeated_at IS NULL` ambiguous (PostgreSQL `42702`). Always qualify: `active_raids.defeated_at`.
- **iOS Safari clears sessionStorage when a PWA is killed and relaunched.** The message cache uses IDB as a persistent mirror (`idb-keyval`). Always write to both; read sessionStorage first (sync) then fall back to IDB (async, ~5ms). Never rely on sessionStorage alone for data that must survive app kill.
- **`SwipeableCrewCard` (HomeClient)**: `wasDragging` flag is set in `onDragEnd` only when `|offset.x| > 5px`, not in `onDragStart`. Setting it in `onDragStart` caused the double-tap bug (Framer fires `onDragStart` for micro-movements, which blocked `onClick`). The card uses `dragConstraints={{ left: 0, right: 0 }}` — no positional reveal; swipe-left only triggers `onLongPress()` (opens `HomeCrewDetailsSheet`) when past threshold. `onDragStart` calls `cancelLongPress()` so a slow swipe does not also fire the 500ms long-press timer.
