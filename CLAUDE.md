# Nexus

Group chat RPG: messages → XP → boss fights → artifacts. Pixel art (RotMG style).

## Stack
Next.js 16 App Router · TypeScript · Tailwind · Framer Motion · Zustand · Supabase (Auth, Postgres, Realtime, Storage, Edge Functions) · next-pwa v5 · Vercel

Icons: `pixelarticons` — `import { X } from 'pixelarticons/react/X'` · `<X style={{ width, height, color }} />` · named exports only · never lucide-react in chat/home UI

Build: `next build --webpack` (Turbopack breaks next-pwa + proxy.ts)

## Database Tables
```
profiles            id, username (unique case-insensitive), first_name, last_name, avatar_class, avatar_url, avatar_storage_key, custom_avatar (bool default false), birthday, is_dev, coins (int default 0), gem_balance (int default 0), last_gem_claim (timestamptz nullable), status (text nullable ≤100 chars), created_at
crews               id, name, invite_code (6 chars unique), level, total_xp, created_at, is_dm (bool default false), dm_partner_1 (uuid nullable), dm_partner_2 (uuid nullable), image_url, image_storage_key
crew_members        id, crew_id, user_id, class, joined_at, last_seen
messages            id, crew_id, user_id, content, message_type, element_type, xp_awarded, reactions (jsonb default '{}'), reply_to_id, reply_preview, reply_username, image_url, image_blur_hash, pinned (bool default false), pinned_by (uuid nullable), pinned_at (timestamptz nullable), pin_expires_at (timestamptz nullable), created_at
crew_xp_log         id, crew_id, user_id, xp_amount, source, created_at
bosses              id, name, type (void|ghost|flood|scheduled), max_hp, weak_element, description
active_raids        id, crew_id, boss_id, current_hp, max_hp, phase, started_at, expires_at, defeated_at, mvp_user_id, expiry_notif_sent
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
- `pin_message(p_message_id, p_duration_minutes?)` → jsonb — admin only, cap=5, duration≤525960 min
- `unpin_message(p_message_id)` → jsonb — admin only

## Game Values

XP: text=10 · voice=25 (disabled) · image=20 (disabled) · reaction=5 · poll=0 · first-msg-today=+20 · reply-60s-combo=+5

Coins: text/voice/image=1 · reaction/system=0 · generate-invite=−25 · seed-to-new-user=+50
- `handle_new_user` trigger → 50 signup bonus · invite alphabet: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
- Balance in `profiles.coins`; `chatStore.userCoins`; shown in `AccountPreview` (bare `TokeCircle` 24×16 + Silkscreen number) and profile hero glass badge
- Tap-tooltip: shows "25 COINS = 1 CREW INVITE" for 2s; coins awarded only when `xpBlocked = false`

Friendship XP: 1pt per DM send or @mention · 10pt daily cap (local midnight, tracked in `friendship_xp_log` by `sender_id`) · `award-friendship-xp` edge function · fully launched
- `friendship_xp` cumulative bilateral XP; canonical pair `user_a < user_b`; home card heart badge (purple→pink) + profile hero glass badge; realtime via `home-fxp-a:{userId}` + `home-fxp-b:{userId}`
- Tap-tooltip: "EARN FRIENDSHIP POINTS, SPEND ON COSMETICS SOON" for 2s

Gems: 1/day on first message in any crew · `award-gem` edge function + `claim_daily_gem` RPC are sole authority — client never awards
- `profiles.gem_balance` + `last_gem_claim`; both blocked from client writes by `profiles_protect_gem_columns` trigger
- Client gate (`src/lib/game/gems.ts`, idb-keyval `nexus_gem_claimed_at`): display/debounce only; checked in `ChatInput.send()` fire-and-forget
- Dev-gated (`nexus_gem_feature`): `GemCounter` in `FloatingBackButton` right-icon row, `GemToast` on earn; "Reset Gem Cooldown" nulls `last_gem_claim` for caller + clears idb-keyval key

Boss: The Void at every 500 XP · 48h window · 3 phases · defeat → artifact drop

Elements: fire=<20 chars · water=>150 chars · lightning=voice · nature=images · shadow=reactions · arcane=daily/system

Classes: Berserker (spam) · Sage (long) · Ghost (silence crit) · Hype Man (reactions) · The Voice (voice) · Meme Lord (images)

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

Dev section in `/profile/developer`: Announcements · Push Diagnostics (`nexus_push_diag`) · Infinite Coins (`nexus_infinite_coins`) · Spawn Boss Mode (`nexus_dev_mode`) · Chat Camera (`nexus_chat_camera`) · Gem Feature (`nexus_gem_feature`) · Pin Feature (`nexus_pin_feature`) · Reset Gem Cooldown · AFK Exp (`nexus_afk_exp`) · Infinite Friendship XP (`nexus_infinite_fxp`) · Reset Friendship XP

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
| `nexus_infinite_fxp` | `'1'` |
| `nexus_gem_feature` | `'1'` |
| `nexus_pin_feature` | `'1'` |
| `nexus_dismissed_banners` | JSON array of IDs |

## Architecture

### Realtime / Messaging
- Channel `messages:{crewId}`: broadcast (sender→instant) + Postgres Changes INSERT (backup) + presence + typing
- `addMessage` deduplicates by id; broadcast payload has no profile (resolved from `profilesRef`)
- XP sync: sender `addXP(n)` optimistic → `setCrewXP(data.new_total_xp)` → broadcasts `xp_update`; receivers `receiveXP(earned, newTotal)`; dedup by `sender_id`
- Presence: sole channel is ChatInput's `messages:{crewId}` (two concurrent channels = interference); `visibilitychange` re-tracks (iOS PWA reconnect)

### MessageList
- stale-while-revalidate: `nexus-msgs-{crewId}` → load + `setHistoryLoaded` same tick → background fetch merges (cap 50); `setMessages([])` before load prevents crew bleed
- Scroll: initial → `scrollTop = scrollHeight`; new msg → `scrollIntoView('smooth')` only within 120px of bottom
- Grouping: consecutive same-user within 60s · reset on day dividers / boss cards / system msgs / polls
- Pre-pass builds `groupXPMap` + `groupCoinMap`; group leader gets `xpOverride` prop
- Postgres Changes UPDATE: skip `reactions:{}` when local has reactions (award-xp race); patch also picks up pin fields (`pinned`, `pinned_by`, `pinned_at`, `pin_expires_at`)
- Each bubble wrapped in `<div id="msg-{id}">` for scroll-to-pin

### MessageBubble — text rendering
`renderMessageContent` — splits on `@username` tokens, then `renderWithLinks` (URL → `<a>`) + `renderWithDefinitions` (alias regex → blue `<span>`) on each text segment. Early returns for `message_type === 'system'` and `'poll'` narrow type before the reaction sheet render.

Long-press sheet (500ms / right-click) → emoji quick-pick + Reply + Copy Text + Pin (admin only). `PinDurationSheet` portal opens when pin tapped.

OG previews: `extractFirstUrl` → `useOGPreview` hook → `<LinkPreviewCard>` below body; text-only messages without `image_url` only.

### ChatInput
- Props: `{ crewId, userId, userProfile, memberProfiles, crewName, inviteCode?, creatorId?, isDM? }`
- Send flow: `insert_message` RPC → `addMessage` (optimistic) → broadcast → `award-xp` → `attack-boss` (if raid)
- Textarea: max 3 lines / 91px; input bar inactive `border-border` / focused `border-purple`; `minHeight: 48`
- @mention overlay: transparent textarea + `aria-hidden` div; purple `<mark>` for valid tokens; overlay scrollTop synced
- Slash commands: `/birthdays` → `message_type: 'system'`
- Camera button + image upload gated on `nexus_chat_camera`; DM mode hides XP bar + expanded panel

### Pin Feature (dev-gated: `nexus_pin_feature`)
- Admin = crew member with earliest `joined_at`; cap = 5 active pins per crew (`PIN_MAX_PER_CREW`)
- `pin_message` / `unpin_message` RPCs only — `messages_protect_pin_columns` trigger blocks direct client writes
- `PinDurationSheet` (`src/components/chat/PinDurationSheet.tsx`): two-step confirm → duration picker (presets + custom); opened from long-press sheet
- `PinListSheet` (`src/components/chat/PinListSheet.tsx`): lists active pins; admin row = ON/OFF visibility toggle + Unpin button
- `MarqueeBanner` (`src/components/ui/MarqueeBanner.tsx`): shared marquee; accepts `items[]` for multi-pin continuous scroll (`msg @user • msg @user • …`); also used by ProfileStatusTicker (single `text` prop)
- `FloatingBackButton`: `Note` icon button (count badge) + ticker strip below nav; ticker filters `hiddenPinIds` (chatStore Set, in-memory); tapping ticker scrolls to first visible pin
- `selectActivePins(messages)` exported from chatStore; `hiddenPinIds` + `toggleHiddenPin` in chatStore

### SquadDetailsSheet (`src/components/chat/SquadDetailsSheet.tsx`)
Trigger: swipe-up or chevron-up · sheet: `z-[70]` (above ticker's z-[60], below action sheets z-[80+]) · `maxHeight: 85vh`
- Header icons (right, `gap-[--space-5]`): `MagicEdit` (rename, creator only) · `Library` (→ `/chat/[crewId]/definitions`) · `ChevronRight` rotated 90° (close)
- Member row right side: `User` 16×24 (→ profile) · `MailRight` 16×24 (→ `/dm/[memberId]`, hidden for own row) · `UserMinus` 24×24 red (remove, creator only on others)
- Props: `onOpenGlossary?` + `onDMPress?(memberId)` wired in `ChatInput.tsx`
- Invite code copy: `"Come join my squad on Nexus app {code}"`

### InboxClient (`src/app/(app)/friends/inbox/InboxClient.tsx`)
Single-row `InboxCardPreview` component: avatar 48px · DM Sans Bold name · status subtitle (DM Sans 14px)
- Incoming ("Wants to be your friend"): status `--color-secondary` · green `Check` 16×16 + red `Close` 16×16 icon-only buttons inline
- Outgoing ("Sent friend request"): status `--yellow` · red-bordered `Close` 16×16 icon-only button inline (no fill)

### HomeClient
- Realtime: one `messages:{crewId}` broadcast per crew + `postgres_changes UPDATE` on `profiles` + two friendship XP channels (`home-fxp-a/b:{userId}`)
- Auto-sort by `lastMessage.created_at` desc; Framer Motion `layout` animates; channel dep `[...crewIds].sort().join(',')`
- `handleCrewTap`: sets `sessionStorage.nexus_chat_from = '/home'` before push

### Page Transitions (`src/components/ui/SlidePage.tsx`)
- Enter: spring 380/36; skipped on back-nav via `_skipNextSlideEnter` module flag
- Exit: ease-in 150ms; navigation fires in `.then()` after animation
- `nativeSwipe`: no touch handlers (iOS native gesture); `useSlideBack()` hook — use instead of `router.back()`
- `FloatingBackButton`: injects `/home` into history via `replaceState` + `pushState` so swipe-back lands on home

### DM — `/dm/[friendId]`
Server: verifies friendship → `get_or_create_dm(friendId)` → renders chat. `DMOverlayBack`: floating back + friend avatar; initializes `setCrewXP` + `setActiveRaid`; updates `last_seen` every 60s

### award-xp
- Batch 1 (parallel): prev msg gap + burst count + crew data + sender `is_dev` + other members
- Batch 2 (parallel, if not spam-blocked): today msg count + combo count + daily XP log count
- Anti-spam: hard stop <2000ms gap · hard stop ≥4 msgs/30s · daily multiplier 1.0/0.5/0.1 at 30/60 msgs
- Notifications fire-and-forget BEFORE XP writes — do NOT add early returns before notification block

### Reactions
- `messages.reactions` JSONB: `{ emoji: [userId,...] }`, empty arrays pruned
- Long-press 500ms or right-click → portal sheet; `hasMoved` ref cancels on scroll; `select-none` + `e.preventDefault()` (iOS callout)
- `handleReaction`: optimistic → `supabase.functions.invoke('react-to-message')` → apply `data.reactions`; rollback only on `FunctionsHttpError`
- `react-to-message` returns `{ reactions, hype_man_heal, heal_amount }`; Hype Man +5 XP float

### Polls
`message.content = 'POLL:{pollId}'` · `polls` in supabase_realtime · `Chart` → `PollCreatorSheet` → `create_poll` RPC · `vote_on_poll` one toggleable vote · always `showHeader = true`; 0 XP

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
| Home last message preview | 30s | TTL only | — |
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
| ChatInput — creator | `Crown` | 12×12, `var(--color-coins)` |
| Coin badge | `TokeCircle` | 24×16 (not square) |
| AccountPreview — friends | `Notebook` | 12×12, `var(--color-purple)` |
| AccountPreview — invite | `Plus` | 12×12, `var(--color-primary)` |
| Copy / confirm | `Copy`, `Check` | 12×12 |

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
- `20240103000031` — messages UPDATE policy; insert_message + p_image_url + p_image_blur_hash
- `20240103000032` — drop old insert_message overloads (ambiguous RPC fix)
- `20240103000035` — profiles.gem_balance + last_gem_claim, claim_daily_gem, profiles_protect_gem_columns trigger
- `20240103000036` — messages pin columns, messages_protect_pin_columns trigger, pin_message + unpin_message RPCs

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
- Table definitions must include `Relationships: []`
- All RPCs declared in `Database.public.Functions` with `Args` + `Returns` before use
- `supabase/` excluded from `tsconfig.json` (Deno imports incompatible)
- Query builder returns `PromiseLike` — async/await + try/catch only; no `.catch()` chaining

## Disabled Features
- Voice notes: UI removed; `XP_VALUES['voice']` + element `lightning` still defined server-side
- Image upload in chat: dev-only via `nexus_chat_camera`; upload logic + `chat-images` bucket fully functional

## Gotchas
- `CREATE OR REPLACE FUNCTION` only replaces if signature matches exactly. Adding/removing params creates a new overload — multiple all-DEFAULT overloads cause ambiguous RPC errors. Always `DROP FUNCTION` old signatures before recreating with a different param list.
