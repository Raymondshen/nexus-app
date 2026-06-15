# Nexus

Group chat RPG: messages → XP → boss fights → artifacts. Pixel art (RotMG style).

## Stack
Next.js 16 App Router · TypeScript · Tailwind · Framer Motion · Zustand · Supabase (Auth, Postgres, Realtime, Storage, Edge Functions) · next-pwa v5 · Vercel

Icons: `pixelarticons` — `import { X } from 'pixelarticons/react/X'` · `<X style={{ width, height, color }} />` · named exports only · never lucide-react in chat/home UI

Build: `next build --webpack` (Turbopack breaks next-pwa + proxy.ts)

## Database Tables
```
profiles            id, username (unique case-insensitive), first_name, last_name, avatar_class, avatar_url, avatar_storage_key, custom_avatar (bool default false), birthday, is_dev, coins (int default 0), status (text nullable ≤100 chars), created_at
crews               id, name, invite_code (6 chars unique), level, total_xp, created_at, is_dm (bool default false), dm_partner_1 (uuid nullable), dm_partner_2 (uuid nullable), image_url, image_storage_key
crew_members        id, crew_id, user_id, class, joined_at, last_seen
messages            id, crew_id, user_id, content, message_type, element_type, xp_awarded, reactions (jsonb default '{}'), reply_to_id (uuid nullable), reply_preview (text nullable), reply_username (text nullable), image_url (text nullable), image_blur_hash (text nullable), created_at
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
```

DM channels: `crews` rows with `is_dm = true` · `dm_partner_1 < dm_partner_2` (UUID order, enforced by `get_or_create_dm`) · both partners in `crew_members` class=berserker · filtered from home Squads; shown in Friends only

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

## Game Values

XP: text=10 · voice=25 (disabled) · image=20 (disabled) · reaction=5 · poll=0 · first-msg-today=+20 · reply-60s-combo=+5

Coins: text/voice/image=1 · reaction/system=0 · generate-invite=−25 · seed-to-new-user=+50
- `handle_new_user` trigger → 50 signup bonus (source=`signup_bonus`)
- Invite alphabet: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, up to 10 uniqueness retries
- Balance in `profiles.coins`; `chatStore.userCoins`; shown in `AccountPreviewContainer` only (amber pill: `TokeCircle` 24×16 + Silkscreen 12px `var(--color-coins)`)
- Coins awarded only when `xpBlocked = false`

Boss: The Void at every 500 XP · 48h fight window · 3 phases (100–60%, 60–30%, 30–0%) · defeat → artifact drop

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

Existing members: "SIGN IN WITH GOOGLE" · no `profiles.username` → `/login?error=no_account`

Error copy: invalid → "The Nexus does not recognize this code." · used → "This code has already been claimed." · generic → "The rift destabilized. Try again."

### Onboarding
`name → /onboarding/birthday → /onboarding/class → /onboarding/welcome → chat/crew`
- Class guard on `crew_members.class`, NOT `profiles.avatar_class` (global caused redirect loops)
- `selectClassAction` → welcome ONLY when `crew_members` count = 1
- Welcome screen: marks invite used + 50 seed coins + `recruit_arrived` push to inviter (`Promise.all`)

## Dev Mode
`profiles.is_dev = true` — grant: `UPDATE profiles SET is_dev = true WHERE id IN (SELECT id FROM auth.users WHERE email = '...')`

Dev section in `/profile/developer`: Announcements management · Push Diagnostics (`nexus_push_diag`) · Infinite Coins (`nexus_infinite_coins`) · Spawn Boss Mode (`nexus_dev_mode`) · Chat Camera (`nexus_chat_camera`) · AFK Exp (`nexus_afk_exp`)

Server-side (`award-xp`): boss spawn + `LEVEL_UP:` only when `isDevUser = true`

Client-side (`localStorage.nexus_dev_mode === '1'`):
- `MessageList`: hides BOSS_SPAWN: / ARTIFACT_DROP: / LEVEL_UP: system messages; boss cards; artifact drops; level-up banners
- `ChatHeader` / `DMOverlayBack`: hides boss HP bar + countdown
- `ChatInput`: hides DamageFloat, "Next Boss" label, RAID ACTIVE indicator

## Storage Keys

sessionStorage:
| Key | Value |
|---|---|
| `nexus-msgs-{crewId}` | JSON message array (50 msg cap) |
| `nexus_chat_from` | `'/home'` |

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
| `nexus_dismissed_banners` | JSON array of IDs |

## Architecture

### Realtime / Messaging
- Channel `messages:{crewId}`: broadcast (sender→instant) + Postgres Changes INSERT (backup) + presence + typing
- `addMessage` deduplicates by id; broadcast payload has no profile (resolved from `profilesRef`)
- Postgres Changes requires `messages` + `active_raids` in `supabase_realtime` publication (migration `20240103000001`)
- XP sync: sender `addXP(n)` optimistic → `setCrewXP(data.new_total_xp)` on response → broadcasts `xp_update`; receivers `receiveXP(earned, newTotal)` (float + absolute set); dedup by `sender_id`
- Presence: sole channel is ChatInput's `messages:{crewId}` (two concurrent channels = interference) · `ch.track()` in `.subscribe()` callback · `visibilitychange` re-tracks (iOS PWA reconnect)
- `last_seen` updated every 60s in ChatHeader (unread cursors, separate from Realtime presence)

### MessageList
- stale-while-revalidate: `nexus-msgs-{crewId}` → load + `setHistoryLoaded` same tick → background fetch merges, saved (cap 50)
- `setMessages([])` before cache/fetch prevents crew bleed
- Scroll: initial → `scrollTop = scrollHeight`; new msg → `bottomRef.scrollIntoView('smooth')` only within 120px of bottom
- Grouping: consecutive same-user within 60s · reset on day dividers / boss cards / system msgs / polls
- System messages (`BirthdayMessage`, `JoinMessage`, generic `SystemMessage`): `marginTop/Bottom: var(--space-6)` (20px)
- First in group: `pt-[var(--space-6)] pb-0`; continuation: `pt-[var(--space-2)] pb-0 pl-10`
- Bubble header: `username · class · +XP XP` — class `var(--color-paper-150)`, XP `var(--color-coins)`
- Pre-pass builds `groupXPMap` + `groupCoinMap`; leader gets `xpOverride` prop
- Word highlighting: definitions fetched on mount, realtime on `ml-defs:{crewId}`; passes `definitions` to each `<MessageBubble>`
- Postgres Changes UPDATE guard: skip `reactions:{}` when local has reactions (award-xp race)

### MessageBubble — text rendering
`renderMessageContent(content, definitions, memberUsernames, onTapDef)` — two-pass:
1. Split on `@username` tokens → `{kind:'mention'}` + `{kind:'text'}` segments
2. `renderWithDefinitions` on text segments; mentions → `<span style={{ color: 'var(--color-purple)' }}>@name</span>`

`renderWithDefinitions`: expands aliases via `parseAliases`, sort by length desc, `\b` regex `gi`, blue `<span>` (`text-blue cursor-pointer`) → `setActiveDefinition`

`renderWithLinks`: runs before `renderWithDefinitions`; detects `https?://` URLs → `<a>` with `wordBreak: 'break-all'` (URLs have no natural break points); remaining text segments fed into `renderWithDefinitions`

OG previews: `extractFirstUrl` → `useOGPreview` hook (debounced, cached) → `<LinkPreviewCard>` renders below message body; iMessage-style 4:3 image + bold title + hostname; only for `message_type === 'text'` with no `image_url`; text `<p>` has `overflowWrap: 'break-word'` to prevent long strings from overflowing

### ChatInput
- Props: `{ crewId, userId, userProfile, memberProfiles, crewName, inviteCode?, creatorId?, isDM? }`
- Send flow: `insert_message` RPC → `addMessage` (optimistic) → broadcast slim payload → `award-xp` → `attack-boss` (if raid)
- XP progress bar spring: `stiffness: 300, damping: 28` (do not drop below ~280)
- Poll icon: `motion.div` animates `width` 16→0, `opacity` 1→0, `marginRight` 0→-16 on focus (spring 320/28)
- Textarea: max 3 lines / 91px (`rows={1}`, `overflowY: auto`)
- Input bar: inactive `border-border` / focused `border-purple`; `padding: var(--space-5)`; `gap: var(--space-5)`; `minHeight: 48`; icons 16×16
- Placeholders: group → `'Message the squad...'` · DM → `'Send a message...'` · raid → `'Attack The Void...'`
- @mention picker: `absolute bottom-full left-0 right-0`; `max-h-[220px]`; rows `border-b border-border`; row = 24×24 avatar + `@mention` (Silkscreen `--text-mini` purple) + username (DM Sans `--text-xs`)
- Slash commands: `SLASH_COMMANDS = [{ name: 'birthdays', description: 'See upcoming squad birthdays' }]`; `birthdaysCommandAction` → `message_type: 'system'`; styling `bg-[var(--color-system-msg)] border-[var(--color-purple)]/30`
- @mention overlay: transparent textarea (`color: transparent; caretColor: white`) + `aria-hidden` div; purple `<mark style={{ background:'transparent', color:'var(--color-purple)' }}>` for valid tokens; `overlayRef.scrollTop = textareaRef.scrollTop`
- Mentioned IDs extracted in `send()` from `profilesRef.current`; passed to `award-xp` as `mentioned_user_ids`
- DM mode: replaces member avatars + XP bar with "Chatting with [name]" label; hides expanded panel
- Camera button + image preview bar gated on `nexus_chat_camera` localStorage flag (set via Developer Settings); image send passes `p_image_url` + `p_image_blur_hash` atomically to `insert_message` RPC

### SquadDetailsSheet (`src/components/chat/SquadDetailsSheet.tsx`)
Trigger: swipe-up (`offset.y < -50` or `velocity.y < -300`) or chevron-up
- Wrapper: `relative z-[40]`; sheet: `absolute bottom-0 left-0 right-0 z-[50]`, `maxHeight: 85vh`
- Header: crew image 32×32 + crew name + action icons: `MagicEdit` (rename) · `Braces` (→ definitions) · `Bell` (→ notif sheet)
- Invite code: Silkscreen 24px `text-purple`; copy → green + "copied" 1s; copies `"Come join my squad on Nexus app {code}"`
- Member list: `flex-1 overflow-y-auto nexus-scroll min-h-0`; avatar 32×32 + PixelSprite + name/class/msg count

### HomeClient
- Scroll: `h-screen overflow-hidden flex flex-col`; account card + banner `flex-shrink-0`; list `flex-1 overflow-y-auto min-h-0`
- `AccountPreviewContainer` buttons: "friends" (`border border-purple bg-black`, `Notebook` 12×12) · "Invite squad" (`bg-purple`, `Plus` 12×12); both Silkscreen `--text-mini`
- `handleCrewTap`: `sessionStorage.nexus_chat_from = '/home'` before pushing to `/chat/{crewId}`
- Realtime: one `messages:{crewId}` per crew (broadcast only) + `postgres_changes UPDATE` on `profiles` (`home-profile-coins:{userId}`)
- Auto-sort: `applyNewMessage` re-sorts by `lastMessage.created_at` desc; Framer Motion `layout` animates; channel dep uses `[...crewIds].sort().join(',')` (set-stable)

### Page Transitions (`src/components/ui/SlidePage.tsx`)
- Enter: spring 380/36; skipped on back-nav (`controls.set({ x: 0 })`) via `_skipNextSlideEnter` module flag
- Exit: ease-in 150ms; navigation fires in `.then()` after animation
- `backHref` always `/home` for chat + ProfileClient
- `nativeSwipe` prop: no touch handlers registered (iOS native handles gesture)
- `useSlideBack()` hook — use instead of `router.back()` in all back buttons
- `FloatingBackButton` (`src/components/chat/FloatingBackButton.tsx`): reads `sessionStorage.nexus_chat_from`; if `'/home'` skips normalization; else injects `/home` via `replaceState({ __NA: true }, '', '/home')` then `pushState`

### DM — `/dm/[friendId]`
Server: verifies friendship → `get_or_create_dm(friendId)` → renders chat
`DMOverlayBack` (`src/components/chat/DMOverlayBack.tsx`): floating back + friend avatar; initializes `setCrewXP` + `setActiveRaid`; updates `last_seen` every 60s

### award-xp
- Batch 1 (parallel): prev msg gap + burst count + crew data + sender `is_dev` + other crew members
- Batch 2 (parallel, if not spam-blocked): today msg count + combo count + daily XP log count
- Anti-spam: hard stop <2000ms gap · hard stop ≥4 msgs/30s · daily multiplier 1.0/0.5/0.1 at 30/60 msgs
- Notifications fire-and-forget BEFORE XP writes; spam blocks XP+coins only — do NOT add early returns before notification block
- `mention_received` → mentioned users; `message_received` → all other members (no double-notify)

### Reactions
- `messages.reactions` JSONB: `{ emoji: [userId,...] }`, empty arrays pruned
- Long-press 500ms or right-click → portal sheet on `document.body`; `hasMoved` ref cancels on scroll
- `select-none` + `e.preventDefault()` on touchstart (iOS callout)
- `handleReaction`: optimistic `updateMessage` → `supabase.functions.invoke('react-to-message')` (live session JWT) → apply `data.reactions` if non-null; rollback only on `FunctionsHttpError`
- `react-to-message` returns `{ reactions, hype_man_heal, heal_amount }` · Hype Man: +5 XP float `var(--color-success)`
- Reaction chips: sorted count desc; active chip `bg-[var(--color-chat-purple)]/15 border-[var(--color-chat-purple)]`
- MessageList UPDATE guard: skip `reactions:{}` when local has reactions

### Polls
`message.content = 'POLL:{pollId}'` · `polls` in `supabase_realtime`
- Create: `Chart` → `PollCreatorSheet` → `create_poll` RPC; durations: 30min / 6h / 1day
- Render: `MessageBubble` → `<PollCard>`; subscribes to `postgres_changes UPDATE`
- Vote: `vote_on_poll` RPC; one toggleable vote; optimistic + rollback
- Always `showHeader = true`; resets grouping; 0 XP

### Squad Glossary (`/chat/[crewId]/definitions`)
`word` stores comma-separated aliases; UNIQUE INDEX `(crew_id, lower(word))`
- Highlighting: blue `<span>` (`text-blue cursor-pointer`); `renderWithDefinitions` sorts aliases by length desc, `\b` regex `gi`
- Suggestion flow: non-creator → `SuggestDefinitionSheet`; creator sees `ReviewSuggestionSheet` (`src/components/chat/ReviewSuggestionSheet.tsx`) when `suggestion_count > 0`; realtime on `definition_suggestions` (REPLICA IDENTITY FULL)
- Definition tap sheet: z-[80] portal; Silkscreen 8px aliases; DM Sans Bold 16px `var(--color-blue)` word; DM Sans 14px definition; creator tag purple if own
- Bottom sheet spacing: outer `gap-[var(--space-7)]` · field groups `gap-[var(--space-5)]` · label-input `gap-[var(--space-3)]` — always token vars, never `gap-N`

### Pixel Sprites (`src/components/game/PixelSprite.tsx`)
`public/sprites/{spriteId}/{direction}.png` · 8 directions · 24×24px · plain `<img imageRendering: pixelated>` (never `next/image`) · `maxWidth: 'none'` required

### AnnouncementBanner (`src/components/ui/AnnouncementBanner.tsx`)
Below `AccountPreviewContainer` in home scrollable body · `bg-[var(--color-blue)]/10 border border-[var(--color-blue)] rounded-[8px]` · `Megaphone` + `Close` icons · "NEW UPDATES" Silkscreen `--text-mini` · pagination dots (2+): active `var(--color-blue)` 12px, inactive `var(--color-blue)`/30 4px · swipe `'x'`, `dragElastic 0.15`, 40px threshold

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

Deploy commands:
```
supabase functions deploy send-notification --project-ref tlveyeisjbythssmocth --no-verify-jwt
supabase functions deploy award-xp --project-ref tlveyeisjbythssmocth
supabase functions deploy react-to-message --project-ref tlveyeisjbythssmocth
supabase functions deploy process-avatar --project-ref tlveyeisjbythssmocth --no-verify-jwt
```

`git push` does NOT deploy edge functions — must run manually

Inter-function calls (award-xp → send-notification): raw `fetch()`, no Authorization header — never `supabase.functions.invoke()`:
```ts
fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({...})
})
```
`send-notification` accepts `user_id: string` or `user_ids: string[]`

New notification type checklist:
1. Add to `NotificationType` union in `send-notification/index.ts`
2. Add to `PREF_COLUMN` map (`null` = always deliver)
3. Add `case` to `buildPayload()` → `{ title, body, icon, data: { url } }`
4. Call `send-notification` from trigger point
5. Deploy with `--no-verify-jwt`

## PWA / Push
- SW: `public/sw-push.js` — handwritten, push + notificationclick only, no workbox
- No multi-arg `importScripts()` (kills iOS Safari installation)
- Strip `badge` from `showNotification` (iOS rejects); fallback to `{body}`
- Subscribe: INSERT only, no delete-first; `23505` = success; on failure auto-unsubscribe + fresh APNs token
- VAPID vars in Supabase Edge Function secrets (not Vercel); `VAPID_SUBJECT` must be `mailto:` URI
- iOS: standalone PWA only (16.4+); foreground = no banner; notification `tag` must be unique per notification (`-{timestamp}`)
- `message_received`: title = `"Name from Group Name"`, body = content or `"sent"`
- `mention_received`: title = `"[sender] mentioned you in [crew]"`, body = content; gated by `notif_messages`
- `recruit_arrived`: title = "Your recruit arrived.", body = "[username] just entered the Nexus.", url = `/home`; no pref gate
- Debugging: 401 = deployed without `--no-verify-jwt`; `expired_deleted` = APNs 410'd → FORCE RESUB

## Images
- `next/image` everywhere; whitelist in `next.config.ts` `images.remotePatterns`
- `unoptimized={isSupabaseStorage(url)}` on every Supabase image
- `resolveAvatarUrl(url, displaySize)` on every avatar src (swaps `-256` → `-128` for ≤ 64px)
- Plain `<img>`: pixel sprites · `AvatarUploadModal` crop target · hero backgrounds in `ProfileClient.tsx`
- `cacheControl: '31536000'` on uploads

Avatar upload: `AvatarUploadModal` → `react-image-crop` (aspect=1) → canvas → 128 + 256px WebP → bucket `avatars` paths `{userId}/{ts}-128.ext` + `{userId}/{ts}-256.ext`
- `avatar_url` → 256px; `avatar_storage_key` = `{userId}/{ts}` prefix
- `process-avatar`: `npm:sharp` → 64/128/256px AVIF; deployed `--no-verify-jwt`
- `custom_avatar = true` prevents auth callback from overwriting with Google photo

## Design Tokens (`src/app/globals.css`)
Colors: `--color-primary` · `--color-surface` · `--color-border` · `--color-purple` · `--color-blue` · `--color-tertiary` · `--color-secondary` · `--color-paper-150`

Game/chat: `--color-bg-chat` (#0a0612) · `--color-chat-purple` (#bf5fff) · `--color-xp` (#ffd700) · `--color-coins` (#f59e0b) · `--color-danger` (#ff4444) · `--color-success` (#66bb6a) · `--color-system-msg` (#1a0d2e)

Fonts:
| Class | Font | Use |
|---|---|---|
| `font-pixel` | Press Start 2P | Game UI, logos, level badges, buttons |
| `font-body` | DM Sans | Names, messages, timestamps |
| `font-silkscreen` | Silkscreen | XP stats, labels |

Silkscreen next/font var: `--font-silk` (not `--font-silkscreen`)

Font sizes: `--text-mini` (8px) → `--text-xxl` (24px); Figma aliases `--mini`, `--md` etc. resolve too · Spacing: `--space-*`

Icons (`pixelarticons`):
| Location | Component | Size |
|---|---|---|
| Back buttons (chat/nav) | `ChevronLeft` | 24×24, `var(--color-tertiary)` |
| Profile back button | `ChevronLeft` | 24×24, `var(--color-primary)`; container `bg-black border-primary` |
| Expand/collapse | `ChevronRight` (rotated) | 24×24 |
| ChatHeader — notifs | `Bell` / `BellOff` | 24×24 |
| ChatHeader — invite | `UserPlus` | 24×24 |
| ChatInput — send | `Send` | 16×16 |
| ChatInput — poll | `Chart` | 16×16 |
| ChatInput — creator | `Crown` | 12×12, `var(--color-coins)` |
| Copy / confirm | `Copy`, `Check` | 12×12 |
| AccountPreview — friends | `Notebook` | 12×12, `var(--color-purple)` |
| AccountPreview — invite | `Plus` | 12×12, `var(--color-primary)` |
| Coin badge | `TokeCircle` | 24×16 (not square) |
| Leave | `Logout` | 16×16, white |
| Profile menu | `MagicEdit`, `Bell` | 16×16, `var(--color-secondary)` |
| InviteArsenal | `Coins` | 16px |
| Friends search | `Search` | 16×16 |
| Friends — accept/decline/remove | `Check`, `Close`, `UserMinus` | 16/12/12px |
| Glossary | `Braces` | 24×24, `text-primary` |

## Migrations (`supabase/migrations/`)
- `20240101000000` — initial schema, RLS, indexes, seed bosses
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
- `20240103000020` — profiles.first_name, last_name; reserved_users same
- `20240103000021` — profiles.status (nullable, max 100 chars)
- `20240103000022` — polls + RPCs; polls in realtime
- `20240103000023` — squad_definitions + RLS; in realtime
- `20240103000024` — squad_definitions UPDATE policy (creator-only)
- `20240103000025` — squad_definitions actual_word
- `20240103000026` — definition_suggestions + RLS + realtime (REPLICA IDENTITY FULL)
- `20240103000031` — messages UPDATE policy (own rows); insert_message extended with p_image_url + p_image_blur_hash (atomic image insert)
- `20240103000032` — drop old insert_message overloads (3-param json + 6-param messages) that caused ambiguous RPC calls

Manual SQL applied directly:
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_dev boolean NOT NULL DEFAULT false;
UPDATE profiles SET is_dev = true WHERE id IN (SELECT id FROM auth.users WHERE email IN ('shenraymonds@gmail.com', 'legaspi.riley@gmail.com'));

ALTER TABLE crews ADD COLUMN IF NOT EXISTS is_dm boolean NOT NULL DEFAULT false;
ALTER TABLE crews ADD COLUMN IF NOT EXISTS dm_partner_1 uuid REFERENCES auth.users(id);
ALTER TABLE crews ADD COLUMN IF NOT EXISTS dm_partner_2 uuid REFERENCES auth.users(id);
-- get_or_create_dm fn + friendships table full DDL: see git history 2026-06-04
```

## Code Rules
- TypeScript strict · server components default · `'use client'` for interactivity only
- Mobile-first 390px · game logic in Edge Functions · Realtime for live state
- Never hardcode constants · never expose `SUPABASE_SERVICE_ROLE_KEY` client-side
- Loading skeletons: `<DelayedSkeleton>` (300ms) · `bg-border animate-pulse` on `bg-black` · mirror layout
- Clean up Realtime on unmount · `cancelled` flag in async effects · RLS on every table
- Server fetching: `Promise.all` independent queries; session first, then queries
- Logout from `/profile` only: `signOut()` → `router.push('/login')`
- Server actions creating/joining crews: `revalidatePath('/home')` before redirect
- Edge function notifications: single batch `user_ids[]` — never loop per member
- `unstable_cache`: `createServiceClient()` inside; verify auth with cookie client first

## Supabase Type Rules
- Row interfaces must extend `Record<string, unknown>` (without it `.from()`/`.rpc()` returns `never`)
- Table definitions must include `Relationships: []`
- All RPCs declared in `Database.public.Functions` with `Args` + `Returns` before use
- `supabase/` excluded from `tsconfig.json` (Deno imports incompatible)
- `Record<string, unknown>` access → `unknown`; use `as` casts
- Query builder returns `PromiseLike` not `Promise` — async/await + try/catch; no `.catch()` chaining

## Disabled Features
- Voice notes: UI removed; `XP_VALUES['voice']` + element `lightning` still defined server-side
- Image upload in chat: hidden from public users; enabled per-dev via `nexus_chat_camera` toggle in Developer Settings (`/profile/developer`); upload logic + `chat-images` bucket fully functional

## Gotchas
- `CREATE OR REPLACE FUNCTION` only replaces a function if the argument signature matches exactly. Adding or removing params creates a new overload — leaving multiple overloads with all-DEFAULT args causes ambiguous RPC call errors. Always `DROP FUNCTION` old signatures explicitly before recreating with a different param list.
