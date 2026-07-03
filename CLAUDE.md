# Nexus

Group chat RPG: messages → XP → boss fights → artifacts. Pixel art (RotMG style).

## Stack
Next.js 16 App Router · TypeScript · Tailwind · Framer Motion · Zustand · Supabase (Auth, Postgres, Realtime, Storage, Edge Functions) · next-pwa v5 · Vercel · @tanstack/react-virtual v3

Icons: `pixelarticons` — `import { X } from 'pixelarticons/react/X'` · `<X style={{ width, height, color }} />` · named exports only · never lucide-react in chat/home UI

Build: `next build --webpack` (Turbopack breaks next-pwa + proxy.ts)

## Database Tables
```
profiles            id, username (unique case-insensitive), first_name, last_name, avatar_class, avatar_url, avatar_storage_key, custom_avatar (bool default false), birthday, is_dev, coins (int default 0), gem_balance (int default 0), last_gem_claim (timestamptz nullable), status (text nullable ≤100 chars), last_active_at (timestamptz nullable), pinned_vinyl_id (text nullable), created_at
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
All `SECURITY DEFINER`. Declared in `Database.Functions` in `src/types/index.ts`.

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
- `pin_message(p_message_id, p_duration_minutes?)` → jsonb — admin only, cap=5
- `unpin_message(p_message_id)` → jsonb — admin only
- `update_active()` → void — sets `profiles.last_active_at = now()`; presence heartbeat
- `init_combat_members(p_raid_id, p_crew_id, p_crew_level)` → void
- `apply_boss_damage(p_raid_id, p_member_id, p_final_dmg)` → `(new_hp, is_downed, downed_at)`
- `use_revive_token(p_raid_id, p_target_user_id)` → jsonb `{ok, new_hp?, tokens_remaining?}`

## Game Values

XP: first-msg-today=10 (flat, one-time per UTC day) · all other messages=1
Anti-spam: gap < 5s since sender's last message → 0 XP, 0 coins, 0 damage (soft block)

Coins: text/voice/image=1 · reaction/system=0 · generate-invite=−25 · seed-to-new-user=+50 · blocked when softBlocked
- `handle_new_user` trigger → 50 signup bonus · invite alphabet: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`

Friendship XP: 1pt per DM send or @mention · 10pt daily cap · `award-friendship-xp` edge function · **dev-gated: `nexus_friendship_xp`**

Gems: 1/day on first message in any crew · `award-gem` edge function + `claim_daily_gem` RPC sole authority — client never awards · blocked from client writes by `profiles_protect_gem_columns` trigger

Boss: every 500 XP (`BOSS_XP_THRESHOLD`) · 48h window · 3 phases · defeat → artifact drop
- Rarity: legendary 5% / epic 15% / rare 30% / common 50%
- Phase dmg multipliers: 1→1.0×, 2→1.3×, 3→1.6× · Boss attacks: phase 1/2 = every 2h, phase 3 = every 1h (trigger via dev panel)
- Downed members auto-regen after 8h

Combat classes (always-on):
| Class | HP | Ability | Cost | Effect |
|---|---|---|---|---|
| warrior | 42 | GUARD | 2 | Taunt + DEF+40% 60s |
| healer | 32 | MEND | 2 | INT-scaled crew-wide heal |
| archer | 28 | VOLLEY | 2 | Boss +20% dmg 30s + ATK hit |
| rogue | 24 | BACKSTAB | 2 | Crit 2.5× if boss HP>50% |
| mage | 24 | CAST | 2 | 3× ATK arcane nuke |

**Ability Bank**: 2 charges per ability. Earn 1 charge per eligible message (text ≥5 chars OR image, not soft-blocked, not repeat). `crew_members.ability_bank` = durable; `crew_combat_members.ability_bank` = live HUD. Both synced on earn/spend by `attack-boss`.

Stat scaling: `round(base × (1 + 0.018 × (level - 1)))` · Stat boosts: +1 random stat on boss defeat, persisted in `crew_members.stat_boosts` jsonb.

Leveling: `xpForLevel(n) = round(120 × 1.0435^(n-1))` · `LEVEL_CAP = 100` · constants in `src/shared/constants/config.ts`

Elements: fire=<20 chars · water=>150 chars · lightning=voice · nature=images · shadow=reactions · arcane=daily/system

Quick-pick emojis: `['🔥','💧','⚡','🌿','🌑','🔮']`

## Auth
- Google OAuth: `signInWithOAuth` → `/auth/callback` → `/home`
- Anonymous: `signInAnonymously`; guest badge + Save Progress in header
- `src/proxy.ts` only — DO NOT add `src/middleware.ts` (Next.js 16 errors if both exist)
- Protected routes: `/home` `/chat` `/vault` `/party` `/profile` `/onboarding` `/friends` `/dm`
- Auth check: `getSession()` (cookie-only), NOT `getUser()` (100–300ms overhead)

### Login — `/login`
Invite code path: `landing → invite-code → invite-oauth → invite-profile`
1. `validateInviteCodeAction` — checks `app_invites`, does not consume
2. Sets cookies `nexus_invite_code` + `nexus_auth_intent=invite` (SameSite=Lax, 5min) → Google OAuth
3. Callback reads cookies → `invite-profile` step `?code=XXX`, clears cookies
4. `checkReservedUserAction()` — auto-completes if fully reserved
5. `completeInviteFlowAction` — re-validates, upserts profile, marks invite used

### Onboarding
`name → /onboarding/birthday → /onboarding/class → /onboarding/welcome → chat/crew`
- Class guard on `crew_members.class`, NOT `profiles.avatar_class`
- `selectClassAction` → welcome ONLY when `crew_members` count = 1
- Welcome screen: marks invite used + 50 seed coins + `recruit_arrived` push to inviter

## Dev Mode
`profiles.is_dev = true` — grant: `UPDATE profiles SET is_dev = true WHERE id IN (SELECT id FROM auth.users WHERE email = '...')`

Dev flags (`localStorage`): `nexus_dev_mode` · `nexus_push_diag` · `nexus_infinite_coins` · `nexus_afk_exp` · `nexus_chat_camera` · `nexus_friendship_xp` · `nexus_poll_feature` · `nexus_pin_feature` · `nexus_events_enabled` · `nexus_combat_system` · `nexus_text_effect_feature`

Server-side (`award-xp`): boss spawn + `LEVEL_UP:` only when `isDevUser = true`
Client-side (`nexus_dev_mode`): `MessageList` hides boss/artifact/level-up system msgs + cards; `ChatInput` hides DamageFloat + RAID ACTIVE indicator

## Storage Keys

sessionStorage: `nexus-msgs-{crewId}` (envelope `{ messages, savedAt }`, 50 msg cap) · `nexus_chat_from`
IndexedDB (idb-keyval): `nexus-msgs-{crewId}` — same envelope; survives iOS PWA kill

localStorage: `nexus_first_message` · `nexus_install_prompted` · `nexus_crew_created` · `nexus_notif_prompted` · `nexus_notif_state` · `nexus_dismissed_banners` · dev flags above

## Architecture

### Source Layout
```
src/
├── app/                        Next.js routing — page.tsx / layout.tsx stay here
│   ├── layouts/SlidePage.tsx   Page transitions + useSlideBack()
│   └── (app)/…/page.tsx        Server components only; import Clients from features/
├── features/
│   ├── chat/components/
│   │   ├── input/              ChatInput, GifPickerSheet
│   │   ├── messages/           MessageList, MessageBubble, LinkPreviewCard
│   │   ├── sheets/             SquadDetailsSheet, InviteFriendsSheet, PinDurationSheet, PinListSheet,
│   │   │                       NotifSheet, CrewImageUploadModal,
│   │   │                       SuggestDefinitionSheet, ReviewSuggestionSheet, ChatSheetReact
│   │   ├── polls/              PollCard, PollCreatorSheet
│   │   ├── header/             ChatHeader, DMHeader
│   │   └── navigation/         FloatingBackButton, DMOverlayBack, ShareModal
│   ├── chat/screens/           DefinitionHomePage (definitions list page; stub re-export DefinitionsClient.tsx)
│   ├── combat/                 CombatHUD, CombatLog, AbilityButton, DamageFloat, VaultClient
│   ├── home/                   HomeClient, InviteArsenal, homePreviewCache.ts
│   ├── friends/                FriendsClient, InboxClient
│   ├── auth/                   LoginForm
│   ├── onboarding/             BirthdayClient, ClassSelectClient, WelcomeClient
│   └── profile/                ProfileClient, DeveloperClient, NotesGrid, VibesGrid, PhotosGrid
├── shared/
│   ├── supabase/               client.ts, server.ts, auth.ts, imageLoader.ts
│   ├── constants/config.ts     BOSS_XP_THRESHOLD, LEVEL_XP_BASE, etc.
│   ├── utils/                  xp.ts, gems.ts, notifications.ts, imageCompress.ts, etc.
│   └── components/             ui/, banners/, overlays/, pwa/, game/
├── store/                      chatStore.ts, combatStore.ts
└── types/                      index.ts (barrel) + chat.ts, profile.ts, combat.ts, etc.
```

### File Ownership Rules
- `app/(app)/*/page.tsx` — server components only
- `app/(app)/*/actions.ts` — server actions colocated with route
- `features/{domain}/` — owns its screens, components, hooks
- `shared/` — only code reused by 2+ features
- `store/` — chatStore + combatStore (cross-feature)
- `src/proxy.ts` — Next.js middleware; never rename or duplicate as `middleware.ts`
- Types: import from `'@/types'` everywhere (re-exported from `src/types/index.ts`)

### Realtime / Messaging
- Channel `messages:{crewId}`: broadcast (sender→instant) + Postgres Changes INSERT (backup) + presence (typing only)
- `addMessage` deduplicates by id; broadcast payload has no profile (resolved from `profilesRef`)
- XP sync: sender optimistic `addXP(n)` → `setCrewXP(newTotal)` → broadcasts `xp_update`; receivers `receiveXP`; dedup by `sender_id`
- **Presence**: authority = `profiles.last_active_at`; online = `last_active_at > now() - 45s`. Heartbeat: `update_active()` RPC every 30s + broadcasts `{ event: 'active', user_id, ts }`. Sweep: `sweepOnlineUserIds(45_000)` every 15s (local only).
- Typing: Supabase Presence (`ch.track({ username, typing })`) — NOT used for online status

### MessageList
- **Virtualization**: `useVirtualizer` (absolute-position, `measureElement`, overscan 5). `getItemKey` uses `tempId ?? id` — keeps key stable through optimistic→real reconciliation.
- **Three-tier cache**: (1) sessionStorage sync on mount → instant render; (2) IDB fallback if sessionStorage empty (iOS PWA kill resilience); (3) DB fetch newest 50, merged with in-flight Realtime. `setMessages([])` before load prevents crew bleed.
- **Cursor pagination**: scroll-up within 120px → keyset fetch `WHERE created_at < cursor LIMIT 50`; scroll position restored after prepend.
- **DisplayItems**: `spacer | empty | divider | boss | artifact | level_up | message`. `COMBAT:` and `BOSS_SPAWN:` system messages always skipped (shown in CombatLog).
- **Combat wiring**: system message INSERTs patch combatStore. `active_raids` UPDATE handler patches only `guard_user_id`, `guard_expires_at`, `volley_expires_at`, `last_boss_attack_at` — never `current_hp` or `phase`.

### MessageBubble
- `renderMessageContent` — splits on `@username` tokens, then links + definitions on each segment.
- Inline definition keyword highlight (`renderWithDefinitions`): `--color-purple`, font-weight 500 (medium), wraps `TextEffectText` for the word's `text_effect`.
- Username in header row: `--color-primary` on own bubbles, `--color-secondary` on others'.
- **Images** (`message_type === 'image'`): all through `MultiImageGrid` → `MultiImageCell` (160×160, object-cover). GIFs use `<img>`; photos use `next/image fill` + `supabaseImageLoader`. `parseJsonArray()` normalises plain URL or JSON `string[]`.
- **Header row** (username · vinyl · crown · timestamp): no dot separators. `VinylPill` shows spinning 12×12 disc + scrolling title (no play icon). `Crown` 12×12 shown only on creator's own bubbles.
- **`VinylPill`**: `pinnedVinyl?: { imageUrl, title }`. Measures title width via off-screen span; scrolls with Framer Motion ticker if `textWidth > 32`, else static ellipsis.
- Long-press (500ms) → `ChatSheetReact`: emoji quick-pick · Edit (own text messages) · Reply · Copy · Pin (admin).
- OG previews: `extractFirstUrl` → `useOGPreview` → `<LinkPreviewCard>` below body; text-only messages only.

### Swipe-to-reply
Only on `!isOwn` messages. Swipe left past 64px to commit. Slide wrapper (`data-group={groupId}`) covers avatar + content so they move together. Group slide: all `[data-group="${groupId}"]` elements transform as a unit. Reply icon fades in from 30–100% of swipe. `chatStore.replyTo` + `replyGroupId` set atomically; cleared on `ChatInput` unmount.

Reply icon (`CornerUpLeft` 16×16): absolutely positioned, `top` = `var(--space-6)` (header messages) or `var(--space-2)` (continuations) to match wrapper `padding-top` — ensures `flex items-center` centers the icon within the content area, not the full wrapper including group-spacing dead space.

### ChatInput
- Send: `addMessage(optimisticMsg)` → `insert_message` RPC → `updateMessage(tempId, { id })` in place → broadcast → `award-xp` → `attack-boss`. On error: `removeMessage(tempId)`.
- Edit mode: `chatStore.editTo`; optimistic update → DB write → rollback on error. Text messages only.
- Multi-image: `PendingImage[]` max 4; parallel uploads, sequential sends. `clearPendingImages` revokes blob URLs.
- Hybrid input/textarea: swaps to textarea when text width exceeds container (measured via hidden mirror span).
- **Klipy API**: trending → `data.clips[]` flat `file.thumbnail_url`; search → `data.data[]` nested `file.sm/md/hd/xs`. Separate parsers — do NOT unify.
- `callAttackBoss` fires after every send. Poll feature dev-gated (`nexus_poll_feature`).

### FloatingBackButton (`src/features/chat/components/navigation/FloatingBackButton.tsx`)
Absolute-positioned gradient overlay (`linear-gradient black → transparent`). Right-side buttons:
- **Bell** (`Bell`/`BellOff`) — loads per-crew notif prefs, opens `NotifSheet`; shows `BellOff` when all muted
- **Library** — navigates to `/chat/${crewId}/definitions` (squad glossary)
All buttons: `border border-border p-2 backdrop-blur(7px)`.

### Definitions Page (`src/features/chat/screens/DefinitionHomePage.tsx`)
Route: `/chat/[crewId]/definitions` · Export: `DefinitionHomePage`

Header (Figma 402:9394): `px-md py-x3` · `h-40px justify-between` · left = `[ChevronLeft primary] [DEFINITIONS silkscreen xl]` gap-x3 · right = `Plus primary` opens `CreateDefinitionPage`

Cards (Figma 402:9403): `bg-surface-sheet rounded-x3 p-x5 gap-x5 items-start`
- Details (402:9404): `flex-col gap-x3 items-start justify-center`
  - Aliases: Silkscreen mini tertiary leading-none
  - Word (402:9407): DM Sans Bold md `--primary` leading-none
  - Definition (402:9408): DM Sans Regular 14px `--secondary` leading-[1.5] overflow-hidden text-ellipsis
- Creator (402:9409): DM Sans Light xs · `--primary` if own definition · `--tertiary` otherwise
- Suggestion badge: amber `#f59e0b` DM Sans Light xs (right-aligned, shown when `suggestion_count > 0`)

**Card tap flow** — all taps (creator or not) open `DefinitionPreviewSheet` (Figma 402:9507, `<BottomSheet>` z-70):
- Content: aliases (Silkscreen mini tertiary) · word (DM Sans Bold md primary) · definition (DM Sans Regular 14px secondary leading-1.5) · "Author : {username}" (DM Sans Light 12px tertiary)
- `Edit Definition` button: purple border + `MagicEdit` 20×20 + DM Sans SemiBold sm purple — **creator only**
- `Cancel` button: tertiary border + `Close` 20×20 + DM Sans SemiBold sm tertiary — always shown
- Tapping Edit closes the preview sheet and opens `CreateDefinitionPage` in edit mode

**`CreateDefinitionPage`** — full-screen slide-in overlay (`motion.div` controlled via `useAnimation()`, spring 380/36, `z-[80]`, `bg-black`):
- Header: `ChevronLeft primary` 24×24 back + Silkscreen xl uppercase title ("ADD DEFINITION" / "EDIT DEFINITION")
- Body: scrollable, `gap-x6` — `InputField` (words/aliases) + `InputField` (actual word) + `TextareaField` (definition, rows=5) + dev-gated Text Effect section (Figma 405:2634)
- Text Effect section — dev-gated: `nexus_text_effect_feature` (toggled from Developer Settings → Features, not `nexus_dev_mode`). Toggle row + effect option list (`bouncy_text` "Bouncy Text", `show_up` "Show Up", `particles` "Particles", `blur_in` "Blur In"); selected card gets purple border + `surface-elevated` bg + `Check` icon, unselected gets `border` + `surface-sheet` + empty circle; each option's own label previews its (looping) effect live only while selected — unselected labels render as plain static text (`TextEffectText` gets `effect={selected ? effect : null}`). Persists to `squad_definitions.text_effect`. Effect components live in `src/features/chat/components/text-effects/` (`registry.ts` = id/label list, `TextEffectText.tsx` = effect switcher, one file per effect). Applied via `TextEffectText` in `MessageBubble`'s `renderWithDefinitions` wherever the keyword is highlighted inline in chat, and in the picker itself for preview.
- Footer: sticky `DefinitionButton variant="fill"` "Save definition" with safe-area padding
- Back button and left-edge swipe both call `handleBack()`: animates to x:100% (ease-in 150ms), then calls `onClose()`. Never calls `router.back()` — navigation stays on the definitions list. No `exit` prop; AnimatePresence sees the component already off-screen when it unmounts.
- After a successful save, `handleBack()` is also called (slide-out animation plays before `onSaved` + `onClose()`).
- `DefinitionHomePage` passes `nativeSwipe={showCreate || !!editTarget}` to `SlidePage` while the overlay is open, disabling SlidePage's custom swipe handler so it cannot race with the overlay's own gesture.

### SquadDetailsSheet (`src/features/chat/components/sheets/SquadDetailsSheet.tsx`)
Panel pattern · `maxHeight: 85vh` · `overflow-hidden`

Layout (flex col):
1. **Header** (240px) — background + gradient overlay; top: crew image + name + `Lv.{n} · {count} members` | `MagicEdit` (creator) + `UserPlus` (opens `InviteFriendsSheet`) + `ChevronRight` (close); bottom: XP bar
2. **Members** (`flex-1 min-h-0`) — "Members" label + scrollable member list (`maxHeight: 240px` = 5 rows); member rows: avatar + sprite + name/class·msg
3. **Fixed bottom** (`flex-shrink-0`) — `DoorClosed` leave squad button

### InviteFriendsSheet (`src/features/chat/components/sheets/InviteFriendsSheet.tsx`)
Figma 394:9180 · Standard `<BottomSheet>` (`zIndex={80}`), opened from `SquadDetailsSheet`'s header `UserPlus` button

- Header: "Invite Friends" (DM Sans Bold `--md` primary) + "Use this code to invite friends to your squad." (DM Sans Light `--xs` tertiary)
- Code card: `--color-surface` bg + `border-border`, `h-[68px]` — left: "Invite new members" (Silkscreen mini primary) above the code itself (Silkscreen `--xl`, purple→fuchsia gradient `bg-clip-text` + `text-shadow: 0 0 3px #a855f7`, tracking 0.2px); right: "Copy Code" button
- Copy button: `--color-purple` fill, `box-shadow: 4px 4px 0 rgba(168,85,247,0.5)`, `Copy` 12×12 icon + Silkscreen `--xxs` label; swaps to `Check` icon + "Copied!" for 1s on tap (writes `Come join my squad on Nexus app {code}` to clipboard)

### Pin Feature (dev-gated: `nexus_pin_feature`)
- Admin = member with earliest `joined_at`; cap = 5 active pins (`PIN_MAX_PER_CREW`)
- `pin_message` / `unpin_message` RPCs only — trigger blocks direct client writes
- `PinListSheet`: lists pins; admin: unpin + display toggle
- `selectActivePins(messages)` from chatStore; `hiddenPinIds` + `toggleHiddenPin` in chatStore

### Combat System

**System message formats** (`message_type: 'system'`, inserted directly — NOT via `insert_message`):
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
| `COMBAT:escaped:{bossName}` | Raid expired |
| `COMBAT:stat_up:{username}:{stat}` | +1 stat on victory |

**combatStore**: `activeRaid`, `memberStats`, `combatEvents` (cap 200), `reviveTokens`, `damageFloats`. `replayCombatEvents` merges by id after initial DB fetch.

### award-xp
- Batch 1 (parallel): prev msg gap + crew data + sender `is_dev` + other members
- Anti-spam: gap < 5s → 0 XP, 0 coins
- Notifications fire-and-forget BEFORE XP writes — do NOT add early returns before notification block

### Reactions
- `messages.reactions` JSONB: `{ emoji: [userId,...] }`, empty arrays pruned
- `handleReaction`: optimistic → `react-to-message` edge fn → apply `data.reactions`; rollback only on `FunctionsHttpError`

### Polls
`message.content = 'POLL:{pollId}'` · `create_poll` RPC · `vote_on_poll` one toggleable vote · 0 XP

### Page Transitions
- Enter: spring 380/36; skipped on back-nav via `_skipNextSlideEnter` flag
- Exit: ease-in 150ms; `goBack()` fires router simultaneously with animation
- Always use `useSlideBack()` instead of `router.back()`

## Caching

Server (`unstable_cache` via `createServiceClient()`):
| Cache | TTL | Tag |
|---|---|---|
| Home/profile page | 60s | `profile:{userId}` |
| Crew members + counts | 300s | `crew-members:{crewId}` |
| Friend profiles | 300s | `profile:{friendId}` |
| Friendships | 300s | `friends:{userId}` |
| Announcements | 300s | `announcements` |
| Vault crew + artifacts | 300s | `vault:{crewId}`, `artifacts:{crewId}` |

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

`git push` does NOT deploy edge functions. Inter-function calls use raw `fetch()` — never `supabase.functions.invoke()`. `send-notification` accepts `user_id: string` or `user_ids: string[]`.

New notification type checklist:
1. Add to `NotificationType` union in `send-notification/index.ts`
2. Add to `PREF_COLUMN` map (`null` = always deliver)
3. Add `case` to `buildPayload()` → `{ title, body, icon, data: { url } }`
4. Call `send-notification` from trigger point; deploy `--no-verify-jwt`

## PWA / Push
- SW: `public/sw-push.js` — handwritten, no workbox; no multi-arg `importScripts()` (kills iOS Safari)
- `manifest.json` `start_url: "/home"` — avoids 2-hop redirect on icon launch
- `sw-push.js` caching: `nexus-pages-v1` (StaleWhileRevalidate for app nav) · `nexus-static-v1` (CacheFirst `/_next/static/`) · `nexus-images-v1` (CacheFirst Supabase storage)
- `sw.js` (workbox) is **never registered** — `SWRegister` only registers `sw-push.js`
- Strip `badge` from `showNotification` (iOS rejects); notification `tag` must be unique (`-{timestamp}`)
- Subscribe: INSERT only, no delete-first; `23505` = success
- VAPID vars in Supabase Edge Function secrets; `VAPID_SUBJECT` must be `mailto:` URI
- Debugging: 401 = deployed without `--no-verify-jwt`; `expired_deleted` = APNs 410'd → FORCE RESUB

## Images
- `next/image` + `supabaseImageLoader` for all Supabase storage images (backgrounds, photos, OG)
- **All person avatars must use `<UserAvatar>`** (`src/shared/components/ui/UserAvatar.tsx`) — never inline `avatarImageLoader` + `next/image` directly for avatar display
- **All crew/squad images must use `<GroupAvatar>`** (`src/shared/components/ui/GroupAvatar.tsx`) — never inline `avatarImageLoader` + `next/image` directly for a crew's `image_url`
- Plain `<img>`: pixel sprites · crop target · hero backgrounds · Vibes OG thumbnails (external URLs)
- Avatar upload: `AvatarUploadModal` → canvas → WebP → `avatars` bucket; `process-avatar` edge fn → AVIF; `custom_avatar = true` blocks Google photo overwrite
- `resizeImageToBlob(file, w, h)` in `src/shared/utils/imageCompress.ts`: center-crop → WebP 0.85

## Design Tokens (`src/app/globals.css`)
Colors: `--color-primary` · `--color-secondary` · `--color-tertiary` · `--color-surface` · `--color-border` · `--color-purple` · `--color-blue` · `--color-muted`

Game: `--color-bg-chat` (#0a0612) · `--color-xp` (#ffd700) · `--color-coins` (#f59e0b) · `--color-danger` (#ff4444) · `--color-success` (#66bb6a)

Figma aliases: `--red` (#ef4444) · `--green` (#22c55e) · `--purple` · `--blue` · `--xN` spacing (x1=0px, x2=4px, x3=8px, x4=12px, x5=16px, x6=20px, x7=24px, x8=28px … x15=56px)

Fonts: `font-pixel` = Press Start 2P · `font-body` = DM Sans · `font-silkscreen` = Silkscreen

Icons (`pixelarticons`) — key usages:
| Location | Component | Size |
|---|---|---|
| Back buttons | `ChevronLeft` | 24×24, `--color-purple` (except Definitions page: `--color-primary`) |
| Expand/collapse | `ChevronRight` (rotated) | 24×24 |
| Floating nav — notifs | `Bell` / `BellOff` | 24×24 |
| Floating nav — glossary | `Library` | 24×24 |
| SquadDetailsSheet — edit | `MagicEdit` | 24×24 |
| SquadDetailsSheet — invite | `UserPlus` | 24×24 |
| DefinitionPreviewSheet — edit | `MagicEdit` | 20×20, `--color-purple` |
| DefinitionPreviewSheet — cancel | `Close` | 20×20, `--color-tertiary` |
| SquadDetailsSheet — leave | `DoorClosed` | 16×16 |
| InviteFriendsSheet — copy | `Copy` / `Check` | 12×12, `--color-primary` |
| Message bubble — creator | `Crown` | 12×12, `--color-coins` |
| Friends — remove | `AvatarCircleMinus` | 16×16 |
| Inbox — accept / decline | `Check` / `Close` | 16×16 |
| ChatInput — send | `Send` | 16×16 |
| ChatInput — poll | `Chart` | 16×16 |
| Upload buttons | `Upload` | 16×16, `--color-purple` |
| Copy / confirm | `Copy` / `Check` | 12×12 |

## Bottom Sheet Patterns

Two named patterns — every new sheet must use one; no custom dismiss logic.

### Sheet (standard)
Backdrop tap + drag-to-dismiss. Spring `stiffness 320, damping 32`. Use `<BottomSheet>` (`src/shared/components/ui/BottomSheet.tsx`) — do not inline the motion markup.

```tsx
<BottomSheet onClose={onClose} zIndex={70}>
  {/* content */}
</BottomSheet>
```

Upload modals: pass `disableDrag={saving}`. Sheets with inputs: blur on mount to suppress keyboard.

### SheetActionButton
Action rows inside sheets use `<SheetActionButton>` (`src/shared/components/ui/SheetActionButton.tsx`). Renders `bg-surface-elevated` buttons with correct typography and `appearance-none` to prevent iOS Safari's `-webkit-appearance` from overriding the background.

```tsx
<SheetActionButton
  icon={<SomeIcon style={{ width: 20, height: 20 }} />}
  label="Action Label"
  onClick={handleAction}
  disabled={optionalBool}
/>
```

Pass icon without a `color` style — it inherits `currentColor` from the button.

### Panel (SquadDetailsSheet only)
Full-height swipe-up with `onPanEnd` pull-to-close (offset > 60 or vel > 300). Do not replicate.

## Definition Buttons (`src/shared/components/ui/DefinitionButton.tsx`)

Figma 402:9772 — two variants used in the Definitions flow. DM Sans SemiBold sm, `p-x5` padding, `rounded-x3`, full-width.

```tsx
// Fill — purple background, primary text (Save Definition)
<DefinitionButton variant="fill" onClick={handleSave} loading={saving}>
  Save definition
</DefinitionButton>

// Stroke purple — purple border + text, optional icon (Edit Definition)
<DefinitionButton variant="stroke" color="purple" icon={<MagicEdit style={{ width: 20, height: 20 }} />} onClick={onEdit}>
  Edit Definition
</DefinitionButton>

// Stroke tertiary — tertiary border + text, optional icon (Cancel)
<DefinitionButton variant="stroke" color="tertiary" icon={<Close style={{ width: 20, height: 20 }} />} onClick={onClose}>
  Cancel
</DefinitionButton>
```

Icon inherits `currentColor` from the button wrapper — do not pass `color` on the icon style.

## UserAvatar (`src/shared/components/ui/UserAvatar.tsx`)

Single component for all user profile photo rendering. Uses `avatarImageLoader` internally — Supabase storage URLs are resized + quality-compressed via the render API; Google OAuth URLs are resized via Google's CDN. Never render avatar images inline.

```tsx
// Standard message / member list avatar (circle, bg-surface, 32px default)
<UserAvatar avatarUrl={profile.avatar_url} username={profile.username} size={32} />

// Friend / home account preview (circle, bg-primary, black initial for contrast)
<UserAvatar avatarUrl={avatarUrl} username={username} size={48} bg="primary" initialColor="black" priority />

// Own profile hero (circle, bg-primary, 56px)
<UserAvatar avatarUrl={localAvatarUrl} username={localUsername} size={56} bg="primary" priority />

// Member / settings profile hero (square, bg-border, 56px)
<UserAvatar avatarUrl={avatarUrl} username={username} size={56} shape="square" bg="border" />

// DM header / overlay back (square, bg-border, white initial)
<UserAvatar avatarUrl={friendAvatarUrl} username={friendUsername} size={32} shape="square" bg="border" initialColor="primary" priority />

// Event "going" avatar stack (circle, purple fallback background)
<UserAvatar avatarUrl={profile.avatar_url} username={profile.username} size={24} bg="border" fallbackBg="var(--color-purple)" initialColor="white" />
```

Props:
| Prop | Type | Default | Notes |
|---|---|---|---|
| `avatarUrl` | `string \| null` | — | Supabase storage or Google URL |
| `username` | `string \| null` | — | Used for `alt` text and initial fallback |
| `size` | `number` | `32` | px; pick from `imageSizes` (24, 32, 48, 56) for best cache hits |
| `shape` | `'circle' \| 'square'` | `'circle'` | Square for DM headers and profile heroes |
| `bg` | `'surface' \| 'border' \| 'primary'` | `'surface'` | Container background (visible during load + fallback) |
| `fallbackBg` | `string` | — | CSS color for the no-avatar state only (overrides `bg` on the inner div) |
| `initialColor` | `'purple' \| 'primary' \| 'black' \| 'white'` | `'purple'` | Pixel-font initial letter color |
| `priority` | `boolean` | `false` | Pass `true` for above-fold avatars |

Online dot: render outside `<UserAvatar>` in a `div.relative` wrapper — the component does not include presence indicators.

## GroupAvatar (`src/shared/components/ui/GroupAvatar.tsx`)

Single component for all crew/squad profile-image rendering (`crews.image_url`). Uses `avatarImageLoader` internally, same as `UserAvatar` — resized + quality-compressed via the Supabase render API. Falls back to the pixel ghost icon (`/icons/ghost-fallback.svg`), not an initial letter. Never render crew images inline with `next/image` + `supabaseImageLoader`.

```tsx
// Home squad-row preview (48px)
<GroupAvatar imageUrl={crew.image_url} name={crew.name} size={48} />

// Chat squad-detail bar / squad-details sheet header (24–40px)
<GroupAvatar imageUrl={crewImageUrl} name={crewName} size={40} />
```

Props: `imageUrl`, `name` (alt text only, no initial fallback), `size` (default `48`), `priority`, `className`, `style`. Always square — no `shape` prop.

## Form Components (`src/shared/components/ui/InputField.tsx`)

Two reusable components matching Figma 402:9678. Use these for all in-app forms (not auth/onboarding, which uses the older `Input.tsx`).

### `InputField`
Single-line labelled input. Fixed `h-[50px]`, `border-border` idle → `border-border-hover` on `focus-within`. Label: DM Sans Medium sm primary. Input text: DM Sans Regular sm primary, muted placeholder. Optional helper text: DM Sans Regular xxs tertiary tracking-[0.2px].

```tsx
<InputField
  label="Words attached to definition"
  value={word}
  onChange={setWord}
  placeholder="e.g. GG, gg, good game"
  helperText="Comma-separated aliases map to the same definition."
  maxLength={100}
  autoComplete="off"
/>
```

### `TextareaField`
Same label/helper/border design as `InputField` but renders a `<textarea>`. Height set via `rows` prop (default 5). Padding `p-x5` wraps the textarea.

```tsx
<TextareaField
  label="Definition"
  value={definition}
  onChange={setDefinition}
  placeholder="What does it mean in your squad?"
  maxLength={500}
  rows={5}
/>
```

## Development Rules
- TypeScript strict · server components default · `'use client'` for interactivity only
- Mobile-first 390px · game logic in Edge Functions · Realtime for live state
- Never hardcode constants · never expose `SUPABASE_SERVICE_ROLE_KEY` client-side
- Loading skeletons: `<DelayedSkeleton>` (300ms) · `bg-border animate-pulse` on `bg-black`
- Clean up Realtime on unmount · `cancelled` flag in async effects · RLS on every table
- Server fetching: `Promise.all` independent queries; session first, then queries
- `unstable_cache`: `createServiceClient()` inside; verify auth with cookie client first

## Supabase Type Rules
- Row interfaces must extend `Record<string, unknown>` (without it `.from()`/`.rpc()` returns `never`)
- **Never use `Omit<T, K>`** on interfaces extending `Record<string, unknown>` — collapses to `unknown`. Write standalone interfaces instead.
- Table definitions must include `Relationships: []`
- All RPCs declared in `Database.public.Functions` with `Args` + `Returns` before use
- `supabase/` excluded from `tsconfig.json` (Deno imports incompatible)
- Query builder returns `PromiseLike` — async/await + try/catch only; no `.catch()` chaining

## Disabled Features
- Voice notes: UI removed; `XP_VALUES['voice']` + element `lightning` still defined server-side
- Poll creation: dev-gated via `nexus_poll_feature`; dispatches `nexus-poll-feature-change` event

## Gotchas
- `CREATE OR REPLACE FUNCTION` only replaces if signature matches exactly. Adding/removing params creates a new overload → ambiguous RPC errors. Always `DROP FUNCTION` old signatures first.
- Optimistic messages carry `tempId`. Reconciliation **must** call `updateMessage(tempId, { id })` in place — never `removeMessage(tempId)` on success. Only remove on RPC error.
- `insert_message` RPC uses `auth.uid()` internally — returns `null` from service role. For server-side inserts use `service.from('messages').insert(...)` directly.
- Vercel Hobby: daily crons only (`0 0 * * *`). Sub-daily fails every deploy. `boss-attack` cron removed — trigger from dev panel.
- **Combat HP/phase must come from system message INSERTs, not `active_raids` realtime UPDATEs.** UPDATEs arrive out of order. `active_raids` UPDATE handler: guard/volley/timer fields only.
- **Don't use Framer Motion `animate={{ width }}` inside a TanStack virtualizer.** Use CSS `transition: width 0.5s ease-out` instead.
- `init_combat_members` only creates rows for `is_dev = true` AND a combat class. Dev user with `berserker` class gets no combat row.
- **`RETURNS TABLE` creates implicit output variables that shadow columns.** Always qualify table-prefixed column names in PL/pgSQL to avoid `42702` ambiguity.
- **iOS Safari clears sessionStorage on PWA kill/relaunch.** Always write to both sessionStorage and IDB; read sessionStorage first (sync), fall back to IDB (async ~5ms).
- **`SwipeableCrewCard`**: `wasDragging` set in `onDragEnd` only (not `onDragStart`) — setting it in `onDragStart` blocks `onClick` for micro-movements. `onDragStart` calls `cancelLongPress()` to prevent 500ms timer firing on slow swipes.
- **iOS Safari `<button>` background**: `-webkit-appearance: button` overrides custom `background` values. Always include `appearance-none` (Tailwind) on styled `<button>` elements — `SheetActionButton` already does this.
- **`FloatingBackButton` history manipulation runs on every mount.** The `useEffect` that does `replaceState(/home) + pushState(/chat)` fires each time the chat page remounts — including when the user navigates back from a sub-page (definitions, etc.). Any `router.push()` away from the chat page must first call `sessionStorage.setItem('nexus_chat_from', 'chat')` so the effect skips re-manipulation on return. Omitting this stacks an extra `/home` entry per round trip.
- **`SlidePage` swipe handler fires through fixed overlays.** Fixed-position overlays rendered inside a `SlidePage` are still children in the DOM tree, so touch events bubble up to `SlidePage`'s native `addEventListener`. Pass `nativeSwipe={overlayOpen}` to `SlidePage` whenever any overlay is active — this disables the custom left-edge swipe handler so it cannot call `router.back()` while an overlay is showing.
- **`squad_definitions.creator_id` FK points to `auth.users`, not `public.profiles`.** Supabase embedded selects (`profiles!creator_id(username)`) will fail — the FK hint resolves to `auth.users` which is a different schema. Fetch creator usernames via a separate `profiles` query keyed on the collected `creator_id` values.
- **Realtime INSERT handlers that need profile data should cache known usernames in a `useRef`.** Seed the cache from `initialDefinitions` (or equivalent server-fetched data) on mount, then only hit Supabase for unseen `creator_id` values. This avoids a DB round-trip for every INSERT from a known user. See `profileCacheRef` in `DefinitionHomePage`.
