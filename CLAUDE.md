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
profiles       id, username (unique case-insensitive), first_name (text nullable), last_name (text nullable), avatar_class, avatar_url, avatar_storage_key (text nullable), custom_avatar (bool default false), birthday (date), is_dev, coins (int default 0), status (text nullable ≤100 chars), created_at
crews          id, name, invite_code (6 chars unique), level, total_xp, created_at,
               is_dm (bool default false), dm_partner_1 (uuid nullable), dm_partner_2 (uuid nullable),
               image_url (text nullable), image_storage_key (text nullable)
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
reserved_users id, email (text unique), username, class (text nullable), first_name (text nullable), last_name (text nullable), created_at, converted (bool default false)
announcements  id, text (1–500 chars), active (bool default true), created_at
polls          id, message_id (uuid → messages nullable), crew_id, creator_id, question (text 1–200 chars), options (jsonb string array), votes (jsonb default '{}' — `{ "0": ["userId",...] }`), expires_at (timestamptz), closed_at (timestamptz nullable), created_at
squad_definitions  id, crew_id, creator_id, word (text 1–100 chars — stores comma-separated aliases, e.g. "abg, ABG"), definition (text 1–500 chars), created_at — UNIQUE INDEX on (crew_id, lower(word))
```

### DM Channels
DM channels are stored as `crews` rows with `is_dm = true`. Reuse the entire chat stack. Key invariants:
- `dm_partner_1 < dm_partner_2` (UUID order) — enforced by `get_or_create_dm`
- Both partners inserted into `crew_members` with class `berserker` at creation
- DM crews filtered out of home Squads section; appear only in Friends section

## Postgres Functions
All are `SECURITY DEFINER`. All declared in `Database.Functions` in `src/types/index.ts`.
- `create_crew(p_name, p_invite_code)` → uuid
- `join_crew(p_invite_code)` → uuid
- `leave_crew(p_crew_id)` → jsonb `{ok|deleted}`
- `insert_message(p_crew_id, p_content, p_message_type)` → messages row
- `damage_raid(p_raid_id, p_damage, p_user_id)` → `(current_hp, phase, defeated_at)`
- `increment_crew_xp(p_crew_id, p_xp_delta)` → `(new_total_xp, new_level)`
- `is_crew_member(p_crew_id)` → boolean
- `get_or_create_dm(other_user_id)` → uuid — returns/creates DM crew; verifies accepted friendship first
- `get_unread_counts(p_crew_ids, p_cutoffs)` → `TABLE(crew_id, unread_count)` — batch unread counts
- `get_crew_member_msg_counts(p_crew_id)` → `TABLE(user_id, msg_count)` — used by expanded member panel
- `get_member_crew_stats(p_crew_id, p_user_id)` → `TABLE(msg_count, total_xp)` — used by member profile page
- `increment_user_coins(p_user_id, p_amount)` → void — atomic coins update; called by `award-xp`
- `toggle_reaction(p_message_id, p_emoji, p_user_id)` → jsonb — row-locking atomic toggle; called by `react-to-message`
- `create_poll(p_crew_id, p_question, p_options, p_expires_at)` → messages row — atomically inserts message + poll
- `vote_on_poll(p_poll_id, p_option_index)` → jsonb — row-locked; one toggleable vote per user
- `close_poll(p_poll_id)` → void — creator-only

## Game Rules

### XP Values
| Action | XP |
|---|---|
| Text message | 10 |
| Voice note | 25 (disabled in UI) |
| Image / GIF | 20 (disabled in UI) |
| Reaction | 5 |
| Poll | 0 |
| First message today bonus | +20 |
| Reply within 60s combo | +5 |

### Coin System
Coins are the invite currency. Earned by sending messages; spent to invite new members.

| Action | Coins |
|---|---|
| Text / voice / image message | 1 |
| Reaction / system | 0 |
| Generate invite code | −25 |
| Invited user joins (seed) | +50 to new user |

- New users receive 50-coin signup bonus from `handle_new_user` DB trigger; logged as `source='signup_bonus'`
- Invite generation: costs 25 coins, server-validated; alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`; up to 10 uniqueness retries
- Seed coins: idempotent via `coin_log source='seed'` check
- Balance in `profiles.coins`; displayed in home `AccountPreviewContainer` only (amber pill: `TokeCircle` 24×16px + Silkscreen 12px `#f59e0b`). Not shown in chat.
- `chatStore` holds `userCoins`, `setUserCoins`, `addUserCoins`. `HomeClient` seeds from `Math.max(initialCoins, chatStore.userCoins)` on mount to prevent snapback. Realtime `postgres_changes` UPDATE on `profiles` keeps balance live.
- Anti-spam: coins only awarded when `xpBlocked = false`

### Boss Rules
- The Void spawns at every 500 XP threshold; fight window = 48 hours; 3 phases (100–60%, 60–30%, 30–0%)
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
- Secondary: Anonymous sessions (`signInAnonymously`); guest badge + Save Progress in header
- No email/password auth

### Invite-Only Gate — `/login`
Two paths on the login page:

**Invite Code Path** (step machine: `landing → invite-code → invite-oauth → invite-profile`):
1. `validateInviteCodeAction` (service client) — checks `app_invites`; does not consume the code
2. Client sets `nexus_invite_code` + `nexus_auth_intent=invite` cookies (SameSite=Lax, 5min), then triggers Google OAuth
3. Auth callback reads cookies, routes to `invite-profile` step with `?code=XXX`, clears both cookies
4. `checkReservedUserAction()`: auto-completes if fully reserved, else shows profile form
5. `completeInviteFlowAction`: re-validates code, upserts profile fields, marks invite used

**Reserve My Place Path**: no auth session; purely a `reserved_users` insert. Gmail-only.

**Existing members**: "SIGN IN WITH GOOGLE" below main CTAs; no `profiles.username` → `/login?error=no_account`.

**Error copy**: invalid code → "The Nexus does not recognize this code." / already used → "This code has already been claimed." / generic → "The rift destabilized. Try again."

## Onboarding Flow
- **New users**: name → `/onboarding/birthday` → `/onboarding/class` → `/onboarding/welcome` → chat/crew
- **Per-crew class selection**: guard on `crew_members.class` (not `profiles.avatar_class` — using global caused infinite redirect loops)
- **Welcome screen redirect**: `selectClassAction` redirects to welcome ONLY when `crew_members` count equals 1
- **`invite` URL param**: threaded through birthday → class → welcome. Known limitation: unauthenticated OAuth flows lose the code, so `app_invites.used_by` is never set for those users
- Welcome screen: marks invite used + awards 50 seed coins + sends `recruit_arrived` push to inviter (all in `Promise.all`)

## Dev Mode
- Controlled by `profiles.is_dev` boolean — **not hardcoded emails**
- To grant: `UPDATE profiles SET is_dev = true WHERE id IN (SELECT id FROM auth.users WHERE email = '...')`
- Dev section in `/profile`: **Spawn Boss Mode** (`nexus_dev_mode`), **Push Diagnostics** (`nexus_push_diag`), **Infinite Coins** (`nexus_infinite_coins`), **Feat: AFK Exp** (`nexus_afk_exp`), **Announcements** management, User ID/Email copy rows, Local Flags reset

### Game Events — Dev-Only Gate
**Server-side (`award-xp`)**: boss spawn + `LEVEL_UP:` message only run when `isDevUser = true`.

**Client-side** (gated by `localStorage.getItem('nexus_dev_mode') === '1'`):
- `MessageList`: hides boss cards, artifact drops, level-up banners, game-event system messages (BOSS_SPAWN:, ARTIFACT_DROP:, LEVEL_UP:). Non-game system messages (e.g. birthdays) render for all users.
- `ChatHeader` / `DMOverlayBack`: hides boss HP bar + countdown
- `ChatInput`: hides DamageFloat, "Next Boss" label, RAID ACTIVE indicator. XP stats row is visible to all users.

## Routing — Next.js 16 Proxy
- `src/proxy.ts` — **DO NOT add `src/middleware.ts`** (Next.js 16 errors if both exist)
- Protected prefixes: `/home`, `/chat`, `/vault`, `/party`, `/profile`, `/onboarding`, `/friends`, `/dm`
- Uses `getSession()` (cookie-only) NOT `getUser()` — `getUser()` adds 100–300ms per nav
- Build: `next build --webpack` in vercel.json — Turbopack breaks next-pwa and conflicts with proxy.ts

## Architecture Notes

### Realtime Delivery (dual-path + dedup)
- **Sender**: insert DB → broadcast on `messages:{crewId}` → instant display
- **Receiver** (MessageList): Broadcast fires first (~50ms), Postgres Changes INSERT fires as backup
- `addMessage` deduplicates by id; broadcast payload is slim (core Message fields, no profile)
- MessageList resolves sender profiles from `profilesRef` (populated from server-fetched `memberProfiles`)
- Postgres Changes requires `messages` + `active_raids` in `supabase_realtime` publication (migration `20240103000001`)

### XP Sync — real-time for all crew members
- Sender: `addXP(10)` immediately (optimistic), then `setCrewXP(data.new_total_xp)` on response. Broadcasts `xp_update` on channel.
- Receivers: `receiveXP(earned, newTotal)` sets absolute XP + spawns XP float
- Broadcast deduplicates by `sender_id` — sender gets `setCrewXP` (no float), others get `receiveXP`

### Online Presence
- **Single presence channel**: ChatInput's `messages:{crewId}` is the sole presence channel — two concurrent channels from the same client causes interference
- `ch.track()` called in `.subscribe()` callback so every user enters presence on chat open
- `onlineUserIds` seeded with own ID on mount; `sync` handler always re-adds self
- **Visibility change re-track**: `visibilitychange` listener calls `ch.track()` — handles iOS PWA backgrounding where WebSocket reconnects without re-firing `SUBSCRIBED`
- ChatHeader updates `last_seen` in DB every 60s (for unread cursors) — separate from Realtime presence

### MessageList — stale-while-revalidate
- sessionStorage key `nexus-msgs-{crewId}`: load cached → `setMessages` + `setHistoryLoaded` in same tick (React 18 batches, no skeleton flash)
- Background fetch merges with Realtime messages; result saved back (capped 50)
- `setMessages([])` before cache/fetch prevents stale messages from a previous crew bleeding in
- Cache written even on early unmount — next visit gets a cache hit

### MessageList — scroll behaviour
- **Initial open**: instant `scrollTop = scrollHeight` jump when `historyLoaded` flips to `true`
- **New messages**: `bottomRef.scrollIntoView({ behavior: 'smooth' })` only when within 120px of bottom

### MessageList — message grouping
Consecutive messages from same user within 60 seconds are grouped (no repeated avatar/header).
- `lastUserId` + `lastMsgTime` reset on day dividers, boss cards, system messages, polls
- **Spacing**: first in group → `pt-[var(--space-6)] pb-0`; continuation → `pt-[var(--space-2)] pb-0`
- **Avatar**: rendered for first in group only; continuations use `pl-10` offset
- Pre-pass loop builds `groupXPMap` + `groupCoinMap`; group-leader bubble gets `xpOverride` prop
- **Bubble header format**: `username · [dot] · class · [dot] · +XP XP` — class `#b3b3b3`, XP `#f59e0b`

### ChatInput — @mention system
Typing `@` in the textarea triggers a member picker overlay (same visual pattern as `/` command picker).
- `mentionQuery` state: substring after the last `@` before cursor; `null` if whitespace/newline present
- **Picker**: all matching members (excluding self), filtered by username prefix; `motion.div` with `AnimatePresence`; scrollable, capped at `max-h-[220px]` (~5 rows visible)
- **Picker layout**: `absolute bottom-full left-0 right-0` inside a `relative` wrapper around the input bar — overlays the group details section above rather than pushing layout; outer container has `border border-border`; rows have `border-b border-border` except the last
- **Row anatomy**: 24×24 avatar + flex-col content (`@mention` label in Silkscreen `var(--text-mini)` purple; username in DM Sans `var(--text-xs)` primary); `p-2` padding, `var(--space-3)` gap
- Keyboard nav: ArrowUp/Down cycles, Enter completes, Escape dismisses; rows use `onMouseDown + e.preventDefault()` to prevent textarea blur
- `completeMention(username)`: replaces `@query` segment with `@username ` at cursor position
- **Overlay highlighting**: transparent textarea (`color: transparent; caretColor: white`) overlaid by `aria-hidden` div with matching font/padding. `renderHighlightedInput(text)` renders valid `@username` tokens as purple `<mark style={{ background:'transparent', color:'var(--color-purple)' }}>`. Scroll-synced via `overlayRef.scrollTop = textareaRef.scrollTop`.
- **Mentioned user IDs**: extracted in `send()` from `profilesRef.current` (fresh ref, no stale closure). Passed to `award-xp` as `mentioned_user_ids: string[]`.

### ChatInput — slash commands
Typing `/` triggers a command picker. Filtered as you type; Escape clears; Enter executes single match.
- **`SLASH_COMMANDS`**: `[{ name: 'birthdays', description: 'See upcoming squad birthdays' }]` — no emoji icon in picker UI
- **Picker layout**: `absolute bottom-full left-0 right-0` inside the same `relative` input wrapper as the mention picker — overlays group details; outer container has `border border-border`; rows have `border-b border-border` except the last; `max-h-[220px]` scrollable
- **Row anatomy**: command name in Silkscreen `var(--text-mini)` purple (`/name`); description in DM Sans `var(--text-xs)` tertiary; `p-2` padding; no icon
- `birthdaysCommandAction` (`chat/actions.ts`): inserts a `message_type: 'system'` message with upcoming birthday info. Birthday system messages get purple-tinted styling (`bg-[#1a0d2e] border-[#a855f7]/30`).

### ChatInput — send flow
`insert_message` RPC → `addMessage` (optimistic) → broadcast slim payload → `award-xp` edge function → `attack-boss` (if raid active)

- **Props**: `{ crewId, userId, userProfile, memberProfiles, crewName, inviteCode?, creatorId?, isDM? }`
- **DM mode**: member avatars + XP bar replaced by `"Chatting with [name]"` label; expanded panel hidden
- **Single channel**: `messages:{crewId}` handles broadcast, typing presence, and online presence
- **XP floats**: `opacity: [0,1,1,0]`, `y: [0,-12,-26,-42]` over 1.4s; anchored inline after member count text
- **XP progress bar spring**: `stiffness: 300, damping: 28` — do not drop below ~280

### ChatInput — expanded member panel (`SquadDetailsSheet`)
Triggered by swipe-up (`offset.y < -50` or `velocity.y < -300`) or chevron-up button. Component: `src/components/chat/SquadDetailsSheet.tsx`.

ChatInput wrapper: `relative z-[40]`; sheet: `absolute bottom-0 left-0 right-0 z-[50]`, `maxHeight: 85vh`, `flex flex-col`.

- **Header**: crew image (32×32, creator uploads via `CrewImageUploadModal`) + crew name (creator-editable inline via `MagicEdit`) + action icons: `MagicEdit` (rename), `Braces` (→ definitions), `Bell` (→ notif sheet), collapse chevron
- **Invite code block** (group chats only): crew code Silkscreen 24px `text-purple`; copy button toggles to green + "copied" for 1s; copies `"Come join my squad on Nexus app {code}"`
- **Member list** (`flex-1 overflow-y-auto nexus-scroll min-h-0`): avatar 32×32 + PixelSprite + name/class/msg count. Pull-to-dismiss via non-passive `touchmove`.
- **Footer**: CLOSE button; swipe-down also collapses

Props passed to `SquadDetailsSheet`: `crewId`, `crewName`, `memberCount`, `crewImageUrl`, `members`, `onlineUserIds`, `crewXP`, `crewLevel`, `xpProgress`, `totalMessages`, `inviteCode?`, `creatorId?`, `currentUserId`, `memberMsgCounts`, `loadingCounts`, `onUploadPhoto`, `onNotifPress`, `onSave`, `onTapMember`, `onRemoveMember`, `onClose`.

### award-xp — query batching + notifications
- **Batch 1** (always, parallel): previous msg gap + burst count + crew data + sender `is_dev` + other crew members — 5 queries
- **Batch 2** (if not spam-blocked, parallel): today's msg count + combo count + daily XP log count — 3 queries
- **Notifications fire fire-and-forget before XP writes** (~300ms earlier):
  - `mention_received` → mentioned users only; `message_received` → all other members (no double-notify)
  - `mentionedIds` from request body filtered against fetched `crew_members` for validity
- Anti-spam: (1) hard stop if prior msg <2000ms ago, (2) hard stop if ≥4 msgs in last 30s, (3) daily multiplier 1.0/0.5/0.1 at 30/60 messages
- Spam blocks XP + coins only — **notifications always fire**; do NOT add early returns before notification block

### MessageBubble — text rendering
`renderMessageContent(content, definitions, memberUsernames, onTapDef)` — two-pass renderer for `message_type === 'text'`:
1. **Pass 1**: split on `@username` tokens matched against `memberUsernames` Set → `{kind:'mention'}` + `{kind:'text'}` segments
2. **Pass 2**: apply `renderWithDefinitions` to text segments; render mentions as `<span style={{ color: 'var(--color-purple)' }}>@name</span>`

Used when `definitions.length > 0` or `memberUsernames.size > 0`. `memberUsernames` derived in `MessageList` via `useMemo` from `localProfiles`.

### HomeClient — realtime
- One `messages:{crewId}` broadcast channel per crew for live preview (no `postgres_changes` on messages)
- One `postgres_changes` UPDATE on `profiles` (channel `home-profile-coins:{userId}`) for live coin balance
- `router.refresh()` on every mount syncs stale preview data; `useEffect([initialCrews])` applies refreshed props into state

### Page Transitions — SlidePage + useSlideBack
All detail pages (chat, DM, profile, friends, vault) slide in from right on mount, slide back out on close.
- **`SlidePage`** (`src/components/ui/SlidePage.tsx`): enter spring 380/36 (~280ms); exit ease-in tween 280ms then `router.back()` or `router.replace(backHref)`
- **`backHref` prop**: used by `ProfileClient` (always `/home`) and chat when `?welcome=1` present
- **`useSlideBack()`**: hook returning `goBack` — use instead of `router.back()` in all back buttons on slide pages
- **Context scoping**: `ProfileClient` + `FriendsClient` define a local `BackButton` inside `<SlidePage>` (hook must be inside the context they provide)
- `WelcomeDetector` strips `?welcome=1` from URL via `window.history.replaceState`

### DM Page — `/dm/[friendId]`
- Server: verifies friendship → `get_or_create_dm(friendId)` RPC (idempotent) → renders chat UI
- **`DMOverlayBack`** (`src/components/chat/DMOverlayBack.tsx`): floating back + friend avatar box (`absolute z-20`); initializes `setCrewXP` + `setActiveRaid` on mount; updates `last_seen` every 60s
- Reuses `MessageList` + `ChatInput (isDM={true})` — same XP/boss pipeline

### PWA / Push Architecture
- **Service worker**: `public/sw-push.js` — handwritten; handles `push` + `notificationclick` only; no workbox precaching
  - Avoids multi-arg `importScripts()` which kills iOS Safari installation
  - Strips `badge` from `showNotification` (iOS rejects it); falls back to minimal `{body}` on rejection
- **Registration**: `SWRegister` — production-only, root layout
- **Subscription**: `subscribeToPush()` does INSERT only — no delete-first. `23505` (unique violation) = success. On other failure: auto-unsubscribe and create fresh APNs token. `PushRefresh` calls on every app mount.
- **Badge**: `BadgeClear` clears app badge on focus/visibilitychange
- **`message_received`**: title = `"Name from Group Name"`, body = content preview or `"sent"`
- **`mention_received`**: title = `"[sender] mentioned you in [crew]"`, body = content preview; gated by `notif_messages` pref
- **`recruit_arrived`**: title = "Your recruit arrived.", body = "[username] just entered the Nexus.", url = `/home`; no pref gate
- `VAPID_SUBJECT` **must** be `mailto:` URI — bare email breaks iOS APNs
- iOS push only works in standalone PWA mode (iOS 16.4+, added to Home Screen)
- **iOS foreground suppression**: push banners never show when PWA window is active — always test with PWA fully swiped away
- **iOS notification tag — CRITICAL**: must be unique per notification (append `-{timestamp}`) — shared tags silently replace without sound/banner
- **Debugging**: 401 from SEND TEST = deployed without `--no-verify-jwt`. `expired_deleted` = APNs 410'd; FORCE RESUB.
- VAPID env vars in **Supabase Edge Function secrets** (not Vercel)

### Adding a new notification type — checklist
1. Add to `NotificationType` union in `send-notification/index.ts`
2. Add to `PREF_COLUMN` map (`null` = always deliver, or map to pref column)
3. Add `case` to `buildPayload()` returning `{ title, body, icon, data: { url } }`
4. Call `send-notification` from trigger point
5. **Deploy**: `supabase functions deploy send-notification --project-ref tlveyeisjbythssmocth --no-verify-jwt`
   - `--no-verify-jwt` is mandatory every time — omitting it enables JWT verification and breaks all pushes from `award-xp`

### Edge function deployment rules
- **`git push` to Vercel does NOT deploy Supabase Edge Functions** — must run manually
- **Always `--no-verify-jwt` for `send-notification`**: `award-xp` calls it with no auth header → 401 without this flag
- `supabase functions deploy send-notification --project-ref tlveyeisjbythssmocth --no-verify-jwt`
- `supabase functions deploy award-xp --project-ref tlveyeisjbythssmocth`
- `supabase functions deploy react-to-message --project-ref tlveyeisjbythssmocth`
- `supabase functions deploy process-avatar --project-ref tlveyeisjbythssmocth --no-verify-jwt`

### Inter-function call pattern (award-xp → send-notification)
Call via raw `fetch()` with **no Authorization header** — do NOT use `supabase.functions.invoke()`:
```ts
const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`
fetch(fnUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({...}) })
```
`send-notification` accepts `user_id: string` (single) or `user_ids: string[]` (batch).

### Reactions System
- **Data model**: `messages.reactions` JSONB — `{ emoji: [userId, ...] }`. Empty arrays pruned.
- **Quick-pick emojis**: `['🔥', '💧', '⚡', '🌿', '🌑', '🔮']` — maps to six element types
- **Trigger**: long-press (500ms) or right-click → portal sheet on `document.body`. `hasMoved` ref cancels on scroll.
- **Text selection disabled**: `select-none` + `e.preventDefault()` on outer `touchstart` to suppress iOS callout
- **Optimistic update + rollback** via `updateMessage` in store
- **Edge function** (`react-to-message`): verifies membership, calls `toggle_reaction`, returns `{ reactions, hype_man_heal, heal_amount }`
- **Reaction chips**: sorted by count desc; own active chip `bg-[rgba(191,95,255,0.15)] border-[#bf5fff]`
- **Hype Man passive**: adding (not removing) a reaction awards 5 XP to crew; `MessageBubble` shows `+5 HEAL` float `#66bb6a`
- **Race-condition guard**: if DB UPDATE carries `reactions:{}` but local has reactions, preserve local until react-to-message UPDATE arrives

### Poll Feature
`polls` table; `message.content = 'POLL:{pollId}'`. `polls` in `supabase_realtime` publication.
- **Create**: `Chart` icon in ChatInput → `PollCreatorSheet`; calls `create_poll` RPC; durations: 30min / 6h / 1day
- **Render**: `MessageBubble` detects `message_type === 'poll'` → `<PollCard>`; fetches poll row, subscribes to `postgres_changes UPDATE`
- **Vote**: `vote_on_poll` RPC; one toggleable vote per user; optimistic + rollback
- Polls always force `showHeader = true` and reset message grouping; earn 0 XP

### Squad Glossary — `/chat/[crewId]/definitions`
Defined words highlighted blue in chat messages; tapping shows definition sheet.

**Data model**: `squad_definitions`. `word` stores comma-separated aliases (e.g. `"abg, ABG"`). Uniqueness via expression index `squad_definitions_crew_word_uq ON (crew_id, lower(word))`.

**Actions** (`definitions/actions.ts`): `createDefinitionAction` / `updateDefinitionAction` / `deleteDefinitionAction` — server-side auth + creator guard.

**`MessageList`** word highlighting: fetches definitions on mount; realtime on `ml-defs:{crewId}`. Passes `definitions` prop to each `<MessageBubble>`.

**`MessageBubble`** rendering via `renderWithDefinitions`:
- Expands aliases via `parseAliases`, sorts by length desc (prevents short alias shadowing longer one)
- Builds combined regex with `\b` word boundaries + `gi` flag
- Renders blue `<span>` (`text-[#60a5fa] cursor-pointer`) with `onClick → setActiveDefinition`
- Composed inside `renderMessageContent` as pass 2 — applied to text segments after @mentions are extracted

**Definition tap sheet** (portal, z-[80]): aliases label (Silkscreen 8px tertiary) + primary word (DM Sans Bold 16px `#60a5fa`) + definition body (DM Sans Regular 14px secondary) + "Created by : {username}" (purple if own, tertiary otherwise) + CLOSE button.

**Glossary page**: `FloatingBackButton` (absolute left-4 z-60 pill using `useSlideBack()`). Accessed via `Braces` icon in `SquadDetailsSheet` action row.

### Pixel Sprites
- Component: `src/components/game/PixelSprite.tsx`; sprites in `public/sprites/{spriteId}/{direction}.png` — 8 directions; 24×24px native
- Use plain `<img>` with `imageRendering: pixelated` — never `next/image` (iOS PWA quirks)
- `maxWidth: 'none'` on `<img>` required — Tailwind base reset caps sprite width at container width

## Caching Architecture

### Server (unstable_cache via createServiceClient)
Always use `createServiceClient()` inside cache functions — `createClient()` reads cookies. Verify auth with cookie client before calling cached function.

| Cache | TTL | Tag | Invalidated by |
|---|---|---|---|
| Home profile | 60s | `profile:{userId}` | saveBirthdayAction, revalidateProfileAction, updateAvatarAction |
| Home member profiles + counts | 60s | `crew-members:{crewId}` | joinCrewAction, leaveCrewAction, updateAvatarAction |
| Home last message preview | 30s | TTL only | — |
| Home friend profiles | 60s | `profile:{friendId}` | revalidateProfileAction, updateAvatarAction |
| Home friendships | 60s | `friends:{userId}` | sendFriendRequestAction, acceptFriendRequestAction, removeFriendAction |
| Active announcements | 60s | `announcements` | all announcement CRUD actions |
| Vault crew + artifacts | 300s | `vault:{crewId}`, `artifacts:{crewId}` | TTL only |
| Chat member profiles | 60s | `crew-members:{crewId}` | joinCrewAction, leaveCrewAction |
| Profile page | 60s | `profile:{userId}` | revalidateProfileAction |

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
| `nexus_dev_mode` | `'1'` | enables game event UI — only meaningful when `profiles.is_dev = true` |
| `nexus_push_diag` | `'1'` | shows push diagnostics block in dev section |
| `nexus_infinite_coins` | `'1'` | bypasses coin gate; shows `∞`; dev-only |
| `nexus_afk_exp` | `'1'` | AFK XP bar + CLAIM in AccountPreviewContainer; dev-only |
| `nexus_dismissed_banners` | JSON array of IDs | dismissed announcement IDs; filtered on mount |

## Disabled Features (wired for future)
- Voice notes: UI button removed; `XP_VALUES['voice']` + element type `lightning` still defined server-side
- Image upload: UI button removed; upload logic + `chat-images` bucket still exist

## Migrations (supabase/migrations/)
- `20240101000000` — initial schema, RLS, indexes, seed bosses
- `20240101000001` — push_subscriptions table
- `20240101000002` — crew_members.last_seen, damage_raid fn, increment_crew_xp fn
- `20240101000003` — push_subscriptions: crew_id nullable, endpoint UNIQUE, expiry_notif_sent
- `20240101000004` — leave_crew fn
- `20240101000005` — profiles.avatar_url, storage bucket
- `20240102000001` — notification_preferences table
- `20240102000002` — username unique via lower()
- `20240103000001` — ⚠ MUST BE APPLIED: supabase_realtime for messages + active_raids; insert_message fn
- `20240103000002` — UPDATE policy on push_subscriptions (needed for upsert)
- `20240103000003` — profiles.birthday date column
- `20240103000004` — crew_notification_preferences table
- `20240103000005` — get_unread_counts + get_crew_member_msg_counts RPCs
- `20240103000006` — get_member_crew_stats RPC
- `20240103000007` — profiles.coins, coin_log, increment_user_coins RPC, profiles in realtime
- `20240103000008` — handle_new_user signup bonus; retroactive coin award for existing users
- `20240103000009` — app_invites table + RLS
- `20240103000011` — reserved_users table
- `20240103000012` — messages.reactions JSONB + toggle_reaction fn
- `20240103000013` — profiles.custom_avatar + avatars storage bucket + RLS
- `20240103000015` — security: tightened chat-images INSERT policy
- `20240103000016` — avatars bucket 10MB limit, HEIC mime types
- `20240103000017` — profiles.avatar_storage_key
- `20240103000018` — crews.image_url + image_storage_key, crew-images bucket
- `20240103000019` — announcements table
- `20240103000020` — profiles.first_name + last_name; reserved_users same
- `20240103000021` — profiles.status (nullable, max 100 chars)
- `20240103000022` — polls table + RPCs; polls in realtime
- `20240103000023` — squad_definitions table + RLS; squad_definitions in realtime
- `20240103000024` — squad_definitions UPDATE policy (creator-only)

### Manual SQL applied directly
```sql
-- Dev mode flag
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_dev boolean NOT NULL DEFAULT false;
UPDATE profiles SET is_dev = true WHERE id IN (SELECT id FROM auth.users WHERE email IN ('shenraymonds@gmail.com', 'legaspi.riley@gmail.com'));

-- DM channel columns (2026-06-04)
ALTER TABLE crews ADD COLUMN IF NOT EXISTS is_dm boolean NOT NULL DEFAULT false;
ALTER TABLE crews ADD COLUMN IF NOT EXISTS dm_partner_1 uuid REFERENCES auth.users(id);
ALTER TABLE crews ADD COLUMN IF NOT EXISTS dm_partner_2 uuid REFERENCES auth.users(id);
-- get_or_create_dm fn + friendships table full DDL: see git history 2026-06-04
```

## Supabase Type System Rules
- All row interfaces **must** extend `Record<string, unknown>` — without it, `.from()` / `.rpc()` returns `never`
- All table definitions must include `Relationships: []`
- All RPCs must be declared in `Database.public.Functions` with `Args` + `Returns` before use
- `supabase/` directory must be excluded from `tsconfig.json` — Deno imports incompatible with Next.js compiler
- `Record<string, unknown>` property access → `unknown`; use `as` casts when assigning narrower types
- Supabase query builder returns `PromiseLike` not `Promise` — use `async/await` with try/catch; no `.catch()` chaining

## Code Rules
- TypeScript strict; server components by default; `'use client'` only when interactivity needed
- All game logic in Supabase Edge Functions; Realtime for all live state
- Mobile-first, 390px (iPhone 14); fonts: `font-pixel` (Press Start 2P), `font-body` (DM Sans), `font-silkscreen` (Silkscreen)
- Never hardcode constants; never expose `SUPABASE_SERVICE_ROLE_KEY` client-side
- Always handle loading + error states; add `loading.tsx` alongside every data-fetching `page.tsx`
- **Loading skeleton conventions**: wrap in `<DelayedSkeleton>` (300ms delay). `bg-border animate-pulse` on `bg-black`. Mirror real page layout precisely.
- Clean up Realtime subscriptions on unmount; use `cancelled` flag in async effects
- RLS on every table from day one
- Server data fetching: `Promise.all` for independent queries; staged — session first, then queries
- Logout from `/profile` only — `signOut()` then `router.push('/login')`
- Server actions creating/joining crews: call `revalidatePath('/home')` before redirect
- Edge Function notifications: single batch call to `send-notification` with `user_ids[]` — never loop per member
- `unstable_cache`: always `createServiceClient()` inside; verify auth first with cookie client

## Image Rules
- Always `next/image`; whitelist hostnames in `next.config.ts` under `images.remotePatterns`
- `unoptimized={isSupabaseStorage(url)}` on every Supabase image — avoids double-compression and Vercel image quota billing
- `resolveAvatarUrl(url, displaySize)` on every avatar src — swaps `-256` → `-128` for sizes ≤ 64px
- **Exceptions using plain `<img>`**: pixel sprites (`imageRendering: pixelated`), `AvatarUploadModal` crop target, hero background images in `ProfileClient.tsx` (`next/image fill` silently fails in iOS PWA standalone mode)
- Upload with `cacheControl: '31536000'`

### Avatar Upload
- `AvatarUploadModal`: `react-image-crop` (aspect=1) + canvas → 128px + 256px WebP (fallback JPEG → PNG) uploaded in parallel
- Bucket `avatars`: paths `{userId}/{ts}-128.{ext}` and `{userId}/{ts}-256.{ext}`; `cacheControl: '31536000'`
- `avatar_url` always points to 256px variant; `avatar_storage_key` is `{userId}/{ts}` prefix for bulk delete
- `updateAvatarAction`: writes URL + key + `custom_avatar:true`; bulk-deletes old variants; fires `process-avatar` fire-and-forget; revalidates caches
- `resetAvatarAction`: sets `custom_avatar:false`, restores Google URL, deletes stored variants
- `process-avatar` edge function: uses `npm:sharp` → 64/128/256px AVIF; deployed `--no-verify-jwt`
- `custom_avatar = true` prevents auth callback from overwriting with Google photo on next login

## Design Language

### Color Tokens
Defined in `globals.css :root` + `@theme` block for Tailwind utilities (e.g. `bg-surface`, `text-muted`, `border-border`).

| Token | CSS var | Value | Tailwind |
|---|---|---|---|
| Primary (text) | `--color-primary` | `#fafafa` | `text-primary` |
| Secondary | `--color-secondary` | `#e4e4e7` | `text-secondary` |
| Tertiary | `--color-tertiary` | `#a1a1aa` | `text-tertiary` |
| Muted | `--color-muted` | `#71717a` | `text-muted` |
| Border | `--color-border` | `#27272a` | `border-border` |
| Border hover | `--color-border-hover` | `#3f3f46` | `border-border-hover` |
| Surface (cards) | `--color-surface` | `#111111` | `bg-surface` |
| Purple (accent) | `--color-purple` | `#a855f7` | `bg-purple`, `text-purple` |
| Blue (definitions) | `--color-blue` | `#60a5fa` | `text-blue` |

Font size tokens: `--text-mini` (8px) → `--text-xxl` (24px). Figma shorthand aliases (`--mini`, `--md`, etc.) also resolve. Prefer hardcoded pixel values or `--text-*` names in new code.

Chat/game accent colors (inline, not tokenized):
| Role | Value |
|---|---|
| Background | `#000000` (home), `#0a0612` (chat) |
| Primary accent | `#bf5fff` (chat purple) |
| XP / gold | `#ffd700` |
| Amber (coins) | `#f59e0b` |
| Danger | `#ff4444` |
| Success/heal | `#66bb6a` |

### Font Roles
| Role | Font | Variable | Use |
|---|---|---|---|
| `font-pixel` | Press Start 2P | `--font-press-start-2p` | Game UI, logos, level badges, buttons |
| `font-body` | DM Sans | `--font-dm-sans` | Names, messages, timestamps |
| `font-silkscreen` | Silkscreen | `--font-silk` | XP stats, labels |

Note: next/font variable for Silkscreen is `--font-silk` (not `--font-silkscreen`) to avoid a circular reference with the `@theme` entry `--font-silkscreen: var(--font-silk)`.

### Icon Library — pixelarticons
- **Package**: `pixelarticons` — pixel art SVG React components; no CSS import needed
- **Usage**: `import { ComponentName } from 'pixelarticons/react/ComponentName'` → `<ComponentName style={{ width: N, height: N, color: 'X' }} aria-hidden="true" />`
- **Named exports only** — do NOT use default imports
- **Do not use lucide-react** for chat or home UI icons

| Location | Component | Import path | Size |
|---|---|---|---|
| Back buttons (all screens) | `ChevronLeft` | `pixelarticons/react/ChevronLeft` | 24×24, `color: var(--color-tertiary)` |
| Expand/collapse chevrons | `ChevronRight` (rotated) | `pixelarticons/react/ChevronRight` | 24×24 |
| ChatHeader — notifications | `Bell` / `BellOff` | `pixelarticons/react/Bell`, `BellOff` | 24×24 |
| ChatHeader — invite | `UserPlus` | `pixelarticons/react/UserPlus` | 24×24 |
| ChatInput — send | `Send` | `pixelarticons/react/Send` | 16×16 |
| ChatInput — create poll | `Chart` | `pixelarticons/react/Chart` | 16×16 |
| ChatInput — crew creator | `Crown` | `pixelarticons/react/Crown` | 12×12, `#f59e0b` |
| Copy / confirm | `Copy`, `Check` | respective paths | 12×12 |
| Home bottom bar — DMs | `Notebook` | `pixelarticons/react/Notebook` | 24×24 |
| Home bottom bar — Squad | `PlusBox` | `pixelarticons/react/PlusBox` | 16×16 |
| Home coin badge | `TokeCircle` | `pixelarticons/react/TokeCircle` | 24×16 (not square) |
| Home leave button | `Logout` | `pixelarticons/react/Logout` | 16×16, white |
| Profile menu icons | `MagicEdit`, `Bell` | respective paths | 16×16, `color: var(--color-secondary)` |
| InviteArsenal | `Coins` | `pixelarticons/react/Coins` | 16px |
| Friends — search | `Search` | `pixelarticons/react/Search` | 16×16 |
| Friends — accept/decline/remove | `Check`, `Close`, `UserMinus` | respective paths | 16/12/12px |
| SquadDetailsSheet — glossary | `Braces` | `pixelarticons/react/Braces` | 24×24, `text-primary` |

Framer Motion for all animations. Scanline overlay on game screens for RotMG feel.
