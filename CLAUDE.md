# Nexus

Group chat RPG: messages → XP → levels. Pixel art (RotMG style).

## Stack
Next.js 16 App Router · TypeScript · Tailwind · Framer Motion · Zustand · Supabase (Auth, Postgres, Realtime, Storage, Edge Functions) · next-pwa v5 · Vercel · @tanstack/react-virtual v3 · lottie-react (reaction icons) · react-easy-crop (fixed-frame pan/zoom photo cropping)

Icons: `pixelarticons` — `import { X } from 'pixelarticons/react/X'` · `<X style={{ width, height, color }} />` · named exports only · never lucide-react in chat/home UI

Build: `next build --webpack` (Turbopack breaks next-pwa + proxy.ts)

## Database Tables
```
profiles            id, username (unique case-insensitive, ^[A-Za-z0-9_]+$ 3-20 chars — see Username Format), first_name, last_name, avatar_class, avatar_url, avatar_storage_key, custom_avatar (bool default false), background_url (text nullable — profile page hero image), birthday, is_dev, coins (int default 0), gem_balance (int default 0), last_gem_claim (timestamptz nullable), status (text nullable ≤100 chars), pinned_vinyl_id (text nullable), needs_username_reset (bool default false), created_at
crews               id, name, invite_code (6 chars unique), level, total_xp, created_at, is_dm (bool default false), dm_partner_1 (uuid nullable), dm_partner_2 (uuid nullable), image_url, image_storage_key, background_image_url (text nullable), last_message_preview (text nullable), last_message_at (timestamptz nullable), last_message_sender_id (uuid nullable)
crew_members        id, crew_id, user_id, class (flavor-only sprite/onboarding choice — no combat system consumes it), joined_at, last_seen
messages            id, crew_id, user_id, content, message_type, element_type, xp_awarded, reactions (jsonb default '{}'), reply_to_id, reply_preview, reply_username, image_url, image_blur_hash, pinned (bool default false), pinned_by (uuid nullable), pinned_at (timestamptz nullable), pin_expires_at (timestamptz nullable), created_at
crew_xp_log         id, crew_id, user_id, xp_amount, source, created_at
push_subscriptions  id, user_id, crew_id (nullable), endpoint (UNIQUE), p256dh, auth, created_at
notification_preferences   user_id (PK), notif_messages, notif_mentions, updated_at
friendships         id, requester_id, addressee_id, status (pending|accepted), created_at — UNIQUE(requester_id, addressee_id)
coin_log            id, user_id, crew_id (nullable), coins, source, created_at
app_invites         id, code (text unique), inviter_id (uuid → profiles), used (bool), used_by (uuid → profiles), used_at (timestamptz), created_at
reserved_users      id, email (text unique), username, class, first_name, last_name, created_at, converted (bool default false)
announcements       id, title (1–200 chars), text (1–500 chars), image_url (1–300 chars), active (bool default true), created_at
polls               id, message_id (uuid → messages nullable), crew_id, creator_id, question (1–200 chars), options (jsonb string[]), votes (jsonb default '{}' — `{"0":["userId",...]}`), expires_at, closed_at, created_at
squad_definitions   id, crew_id, creator_id, word (1–100 chars, comma-separated aliases), definition (1–500 chars), text_effect (text nullable), created_at — UNIQUE INDEX (crew_id, lower(word))
definition_suggestions  id, definition_id (→ squad_definitions CASCADE), crew_id, suggester_id, suggested_definition (1–500 chars), created_at — UNIQUE(definition_id, suggester_id); REPLICA IDENTITY FULL
friendship_xp       user_a (uuid), user_b (uuid), total_xp (int) — canonical order: user_a < user_b (UUID); UNIQUE(user_a, user_b)
friendship_xp_log   id, user_a, user_b, sender_id, xp_awarded (int), source (dm|mention), awarded_at
notes               id, crew_id, created_by, url, og_title, og_image_url, source_domain, section_id (uuid → board_sections nullable, ON DELETE SET NULL), created_at — crew_id CASCADEs on crew delete; SELECT RLS: crew members OR `created_by = auth.uid()` (Vibes always visible to their creator, even after leaving the crew)
board_sections      id, crew_id, created_by, name (1–100 chars), position (int), created_at — INDEX (crew_id, position, created_at)
profile_photos      id, user_id, url, storage_key, created_at — max 30 per user; stored in `profile-photos` bucket
username_history    id, user_id (→ profiles CASCADE), old_username, changed_at — one row per rename; RLS: any authenticated user can SELECT (needed to resolve other members' @mentions), INSERT restricted to `user_id = auth.uid()`
user_presence       user_id (PK → profiles CASCADE), last_active_at (timestamptz default now()) — split off `profiles` so the 30s heartbeat write doesn't bloat the hottest/most-joined table; SELECT open to any authenticated user (peer online-dot lookups), writes only via `update_active()` RPC
```

DM channels: `crews` rows with `is_dm = true` · `dm_partner_1 < dm_partner_2` (UUID order) · both partners in `crew_members` class=berserker · filtered from home Squads; shown in Friends only

## Postgres Functions
All `SECURITY DEFINER`. Declared in `Database.Functions` in `src/types/index.ts`.

- `create_crew(p_name, p_invite_code)` → uuid
- `join_crew(p_invite_code)` → uuid
- `leave_crew(p_crew_id)` → jsonb `{ok|deleted}` — last member leaving hard-deletes the crew (CASCADE wipes messages/notes); client shows a confirmation sheet in this case (`ChatInput.handleLeaveSquadTapped`) before calling it
- `insert_message(p_crew_id, p_content, p_message_type, p_reply_to_id?, p_reply_preview?, p_reply_username?, p_image_url?, p_image_blur_hash?)` → messages row
- `increment_crew_xp(p_crew_id, p_xp_delta)` → `(new_total_xp, new_level)`
- `is_crew_member(p_crew_id)` → boolean
- `get_or_create_dm(other_user_id)` → uuid
- `get_unread_counts(p_crew_ids, p_cutoffs)` → `TABLE(crew_id, unread_count)`
- `get_crew_member_msg_counts(p_crew_id)` → `TABLE(user_id, msg_count)`
- `get_member_crew_stats(p_crew_id, p_user_id)` → `TABLE(msg_count, total_xp)`
- `increment_user_coins(p_user_id, p_amount)` → void
- `increment_friendship_xp(p_user_a, p_user_b, p_amount)` → void
- `toggle_reaction(p_message_id, p_emoji, p_user_id)` → jsonb
- `create_poll(p_crew_id, p_question, p_options, p_expires_at)` → messages row
- `vote_on_poll(p_poll_id, p_option_index)` → jsonb
- `close_poll(p_poll_id)` → void
- `claim_daily_gem(p_user_id, p_local_midnight)` → jsonb `{claimed, gem_balance}`
- `pin_message(p_message_id, p_duration_minutes?)` → jsonb — admin only, cap=5
- `unpin_message(p_message_id)` → jsonb — admin only
- `update_active()` → void — upserts `user_presence.last_active_at = now()` for `auth.uid()`; presence heartbeat

### Server Authority (column guards + RPC grants)
Migration `20260709100000_security_column_guards_and_rpc_grants.sql` is the source of truth. Two enforcement layers beyond RLS:

**Column-protection triggers** — block client-role (`authenticated`/`anon`) writes to privileged columns; the trigger no-ops for `service_role`, so server/edge writes pass. RLS lets a user UPDATE their own `profiles`/`crews`/`messages` row, so column guards are what stop a direct PostgREST PATCH from tampering:
- `profiles`: `is_dev`, `coins` are server-only (`prevent_client_privileged_profile_writes`); `username` must match `^[A-Za-z0-9_]{3,20}$` (`enforce_username_format`) — DB-level backstop to `validateUsernameFormat()`. Gems already guarded by `prevent_client_gem_writes`.
- `crews`: `total_xp`, `level`, `invite_code`, `is_dm`, `dm_partner_*` server-only (`prevent_client_crew_stat_writes`). Name/image/`last_message_*` stay client-writable.
- `messages`: `reactions`, `xp_awarded`, `element_type`, `message_type`, `user_id`, `crew_id`, `created_at` server-only (`prevent_client_message_field_writes`) — only `content` + image fields are client-editable (the message-edit flow). Pin columns keep their own separate trigger.

**Revoked client EXECUTE** — these SECURITY DEFINER RPCs are callable only by `service_role` (revoked from `public`/`anon`/`authenticated`, incl. the inherited PUBLIC grant): `increment_user_coins`, `increment_crew_xp`, `increment_friendship_xp`, `claim_daily_gem`, `toggle_reaction`, plus the trigger fns. Call them from edge functions / server actions via the service client, never `supabase.rpc(...)` on a browser/cookie client. The rest (`insert_message`, `join_crew`, polls, pins, `update_active`, `get_*`, …) keep `authenticated` EXECUTE.

## Game Values

XP: first-msg-today=10 (flat, one-time per UTC day) · all other messages=1
Anti-spam: gap < 5s since sender's last message → 0 XP, 0 coins, 0 damage (soft block)

Coins: text/voice/image=1 · reaction/system=0 · generate-invite=−25 · seed-to-new-user=+50 · blocked when softBlocked
- `handle_new_user` trigger → 50 signup bonus · invite alphabet: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`

Friendship XP: 1pt per DM send or @mention · 10pt daily cap · `award-friendship-xp` edge function · **dev-gated: `nexus_friendship_xp`**

Gems: 1/day on first message in any crew · `award-gem` edge function + `claim_daily_gem` RPC sole authority — client never awards · blocked from client writes by `profiles_protect_gem_columns` trigger (one of a family of column-protection triggers — see Server Authority) · `claim_daily_gem` client EXECUTE is revoked, so it's callable only via the `award-gem` edge fn (service role)

Classes (warrior/healer/archer/rogue/mage, plus `berserker` for DMs/default): flavor-only onboarding/sprite choice — the boss-fight combat system that used to consume them was removed; base display stats live in `src/shared/constants/classStats.ts` (`CLASS_BASE_STATS`), shown on the onboarding class-select screen and `HomeClient`'s join-crew picker only.

Leveling: `xpForLevel(n) = round(120 × 1.0435^(n-1))` · `LEVEL_CAP = 100` · constants in `src/shared/constants/config.ts`

Elements: fire=<20 chars · water=>150 chars · lightning=voice · nature=images · shadow=reactions · arcane=daily/system

Quick-pick reactions: default set `['👍','👎','😭','🤣','😤','🔥']` (`DEFAULT_QUICK_REACTIONS` in `config.ts`), **user-customizable per-device** via `EmojiReactionPickerSheet` — persisted in localStorage (`nexus_quick_reactions`) and read through `useQuickReactions()`; see Reaction Quick-Pick & Picker below. `REACTION_CATALOG` (`config.ts`, ~200 JoyPixels emojis) maps each Unicode emoji → Lottie JSON (`public/lottie/reactions/`) and drives both the picker grid and the derived `REACTION_LOTTIE_MAP`. Reactions are keyed by the Unicode emoji in `messages.reactions`; any emoji not in the catalog (e.g. legacy `💧⚡🌿🌑🔮` element reactions) renders as a plain glyph.

## Auth
- Google OAuth: `signInWithOAuth` → `/auth/callback` → `/home`
- Anonymous: `signInAnonymously`; guest badge + Save Progress in header
- `src/proxy.ts` only — DO NOT add `src/middleware.ts` (Next.js 16 errors if both exist)
- Protected routes: `/home` `/chat` `/profile` `/onboarding` `/friends` `/dm`
- Auth check: `getSession()` (cookie-only), NOT `getUser()` (100–300ms overhead)

### Login — `/login`
Invite code path: `landing → invite-code → invite-oauth → invite-profile`
1. `validateInviteCodeAction` checks `app_invites` (no consume) → sets cookies `nexus_invite_code` + `nexus_auth_intent=invite` (SameSite=Lax, 5min) → Google OAuth
2. Callback reads cookies → `invite-profile` step `?code=XXX`, clears cookies → `checkReservedUserAction()` auto-completes if fully reserved
3. `completeInviteFlowAction` — re-validates, upserts profile, marks invite used

### Onboarding
`name → /onboarding/birthday → /onboarding/class → /onboarding/welcome → chat/crew`
- Class guard on `crew_members.class`, NOT `profiles.avatar_class`
- `selectClassAction` → welcome ONLY when `crew_members` count = 1
- Welcome screen: marks invite used + 50 seed coins + `recruit_arrived` push to inviter

### Username Format
Letters, digits, underscore only (`^[A-Za-z0-9_]+$`), 3–20 chars — enforced by `validateUsernameFormat()` (`src/shared/utils/username.ts`), the sole source of truth for the character rule. Wired into every path that sets a username: `reservePlaceAction` / `completeInviteFlowAction` (`login/actions.ts`), `updateUsername()` helper used by both `updateProfileDetailsAction` and `setUsernameAfterResetAction` (`profile/actions.ts`).

`profiles.needs_username_reset` (bool, default false) flags accounts whose username predates this rule (spaces, apostrophes, periods, etc). Migration `20260705212709_add_needs_username_reset` backfilled it via the regex, not hardcoded ids. `UsernameResetSheet` (`src/shared/components/overlays/`, mounted in `(app)/layout.tsx`) checks the flag client-side on every app load and — Figma 419:1891 — shows a **non-dismissible** `<BottomSheet onClose={() => {}} disableDrag>` prefilled with the old username until `setUsernameAfterResetAction` clears the flag.

`updateUsername()` also records every rename to `username_history` (old_username, user_id) and busts `crew-members:{crewId}` for each of the user's crews, not just `profile:{userId}` — so both the cached member list and old messages' @mentions pick up the new name. See MessageBubble's mention resolution below.

## Dev Mode
`profiles.is_dev = true` — grant: `UPDATE profiles SET is_dev = true WHERE id IN (SELECT id FROM auth.users WHERE email = '...')`

Dev flags (`localStorage`): `nexus_dev_mode` · `nexus_push_diag` · `nexus_infinite_coins` · `nexus_afk_exp` · `nexus_chat_camera` · `nexus_friendship_xp` · `nexus_poll_feature` · `nexus_events_enabled`

`nexus_dev_mode`, `nexus_push_diag`, and `nexus_chat_camera` have **no in-app toggle UI** — set them directly via browser devtools `localStorage.setItem(...)`. The Settings page's Developer section (see below) only exposes toggles for `nexus_infinite_coins`, `nexus_poll_feature`, `nexus_events_enabled`, and `nexus_friendship_xp`.

### Own Profile Page (`src/features/profile/screens/ProfileClient.tsx`, route `/profile`)
Top bar (Figma 339:3457): back chevron (left) + up to two icon buttons (right), all sharing the same `ProfileTopBarButton` style — `background: rgba(0,0,0,0.25)`, `padding: var(--x3)` (8px), no border/blur/shadow (this replaced the old bordered/blurred settings-cog button; match this flat style for any new button added to this bar, don't reintroduce the border+backdrop-blur treatment).
- **`Braces`** icon (`isDev` only — no longer also gated on the `nexus_dev_mode` localStorage flag; that flag has no way to be set on-device without devtools access, which made the button unreachable on mobile PWAs for otherwise-legitimate dev accounts) → `router.push('/profile/settings')`, the Developer tools page. `/profile/settings` and `/profile/developer/announcements` still independently redirect non-dev users server-side, so this is cosmetic, not a security gate.
- **`MagicEdit`** icon (rightmost, disabled for guests) → `router.push('/profile/manage')`, the Manage Profile page. No Notification row anywhere — notification preferences are per-crew only (`crew_notification_preferences`, via `SquadDetailsSheet`'s Bell icon → `NotifSheet`), not global.

### Manage Profile Page (`src/features/profile/screens/ManageUserProfile.tsx`, route `/profile/manage`, Figma 470:5491)
Full page (not a bottom sheet — this replaced the former `EditProfileSheet`). Redirects guests to `/profile` server-side (`page.tsx`), matching the disabled `MagicEdit` entry point. Header: shared `PageHeader` (see Page Structure) — "MANAGE PROFILE". (Previously a bare `--color-tertiary` icon; migrated to `PageHeader`, so the chevron is now `--color-primary` with `--x5` spacing.) Hero: 240px (not 280px), uses the shared image-overlay token `var(--gradient-image-overlay)` — light top, dark bottom, Figma 470:5083; defined in `globals.css` via `color-mix` over `--color-background`. This is the single canonical scrim for **every** group/crew and profile background-cover image (SquadDetailsSheet header, UserCard, ManageSquadProfile, HomeClient squad preview + card preview, and the `ProfileClient`/`MemberProfileClient`/`AccountPageMember` profile heroes) — always reuse this token for a cover overlay, never hand-roll an `rgba(0,0,0,…)` gradient. Note the profile heroes ALSO keep a separate short (~86px) top scrim purely for back/edit button legibility — that's not the cover overlay; it's its own token `var(--gradient-hero-top-scrim)` (dark-top→transparent, also `color-mix` over `--color-background`), used by `ProfileClient`/`MemberProfileClient`/`AccountPageMember`. The one cover NOT on this token is the event hero (`EventPageInfoClient`), which keeps its own fade-to-black. Hero shows currency pills (`DiamondGem` gem count with purple→`#d946ef` gradient text, `TokeCircle` coin count in `--color-coins`) instead of the group-chats/member-since line — same pattern as `HomeClient`'s profile preview card, first reuse of it outside Home. Body fields: read-only **Account** box (email, `--color-border-hover` border, `--color-tertiary` text — always in the "active" border state, unlike `InputField`'s idle→hover transition) → side-by-side **Profile Photo** / **Background Image** Upload buttons (exact markup reused from `SquadDetailsSheet`'s crew-image upload buttons: h-12, border-purple, `Upload` icon 16×16 purple + "Upload" text) → **Display Name** / **Status** via the shared `InputField`. Footer: shared `PageFooter` (see Page Structure) wrapping a flat `<Button>` "Save Changes" — no `shadow`, matching the canonical flat subpage CTA (Figma 480:6187), not this page's own earlier shadow-variant footer.

**Log Out and Delete Account have no UI anywhere right now.** They lived in `EditProfileSheet`'s folded-in Account section before this page replaced it; the Figma design for this page doesn't show them, and per an explicit product decision they were dropped rather than appended below the Figma-specified content. `signOut`, `requestAccountDeletionAction`, and `cancelAccountDeletionAction` are still valid, unmodified server actions — just currently uncalled from any component, same pattern as the orphaned `profile/developer/actions.ts` functions. If these need a home again, they don't have one today.

### Developer Settings Page (`src/features/profile/screens/DeveloperUserSettings.tsx`, route `/profile/settings`, Figma 470:5687)
Renamed from `SettingsClient`. Dev-only: `page.tsx` redirects to `/profile` if `!isDev` server-side, so the component itself takes no `isDev` prop — it only ever renders for dev users. Header: shared `PageHeader` (see Page Structure) — "DEVELOPER SETTINGS" (migrated from the former bare-icon pattern, same as `ManageUserProfile`). Body is a single flat flex column (gap 20, not the old nested per-section wrappers) of section labels + rows:
- **Admin**: `Announcements` nav row only (→ `/profile/developer/announcements`) — the inline announcement-composer form that used to live directly on this page moved into `DeveloperUserAnnouncements` itself (see below), matching this row's Figma description "Add new announcements or updates."
- **Debug**: `Notification Subscription` toggle only ("Test push notifications" — exact Figma copy, not the old "Test push notification.")
- **Features**: `Infinite Coins`, `Poll Feature`, `Events Feature`, `Friendship XP` (renamed from "Friendship XP System" to match Figma).

Two distinct row styles per Figma, don't conflate them: **nav rows** (`DevNavRow`) use `font-semibold` titles, 0 gap between title/description, `tracking-[0.2px]`, and a `ChevronRight` in `--color-secondary`. **Toggle rows** (`DevToggleRow`) use `font-medium` titles, `font-light` descriptions, 8px gap between title/description, no tracking. The toggle switch itself: off-track is `var(--color-muted)` (not `--color-border` — a real Figma-vs-code mismatch that was fixed here), thumb is `var(--color-primary)` (not literal white), on-track stays `--color-purple`.

### Announcements Management Page (`src/features/profile/screens/DeveloperUserAnnouncements.tsx`, route `/profile/developer/announcements`, Figma 472:5971)
Renamed from `AnnouncementsClient`. List page still uses the standalone bare-icon header (`ChevronLeft` 24×24 `--color-tertiary`, no button box, gap 8, uppercase Silkscreen `--text-xl`) — it was NOT migrated to the shared `PageHeader` when `ManageUserProfile`/`DeveloperUserSettings` were, so it's still the last *list* page on that pattern (the editor overlay below is a separate surface and does use `PageHeader` — see next paragraph). Cards: flat `var(--color-surface-sheet)` background, 8px radius, no active/inactive border or background tinting. Title always `--color-primary`, description always `--color-secondary`, 2-line clamp (`WebkitLineClamp`), `src : {filename}` in Silkscreen mini/`--color-tertiary`. Bottom row: "Published {date}" (`--color-purple`) or "Not published since {date}" (`--color-tertiary`), both using `created_at` formatted `MM/DD/YYYY`. Same `ToggleSwitch` spec as `DeveloperUserSettings`. Tapping a card (anywhere except the toggle, which calls `stopPropagation()`) opens the editor overlay below in edit mode.

**Add/Edit is a full-screen slide-in overlay** (`AnnouncementEditorPage`, Figma 472:6072 add / 505:1953 edit), one component driven by a `mode: 'create' | 'edit'` prop — same "one component, mode prop" pattern as chat's `CreateDefinitionPage` (spring 380/36 slide-in, left-edge swipe + back button both call `handleBack()` which animates off-screen then `onClose()`, never `router.back()`; the list page passes `nativeSwipe={showCreate || !!editTarget}` to its `SlidePage` while the overlay is open). Unlike the list page, this overlay uses the shared `PageHeader` ("Add announcement" / "Edit announcement") since Figma's header here is the primary/`--color-primary` chevron variant, not the list page's bare-icon tertiary one.

Body: a live preview using the **same shared `AnnouncementCard`** (`src/shared/components/banners/AnnouncementCard.tsx`) the production announcements sheet renders — not a separate hand-rolled preview — fed directly from the form's current `title`/`text`/`imageUrl` state, so edits reflect immediately. `AnnouncementCard` accepts `imageUrl: string | null` / `createdAt: string | null` for exactly this purpose: `null` image renders the Figma gradient "Image here." placeholder (`var(--gradient-nexus)`), and empty title/text/date fall back to "Sample title" / "Sample preview" / "Date here" — production call sites (the sheet) always pass real non-null data, so this is additive only. Below the preview: a `SelectField` "Image Source :" (opens `ImageSourceSheet`, a `BottomSheet` list of thumbnail rows), then a single-line `InputField` "Title" and a multi-row `TextareaField` "Description" (rows=5, same as `CreateDefinitionPage`'s definition field — a deliberate departure from Figma's literal single-line reuse, since `text` supports up to 500 chars and needs to wrap while editing). `AnnouncementCard`'s body-text paragraph carries `whiteSpace: 'pre-wrap'` so multi-line descriptions both wrap and preserve the author's line breaks in the live preview and the production sheet. Footer: shared `PageFooter` with a `Publish` button always, plus a `Delete Announcement` (`Button variant="outlined" color="red"`) in edit mode only — this is what un-orphans `deleteAnnouncementAction` in `home/actions.ts`, previously defined but uncalled.

**Image Source is a fixed manifest, not an upload flow** — announcement images are static assets checked into `public/img/announcements/` (see the `image-handling` skill), so `ImageSourceSheet` picks from a hardcoded `ANNOUNCEMENT_IMAGE_OPTIONS` array (filename + path) defined at the top of `DeveloperUserAnnouncements.tsx`, not a directory scan (avoids depending on `public/` being fs-readable at runtime, which isn't guaranteed on Vercel). Adding a new banner asset means adding the `.svg` under that folder *and* a matching entry to this array by hand — same manual-sync expectation as any other static-asset manifest in this codebase.

**The production sheet** (`src/shared/components/banners/AnnouncementsSheet.tsx` — `AnnouncementsSheet`/`AnnouncementsSheetView`, Figma 419:1930/506:2147) uses `BottomSheet`'s default `--color-surface-sheet` background, not the nexus gradient — the gradient lives only inside each card's own image placeholder (`AnnouncementCard`), never the sheet chrome (see the `bottom-sheets` skill: don't override `BottomSheet`'s background). The card list scrolls in its own `flex-1 min-h-0 overflow-y-auto` region; `Dismiss` is a pinned `SheetFooter` + `Button shadow`, not part of the scrolling content — same fixed-footer-over-scrolling-content pattern as `SquadDetailsSheet`'s leave-squad button.

**List page footer has a second button, `Test Announcement`** (Figma 472:6048 — `Button variant="outlined"`, no `color` prop needed since outlined defaults to purple, stacked below the filled `Add announcement` button in the same `PageFooter`). Opens `AnnouncementsSheetView` (the stateless presentational half of `AnnouncementsSheet`, imported directly rather than through the stateful wrapper) fed with the currently-`active` banners. This is dev-only by construction two ways over: the whole page already redirects non-`is_dev` users server-side, and `AnnouncementsSheetView` never touches the `nexus_dismissed_banners` localStorage key real end-users are tracked by — so tapping it can't mark an announcement dismissed for anyone, dev or otherwise. This re-adds the "Preview Announcements Sheet" capability noted as removed below, now as a Figma-specified `Test Announcement` button on this page rather than a row on Developer Settings.

`Error Logs` nav, `Dev Mode` toggle, `Chat Camera` toggle, `Reset Gem Cooldown`, and `Reset Friendship XP` were removed from `DeveloperUserSettings` in an earlier pass — the underlying server actions still exist in `src/app/(app)/profile/developer/actions.ts` (unused by any UI) and `/profile/error-logs` is still a live route, just unlinked. The former `Combat Testing` section (spawn boss/end raid/down self/revive/trigger attack/reset combat) was deleted outright, actions and all, along with the rest of the boss-fight combat system.

## Storage Keys

sessionStorage: `nexus-msgs-{crewId}` (envelope `{ messages, savedAt }`, 50 msg cap) · `nexus_chat_from`
IndexedDB (idb-keyval): `nexus-msgs-{crewId}` — same envelope; survives iOS PWA kill

localStorage: `nexus_first_message` · `nexus_install_prompted` · `nexus_crew_created` · `nexus_notif_prompted` · `nexus_notif_state` · `nexus_dismissed_banners` · `nexus_quick_reactions` (custom quick-pick reaction set) · dev flags above

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
│   │   ├── sheets/             SquadDetailsSheet, PinDurationSheet, PinListSheet,
│   │   │                       NotifSheet, CrewImageUploadModal,
│   │   │                       SuggestDefinitionSheet, ReviewSuggestionSheet,
│   │   │                       ChatSheetReact, EmojiReactionPickerSheet
│   │   ├── polls/              PollCard, PollCreatorSheet
│   │   ├── header/             ChatHeader, DMHeader
│   │   └── navigation/         FloatingBackButton, DMOverlayBack, ShareModal
│   ├── chat/screens/           DefinitionHomePage (definitions list page; stub re-export DefinitionsClient.tsx)
│   ├── home/                   HomeClient, InviteArsenal, homePreviewCache.ts
│   ├── friends/                FriendsClient, InboxClient
│   ├── events/                 EventCreationSheet, EventCard, GroupEventsClient (dev-gated: `nexus_events_enabled`)
│   ├── auth/                   LoginForm
│   ├── onboarding/             BirthdayClient, ClassSelectClient, WelcomeClient
│   └── profile/                ProfileClient, ManageUserProfile, DeveloperUserSettings, DeveloperUserAnnouncements, ErrorLogsClient, VibesGrid, PhotosGrid
├── shared/
│   ├── supabase/               client.ts, server.ts, auth.ts, imageLoader.ts
│   ├── constants/config.ts     LEVEL_XP_BASE, etc.
│   ├── utils/                  xp.ts, gems.ts, notifications.ts, imageCompress.ts, etc.
│   └── components/             ui/, banners/, overlays/, pwa/, game/
├── store/                      chatStore.ts
└── types/                      index.ts (barrel) + chat.ts, profile.ts, etc.
```

### File Ownership Rules
- `app/(app)/*/page.tsx` — server components only
- `app/(app)/*/actions.ts` — server actions colocated with route
- `features/{domain}/` — owns its screens, components, hooks
- `shared/` — only code reused by 2+ features
- `store/` — chatStore (cross-feature)
- `src/proxy.ts` — Next.js middleware; never rename or duplicate as `middleware.ts`
- Types: import from `'@/types'` everywhere (re-exported from `src/types/index.ts`)

### Realtime / Messaging
- Channel `messages:{crewId}`: broadcast (sender→instant) + Postgres Changes INSERT (backup) + presence (typing only)
- **Both live paths are live-only — they never replay a window missed while the socket was down** (backgrounded, screen locked, network blip, or a failed initial join). The recovery is a **catch-up fetch**: `MessageList.resyncMessages` fetches messages at/after its newest *confirmed* (non-`tempId`) message and merges via `addMessage` (dedup-safe). It's registered on `chatStore.requestResync` (same store-callback pattern as `requestRetrySend`) and invoked from `ChatInput`'s channel lifecycle on: every `SUBSCRIBED` (initial join, the 30s cache fast-path, and realtime-js auto-rejoin after a drop), `visibilitychange`→visible, and the browser `online` event. This is what makes a message that arrived while backgrounded appear on foreground **without** needing exit+rejoin. `ChatInput`'s subscribe callback also resets `channelReadyRef=false` on `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` so sends don't broadcast into a dead socket (peers still get them via Postgres Changes after rejoin). Anchor on the newest *confirmed* message, not the newest overall — an optimistic `tempId` send's client-side `created_at` can sit ahead of a peer's real timestamp and make the catch-up skip it. Known limit: a single outage gap >50 messages keeps the tail (newest-first fetch) but can leave a middle hole upward pagination won't fill.
- `addMessage` deduplicates by id; broadcast payload has no profile (resolved from `profilesRef`)
- XP sync: sender optimistic `addXP(n)` → `setCrewXP(newTotal)` → broadcasts `xp_update`; receivers `receiveXP`; dedup by `sender_id`
- **Presence**: authority = `user_presence.last_active_at` (own table, split off `profiles` — see Database Tables). Online = `last_active_at > now() - PRESENCE_ONLINE_THRESHOLD_MS` (`src/shared/constants/config.ts`, 45s). Heartbeat: `update_active()` RPC every 30s + broadcasts `{ event: 'active', user_id, ts }`, wired only inside `ChatInput`'s per-crew effect (not global — presence only tracks while a chat screen is mounted). Sweep: `chatStore.sweepOnlineUserIds(45_000)` every 15s (local only; no-ops if the online set didn't actually change). `chatStore.markSelfOnline(userId)` marks self online on mount without clearing previously-known peer presence (avoids the online dot flashing empty on every chat-screen mount).
- Typing: Supabase Presence (`ch.track({ username, typing })`) — NOT used for online status

### MessageList
- **Virtualization**: `useVirtualizer` (absolute-position, `measureElement`, overscan 5). `getItemKey` uses `tempId ?? id` — keeps key stable through optimistic→real reconciliation.
- **Mention aliases**: `initialMentionAliases` prop (`[oldUsernameLower, userId][]`, fetched server-side from `username_history` in `chat/[crewId]/page.tsx` / `dm/[friendId]/page.tsx`) seeds `oldUsernameToUserId`. The `profiles` UPDATE realtime handler adds an entry the instant a member renames while the chat is open (no reload needed). `mentionAliases` (passed to `MessageBubble`) is derived by re-resolving each entry's userId against the **current** `localProfiles` on every render — so it's always correct through multiple renames, never stale, without needing to update old map entries in place.
- **Three-tier cache**: (1) sessionStorage sync on mount → instant render; (2) IDB fallback if sessionStorage empty (iOS PWA kill resilience); (3) DB fetch newest 50, merged with in-flight Realtime. `setMessages([])` before load prevents crew bleed.
- **Cursor pagination**: scroll-up within 120px → keyset fetch `WHERE created_at < cursor LIMIT 50`; scroll position restored after prepend.
- **DisplayItems**: `spacer | divider | message`. Historical `COMBAT:`/`BOSS_SPAWN:` system messages (from the removed boss-fight combat system) are always skipped — old rows still exist in the DB but stay hidden rather than rendering as raw text.
- **Empty state** (Figma 426:1996, `EmptyState` in `MessageList.tsx`): bypasses the virtualizer (`messages.length === 0` → plain `h-full` flex column, `justify-end`) so it's bottom-anchored against the composer, not sized off a fixed virtual-row estimate. Ghost gif (`/sprites/ghost/south-flip.gif`, 100×100) + full-width copy text: `justCreated` (`memberProfiles` count ≤ 1) shows the shared `<InviteCodeCard>` (no `maxWidth` here, or at its other call site in `SquadDetailsSheet`'s Members section — both just let it fill the container); otherwise plain "no messages yet" text. `inviteCode` is optional/omitted for DMs.

### MessageBubble
- `renderMessageContent` — splits on `@username` tokens, then links + definitions on each segment. A token is rendered as a mention (purple, no link) if it matches a current member's username (`memberUsernames`) **or** a member's past username (`mentionAliases: Map<oldUsernameLower, currentUsername>`, from `MessageList`) — the latter is what makes a rename retroactively fix `@mentions` baked into old message text (mentions are plain text, never a stored user id; see MessageList below).
- Inline definition keyword highlight (`renderWithDefinitions`): `--color-purple`, font-weight 500 (medium), wraps `TextEffectText` for the word's `text_effect`.
- Username in header row: `--color-primary` on own bubbles, `--color-secondary` on others'.
- **Images** (`message_type === 'image'`): all through `MultiImageGrid` → `MultiImageCell` (160×160, object-cover). GIFs use `<img>`; photos use `next/image fill` + `supabaseImageLoader`. `parseJsonArray()` normalises plain URL or JSON `string[]`.
- **Header row** (username · vinyl · crown · timestamp): no dot separators. `VinylPill` shows spinning 12×12 disc + scrolling title (no play icon). `Crown` 12×12 shown only on creator's own bubbles.
- **`VinylPill`** (`src/shared/components/ui/VinylPill.tsx`, shared with `SquadDetailsSheet`'s member `UserCard`s): `{ imageUrl, title }`. Measures title width via off-screen span; scrolls with Framer Motion ticker if `textWidth > 32`, else static ellipsis.
- Long-press (500ms) → `ChatSheetReact`: emoji quick-pick row (+ a `Plus` button opening `EmojiReactionPickerSheet`) · Edit (own text messages) · Reply · Copy · Pin (admin).
- OG previews: `extractFirstUrl` → `useOGPreview` → `<LinkPreviewCard>` below body; text-only messages only.
- **`MsgReactionPills`** (Figma 424:4732 "reaction-pill") — one pill per reacted emoji, `bg-surface-elevated`, `rounded-x2`, `p-x2`, `gap-x2`. Active (current user included): `--color-purple` border + purple `xs` SemiBold count. Inactive (others only): `--color-border-hover` border + `--color-tertiary` count. Icon is `LottieReactionIcon` (16×16) for any emoji in `REACTION_LOTTIE_MAP`, else the plain glyph (legacy `💧⚡🌿🌑🔮` element reactions not in the catalog).

### LottieReactionIcon (`src/shared/components/ui/LottieReactionIcon.tsx`)
Renders one JoyPixels Lottie animation (SVG renderer — most cross-platform-compatible on iOS PWA/Android). Used in `ChatSheetReact`'s quick-pick row + `EmojiReactionPickerSheet`'s slots/grid (24×24) and `MsgReactionPills` (16×16). Battery/perf-conscious by design, since a chat can have many reacted messages on screen at once:
- **Shared fetch+parse cache** (module-level `Map<url, Promise>`) — every instance of the same icon (e.g. several messages all reacted with 🤗) reuses one fetch and one parsed object instead of refetching/reparsing the 20–70KB JSON per instance.
- **Paced "pulse" loop, not continuous looping** — plays once (`loop={false}`), then waits `LOOP_REST_MS` (1.5s) before replaying via `onComplete` + `goToAndPlay(0, true)`. A tight continuous loop never stops ticking `requestAnimationFrame`; resting between plays costs a fraction of the CPU with multiple instances visible.
- **`IntersectionObserver`-gated** — only plays while actually scrolled into view (virtualization overscan keeps some off-screen bubbles mounted, which would otherwise animate unseen).
- **Paused on `visibilitychange`** — stops when the PWA is backgrounded/screen locked.
- **`prefers-reduced-motion`** via `useSyncExternalStore` on `matchMedia` — renders a static first frame, never plays.
- `REACTION_LOTTIE_MAP` (`src/shared/constants/config.ts`) is derived from `REACTION_CATALOG` and keys each animation by the Unicode emoji it represents — reactions stay keyed/stored by that emoji character (not a custom id), so this is purely a rendering swap; the data model (`toggle_reaction`, `messages.reactions`) is unaffected.

### Swipe-to-reply
Only on `!isOwn` messages. Swipe left past 64px to commit. Slide wrapper (`data-group={groupId}`) covers avatar + content so they move together. Group slide: all `[data-group="${groupId}"]` elements transform as a unit. Reply icon fades in from 30–100% of swipe. `chatStore.replyTo` + `replyGroupId` set atomically; cleared on `ChatInput` unmount.

Reply icon (`CornerUpLeft` 16×16): absolutely positioned, `top` = `var(--space-6)` (header messages) or `var(--space-2)` (continuations) to match wrapper `padding-top` — ensures `flex items-center` centers the icon within the content area, not the full wrapper including group-spacing dead space.

### ChatInput
- Send: `addMessage(optimisticMsg)` → `insert_message` RPC → `updateMessage(tempId, { id })` in place → broadcast → `award-xp`. On error: `removeMessage(tempId)`.
- Edit mode: `chatStore.editTo`; optimistic update → DB write → rollback on error. Text messages only.
- Multi-image: `PendingImage[]` max 4; parallel uploads, sequential sends. `clearPendingImages` revokes blob URLs.
- Hybrid input/textarea: swaps to textarea when text width exceeds container (measured via hidden mirror span).
- **Klipy API**: trending → `data.clips[]` flat `file.thumbnail_url`; search → `data.data[]` nested `file.sm/md/hd/xs`. Separate parsers — do NOT unify.
- Poll feature dev-gated (`nexus_poll_feature`).

### FloatingBackButton (`src/features/chat/components/navigation/FloatingBackButton.tsx`)
Absolute-positioned gradient overlay (`linear-gradient black → transparent`). Left: `ChevronLeft` back button. Right: `Calendar2` group-events button, dev-gated (`nexus_dev_mode` + `nexus_events_enabled`) — no other buttons live here; Bell/Library live in `SquadDetailsSheet` (see below). All buttons: `border border-border p-2 backdrop-blur(7px)`.

### Definitions Page (`src/features/chat/screens/DefinitionHomePage.tsx`)
Route: `/chat/[crewId]/definitions`. Header: shared `PageHeader` pattern (see Page Structure) — "DEFINITIONS" title, `right` = `Plus` opens `CreateDefinitionPage`. Cards (Figma 402:9403): aliases/word/definition + creator byline (highlighted if own) + amber suggestion-count badge when `suggestion_count > 0`.

Any card tap opens `DefinitionPreviewSheet` (Figma 402:9507, `<BottomSheet>` z-70): full aliases/word/definition + "Author : {username}". Creator-only, a `SheetFooter` (Figma 502:2783, see Bottom Sheet Patterns) holds `Edit Definition` (`Button` outlined purple) + `Delete Definition` (`Button` outlined red) — no icons, no Cancel; non-creators see no footer at all, since backdrop tap / swipe already dismiss the sheet. Edit closes the preview and opens `CreateDefinitionPage` in edit mode.

**`CreateDefinitionPage`** — full-screen slide-in overlay (spring 380/36, `z-[80]`):
- Fields: aliases `InputField`, word `InputField`, definition `TextareaField` (rows=5), Text Effect picker (Figma 405:2634, released to all users) — options `bouncy_text` / `show_up` / `particles` / `blur_in` / `explode`; only the selected option's own label previews live (others stay static). Persists to `squad_definitions.text_effect`; effect components live in `src/features/chat/components/text-effects/` (`registry.ts` + `TextEffectText.tsx`), applied both in the picker and inline via `MessageBubble`'s `renderWithDefinitions`.
- Footer: shared `PageFooter` (see Page Structure) wrapping `Button` "Save definition".
- Back button, left-edge swipe, and successful save all route through `handleBack()` (slide-out animation → `onClose()`) — never `router.back()`, so nav always stays on the definitions list.
- `DefinitionHomePage` passes `nativeSwipe={showCreate || !!editTarget}` to `SlidePage` while the overlay is open so its own gesture can't race with `SlidePage`'s swipe handler.

### SquadDetailsSheet (`src/features/chat/components/sheets/SquadDetailsSheet.tsx`)
Panel pattern · `maxHeight: 85vh` · `overflow-hidden`

Layout (flex col):
1. **Header** (240px) — background + gradient overlay; top: crew image + name + `Lv.{n} · {count} members` | `MagicEdit` (creator) + `Bell`/`BellOff` (opens `NotifSheet`, owned by `ChatInput`) + `Library` (navigates to `/chat/${crewId}/definitions`) + `ChevronRight` (close); bottom: XP bar
2. **Members** (`flex-1 min-h-0`, `overflow-y-auto` — vertical scroll is a short-viewport fallback only, content normally fits) — "Members" label + `<InviteCodeCard>` (Figma 438:8098; same shared component as `MessageList`'s empty state — don't re-inline this markup a third time) + a horizontally-scrollable row (`overflow-x-auto no-scrollbar`) of member `UserCard`s (Figma 356:3503, 180px wide, every card the same total height by construction — see below). Each card: the member's own `profiles.background_url` as the header image (fallback `/img/default_image.png`, same as `AccountPageMember`/`MemberProfileClient` — NOT the crew's `background_image_url`), rendered as a plain `<img>` with `inset: 0`, `width/height: 100%`, `objectFit: fill` (not `cover` — see the `image-handling` skill: even a small crop can push a specific part of the photo out of frame) — same full-bleed fill technique as `ProfileHeroBackground` (user profile) and `ManageUserProfile`'s hero preview + 32px `UserAvatar` (online dot if online) → username → class row (`Crown` 12×12 amber if creator + 12×12 `PixelSprite` (scale `0.5625`) + `{class} · {msgCount} msg.`) → a **reserved vinyl pill slot**: `<VinylPill>` (`src/shared/components/ui/VinylPill.tsx`, shared with `MessageBubble`'s header row) if the member has one, else a blank 20px-tall placeholder (`VINYL_PILL_HEIGHT`, matching `VinylPill`'s own natural height) → a **reserved status ticker slot**: `<TickerBanner>` (see below) if the member has a `status` set, else `BlankTickerSlot` — a placeholder that mirrors `TickerBanner`'s own outer wrapper markup so its rendered height matches exactly. Figma 432:7827 (the real mockup row) shows this precisely: the full card (432:7819, vinyl + ticker) and the `self-stretch` empty card (432:8008) both resolve to 231px, while the one card missing `self-stretch` (432:8021) collapses to 172px — the "collapse" look was the bug, not the design; every card must reserve both slots' space regardless of content, not rely on the row's `align-items: stretch` to paper over the difference. Tapping a card calls `onTapMember` → `/chat/${crewId}/member/${memberId}`.
3. **Fixed bottom** (`flex-shrink-0`) — `DoorClosed` leave squad button

Notif/library actions were moved here from `ChatSquadDetailBar` (Figma 432:7033) — the collapsed bar above the input now shows only the crew image/name/level, a horizontally-scrollable row of **online-only** member avatars (offline members are omitted entirely, not just deprioritized; online dot `#66bb6a` always shown) capped to ~6 visible at once via `maxWidth: 164` + `overflow-x-auto no-scrollbar`, and the `ChevronUp` expand button.

Invite is surfaced only via the inline `<InviteCodeCard>` in the Members section (Figma removed the header's `UserPlus` icon in favor of this — don't re-add a separate invite sheet/icon).

### Pin Feature (released to all users)
- Admin = member with earliest `joined_at`; cap = 5 active pins (`PIN_MAX_PER_CREW`)
- `pin_message` / `unpin_message` RPCs only — trigger blocks direct client writes
- `PinListSheet`: lists pins; admin: unpin + display toggle
- `selectActivePins(messages)` from chatStore; `hiddenPinIds` + `toggleHiddenPin` in chatStore

### award-xp
- Identity check first: rejects (401) unless the JWT-resolved caller === body `user_id` (see Edge Functions → session-token note)
- Batch 1 (parallel): prev msg gap + crew data + sender `is_dev` + other members
- Anti-spam: gap < 5s → 0 XP, 0 coins
- Fires `message_received`/`mention_received` notifications — see `notification-engine` skill for the ordering constraint (must fire before XP writes; no early returns before the notification block)

### Reactions
- `messages.reactions` JSONB: `{ emoji: [userId,...] }`, empty arrays pruned
- `useMessageReactions` hook (`src/features/chat/components/messages/useMessageReactions.ts`) owns optimistic state + the write + the in-flight guard for one message: optimistic update → `react-to-message` edge fn → `toggle_reaction` RPC → apply `data.reactions`; rollback only on `FunctionsHttpError`
- `chatStore.pendingReactionIds`: message ids with a toggle in flight, set/cleared by the hook. `MessageList`'s realtime UPDATE merge and its background history-fetch merge both check this set and unconditionally preserve local reactions while pending — do NOT reintroduce an "is the incoming value empty" staleness heuristic there, it only protects an add and silently clobbers a remove

### Reaction Quick-Pick & Picker
- **Quick-pick set** = the row of 6 primary reactions in `ChatSheetReact`. Source of truth is `useQuickReactions()` (`src/shared/utils/quickReactions.ts`), a `useSyncExternalStore` hook over localStorage `nexus_quick_reactions`, falling back to `DEFAULT_QUICK_REACTIONS`. `sanitize()` coerces stored data to a fixed length and drops any emoji no longer in `REACTION_LOTTIE_MAP` (so a retired-catalog emoji reverts to the positional default). Customization is **per-device**, not synced — a deliberate scope call; if it ever needs to sync, migrate the storage layer to a `profiles` column (component/UI stays the same).
- **`EmojiReactionPickerSheet`** (`sheets/`, Figma 490:5343) — opened by the `Plus` button in `ChatSheetReact` (z-110, above the z-90 react sheet). Header + the 6 editable slots + a search box + the full `REACTION_CATALOG` grid + a `Save Changes` button (grey→purple only when the set changed; writes via `setQuickReactions`, which dispatches `nexus-quick-reactions-change` so the open react sheet re-renders live).
  - **Swap vs insert**: tap-and-hold a slot (`LONG_PRESS_MS` 400) to SELECT it (purple stroke) → grid taps then swap that slot; short-tap the selected slot to deselect. With **no** slot selected, a grid tap INSERTS (prepend + dedupe + `slice(0, len)`, dropping the oldest) so the set stays a valid length.
  - **Search** matches the Lottie **file name** (`norm()` strips case/underscores/spaces), not the emoji glyph.
  - **Grid is row-virtualized** (`useVirtualizer`, 6 cols/row) — `LottieReactionIcon` fetches its JSON on mount, so mounting all ~200 at once would pull ~14 MB; only visible rows mount.

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

Never cache: `crews.total_xp` · `crews.level` · `crew_members.last_seen` · auth sessions

Next.js 16: `revalidateTag(tag, 'max')` — second arg required

## Edge Functions

```
supabase functions deploy send-notification --project-ref tlveyeisjbythssmocth --no-verify-jwt
supabase functions deploy award-xp --project-ref tlveyeisjbythssmocth
supabase functions deploy award-friendship-xp --project-ref tlveyeisjbythssmocth
supabase functions deploy react-to-message --project-ref tlveyeisjbythssmocth
supabase functions deploy process-avatar --project-ref tlveyeisjbythssmocth --no-verify-jwt
supabase functions deploy award-gem --project-ref tlveyeisjbythssmocth
supabase functions deploy process-deletions --project-ref tlveyeisjbythssmocth
```

`git push` does NOT deploy edge functions. Inter-function calls use raw `fetch()` — never `supabase.functions.invoke()`. `send-notification` accepts `user_id: string` or `user_ids: string[]`.

**Client → game-economy edge functions must send the user's session token, not the anon key.** `award-xp` and `award-friendship-xp` verify the caller's identity server-side (`authClient.auth.getUser()` on the `Authorization` header) and reject if the resolved user ≠ the body's `user_id`/`user_a_id`. `verify_jwt` alone is insufficient — the public anon key is a valid JWT but carries no user, so it 401s. Call them from the client only via `postEdgeFn()` (`src/shared/utils/edgeFetch.ts`), which attaches the session access token and an AbortController timeout (no retry — these aren't idempotent; a lost-response retry would double-award XP). `award-gem` already used session-token auth; `send-notification`/`process-avatar` stay `--no-verify-jwt` (called server-side/inter-function).

**A function can be fully correct in the repo and still be missing from the live project** — `react-to-message` sat undeployed for an unknown period (absent from `supabase functions list`), so every `supabase.functions.invoke('react-to-message', …)` call 404'd, which the client correctly read as `FunctionsHttpError` and rolled back — producing a deterministic "reaction appears then vanishes on every tap" bug that looked like a client-side race and survived several client-code-only fix attempts before the real cause was found. When a client → edge-function flow misbehaves in a way that looks like a race/rollback bug, check `supabase functions list --project-ref tlveyeisjbythssmocth` for that function **before** re-auditing the optimistic-update logic.

Live Vercel crons (`vercel.json`) call this over HTTP: `/api/cron/process-deletions` (daily 03:00 UTC — hard-deletes accounts past their 7-day `pending_deletions.delete_at` grace period).

New notification type: see the `notification-engine` skill (`.claude/skills/notification-engine/SKILL.md`) for the full checklist, preference-column wiring, and `NotifSheet` UI steps.

## PWA / Push
- SW: `public/sw-push.js` — handwritten, no workbox; no multi-arg `importScripts()` (kills iOS Safari)
- `manifest.json` `start_url: "/home"` — avoids 2-hop redirect on icon launch
- `sw-push.js` caching: `nexus-pages-v2` (StaleWhileRevalidate for app nav) · `nexus-static-v2` (CacheFirst `/_next/static/`) · `nexus-assets-v1` (CacheFirst `/sprites/`, `/icons/`, `/lottie/`, `/img/` — not content-hashed but effectively immutable; bump the version suffix if a file under these paths is ever replaced in place) · `nexus-images-v1` (CacheFirst Supabase storage)
- `sw.js` (workbox) is **never registered** — `SWRegister` only registers `sw-push.js`

Push notification delivery specifics (VAPID setup, subscription handling, iOS `showNotification` limits, debugging 401/`expired_deleted`): see the `notification-engine` skill.

## Images
See the `image-handling` skill (`.claude/skills/image-handling/SKILL.md`) for image storage, the Supabase render loaders (`supabaseImageLoader`/`avatarImageLoader`/`heightCropImageUrl`), the required display components (`UserAvatar`/`GroupAvatar`/`ProfileHeroBackground`), the crop+compress upload pipeline, and aspect ratios by surface. Load it whenever touching image upload, cropping, compression, avatars, or crew images.

## Design System Rules
See the `design-system` skill (`.claude/skills/design-system/SKILL.md`) for the rules (use existing components + design tokens, never hardcode values, follow Figma) and the token references (`colors.md`, `spacing.md`, `typography.md`, `icon-usage.md`, `gradients.md`). Load it before creating a page/component, implementing a Figma design, or introducing any color/spacing/gradient value.

## Page Structure

- All subpages must use the shared `PageHeader` component (`src/shared/components/ui/PageHeader.tsx`).
- Do not create custom page header implementations.
- Reuse the existing header styling, spacing, typography, and navigation pattern.
- Keep page headers consistent throughout the application.

`PageHeader` props: `title` (string, rendered uppercase Silkscreen `--xl` `--color-primary`), optional `onBack` (back handler for the left `ChevronLeft` 24×24 `--color-primary`), and optional `right` (ReactNode for a right-side action). Container padding `paddingX: var(--md)`, `paddingTop: max(env(safe-area-inset-top), var(--x5))`, `paddingBottom: var(--x5)`; back-button↔title gap `var(--x5)`.

**Any subpage with CTA buttons pinned to the bottom (Save Changes, Add announcement, Continue, etc.) must use the shared `PageFooter` component** (`src/shared/components/ui/PageFooter.tsx`, Figma 480:6187) — see the `page-footer` skill (`.claude/skills/page-footer/SKILL.md`) before adding one. It is the footer counterpart to `PageHeader`: a `flex-shrink-0` sibling placed directly after the scrollable content inside the page's full-height flex column, NOT `position: fixed` — the flex-sibling approach docks it to the true bottom without overlapping content or fighting the keyboard. Container: `gap: var(--x5)` (stacks multiple buttons), `padding: var(--x5) var(--x5) max(env(safe-area-inset-bottom), var(--x8)) var(--x5)`. It only owns the container — reuse `Button`/`DefinitionButton` for the CTA itself rather than a one-off button; more button variants get wired into it over time. `Button`'s `variant="outlined"` is transparent (no fill) with `color="purple"` (default, Figma 502:2788) / `"red"` (502:2789) / `"tertiary"` (502:2723) driving the border + text color. Current consumers: `ManageUserProfile`, `ManageSquadProfile`, `DeveloperUserAnnouncements` (swaps between the `Add announcement` trigger and a Save/Cancel pair depending on `showCreate`), `CreateDefinitionPage` (add + edit definition, same component via `mode` prop).

**Back button / `onBack` — the `useSlideBack` context trap.** When `onBack` is omitted, `PageHeader` falls back to `useSlideBack()` **itself**. This works because `PageHeader` renders as a *descendant* of the page's `<SlidePage>`, and `SlideBackContext.Provider` only wraps `SlidePage`'s children. Do **NOT** resolve `useSlideBack()` in a page's *own* component body and pass it as `onBack`: that component sits ABOVE its own `SlidePage`'s provider (there is no ancestor `SlidePage` — the `(app)` layout renders `{children}` directly), so it resolves to the default **no-op** and the back button does nothing. Only pass an explicit `onBack` when the page closes some *other* way than SlidePage back-nav (an overlay slide-out or a sheet dismiss). Same rule applies to any in-page post-save/programmatic "go back": don't call a body-level `useSlideBack()` — use `useRouter().back()` (as `ManageUserProfile`'s save flow does).

Current consumers: `DefinitionHomePage` (list; no `onBack` → context goBack; `right` = `Plus` opens `CreateDefinitionPage`), `ManageUserProfile` (no `onBack` → context goBack; save uses `router.back()`), `DeveloperUserSettings` (no `onBack` → context goBack); explicit-`onBack` cases: `CreateDefinitionPage` (overlay slide-out `handleBack`, not under a `SlidePage`) and `ManageSquadProfile` (`requestClose` → `window.history.back()`, dismisses the details sheet). This unified the former "bare-icon" header variant (`--color-tertiary` chevron, `--x3` spacing) that `ManageUserProfile`/`DeveloperUserSettings` used — they now match the `--color-primary` chevron + `--x5` spacing of the rest.

**Subpage opened from a bottom sheet: back must skip the sheet, not reopen it.** When a full-screen overlay (e.g. `ManageSquadProfile`) is launched from a bottom sheet (e.g. `SquadDetailsSheet`'s `MagicEdit` button), both the tap-to-go-back path and the swipe-to-go-back path must land directly on the underlying page — never back into the sheet first. The pattern (see `ManageSquadProfile`):
- The opener closes the sheet and opens the subpage in the same state update (`setIsExpanded(false); setShowManageSquad(true)`), and the subpage's `onClose` prop resets *both* flags together, so there is only one combined "closed" state to return to, not two nested ones.
- The subpage pushes exactly one `history.pushState()` entry on mount and listens for a single `popstate` to fire that combined `onClose` — both the `PageHeader` back chevron (`onBack`) and a successful save route through the same `requestClose()` (`window.history.back()`), so every dismissal path is identical.
- **Swipe must not be left to the native OS edge-swipe-back gesture when the underlying page's `SlidePage` uses `nativeSwipe`.** The browser snapshots the screen at `pushState` time to use as the native drag-preview; if that snapshot is captured mid cross-fade (sheet still visible above the subpage, which hasn't slid into view yet), swiping back visibly flashes the sheet before landing on the correct page, even though the final state is correct. Fix: give the subpage its own left-edge touch listener (`preventDefault()` on a touch starting `< 40px` from the edge suppresses the native gesture) that routes a qualifying swipe through the same `requestClose()` the button uses — this guarantees swipe and tap are visually and functionally identical, with no native preview involved. `ManageSquadProfile.tsx` is the reference implementation.

## Shared UI Components

- Use the shared `BottomSheet` component for all bottom sheet interfaces.
- Do not create custom bottom sheet implementations.
- Extend existing variants before creating new ones.
- Keep bottom sheet behavior and styling consistent across the application.

## Bottom Sheet Patterns

Two named patterns — every new sheet must use one; no custom dismiss logic.

### Sheet (standard)
Backdrop tap + drag-to-dismiss. Spring `stiffness 320, damping 32`. Use `<BottomSheet>` (`src/shared/components/ui/sheet/BottomSheet.tsx`) — do not inline the motion markup.

```tsx
<BottomSheet onClose={onClose} zIndex={70}>
  {/* content */}
</BottomSheet>
```

Upload modals: pass `disableDrag={saving}`. Sheets with inputs: blur on mount to suppress keyboard.

### SheetFooter — CTA footer (`src/shared/components/ui/sheet/SheetFooter.tsx`, Figma 502:2783)
Sheet counterpart to `PageFooter` — not every sheet has one. See the `bottom-sheets` skill for the full pattern (placement as a sibling after content, padding ownership, button reuse).

```tsx
<BottomSheet onClose={onClose}>
  {/* content */}
  <SheetFooter>
    <Button onClick={handleSave} loading={saving} className="w-full">Save</Button>
  </SheetFooter>
</BottomSheet>
```

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
Full-height swipe-up. Shares the standard sheet's pull-to-close gesture via `useSheetDrag` (`src/shared/components/ui/sheet/useSheetDrag.ts`) — the same hook `BottomSheet` uses, so the drag feels identical (`dragListener={false}` + `useDragControls`, downward-pull-at-scroll-top, close past offset 80 / velocity 400, coexists with the members list's inner scroll). Do not replicate the sheet chrome, but reuse `useSheetDrag` for any new draggable sheet.

## Definition Buttons (`src/shared/components/ui/DefinitionButton.tsx`)

Figma 402:9772 — rounded (`rounded-x3`), DM Sans SemiBold sm, `p-x5` padding, full-width, optional icon. Superseded by the `Button` outlined/filled variants (size lg) for all sheet/subpage CTAs — see `SheetFooter` above / `PageFooter` in Page Structure. No live consumers remain; the component is kept but orphaned rather than deleted, same treatment as other unused-but-valid code noted elsewhere in this doc.

## UserAvatar (`src/shared/components/ui/UserAvatar.tsx`)

Single component for all user profile photo rendering. Always circular — there is no square variant, and never render avatar images inline. Uses `avatarImageLoader` internally — Supabase storage URLs are resized + quality-compressed via the render API; Google OAuth URLs are resized via Google's CDN.

```tsx
// Standard message / member list avatar (circle, bg-surface, 32px default)
<UserAvatar avatarUrl={profile.avatar_url} username={profile.username} size={32} />

// Above-fold hero (circle, bg-primary, black initial for contrast, priority)
<UserAvatar avatarUrl={avatarUrl} username={username} size={56} bg="primary" initialColor="black" priority />

// DM headers / profile heroes — circle, bg-border
<UserAvatar avatarUrl={avatarUrl} username={username} size={32} bg="border" initialColor="primary" />

// Custom fallback color — event "going" avatar stack (purple fallback, white initial)
<UserAvatar avatarUrl={profile.avatar_url} username={profile.username} size={24} bg="border" fallbackBg="var(--color-purple)" initialColor="white" />
```

Props:
| Prop | Type | Default | Notes |
|---|---|---|---|
| `avatarUrl` | `string \| null` | — | Supabase storage or Google URL |
| `username` | `string \| null` | — | Used for `alt` text and initial fallback |
| `size` | `number` | `32` | px; pick from `imageSizes` (24, 32, 48, 56) for best cache hits |
| `bg` | `'surface' \| 'border' \| 'primary'` | `'surface'` | Container background (visible during load + fallback) |
| `fallbackBg` | `string` | — | CSS color for the no-avatar state only (overrides `bg` on the inner div) |
| `initialColor` | `'purple' \| 'primary' \| 'black' \| 'white'` | `'purple'` | Pixel-font initial letter color |
| `priority` | `boolean` | `false` | Pass `true` for above-fold avatars |

Online dot: render outside `<UserAvatar>` in a `div.relative` wrapper — the component does not include presence indicators.

If a caller wraps `<UserAvatar>` in its own button/div to add a background or click target (e.g. an avatar-edit affordance), that wrapper must also be `border-radius: 50%` — a square wrapper around a circular avatar exposes the wrapper's own background color in the four corners (this was an actual bug in the profile-edit avatar button (now in `ManageUserProfile`), which had `overflow-hidden` but no border-radius, showing `--color-primary` white in the corners around the circular photo).

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

Three reusable components matching Figma 402:9678's `type` (`standard`/`dropdown`) × `state` (`default`/`active`) × `required` × `helperText` variants. Use these for all in-app forms (not auth/onboarding, which uses the older `Input.tsx`). All three share the same internal (unexported) `FieldLabel`/`FieldHelperText` — label row with optional red `*` (`var(--red)`, required only) and helper text row — so any future variant of this component should extend those, not re-inline the label/helper markup a fourth time.

**Before building any new labelled input, textarea, or select/picker-style field UI, reuse one of these three rather than hand-rolling the label/border/helper markup.**

### `InputField`
Single-line labelled input (Figma's `type="standard"`). Fixed `h-[50px]`, `border-border` idle → `border-border-hover` on `focus-within` (Figma's `default`→`active` state). Label: DM Sans Medium sm primary. Input text: DM Sans Regular sm primary, muted placeholder. Optional helper text: DM Sans Regular xxs tertiary tracking-[0.2px]. `required` renders a red `*` after the label and sets the native `required` attribute.

```tsx
<InputField
  label="Words attached to definition"
  value={word}
  onChange={setWord}
  placeholder="e.g. GG, gg, good game"
  helperText="Comma-separated aliases map to the same definition."
  maxLength={100}
  autoComplete="off"
  required
/>
```

### `TextareaField`
Same label/helper/border design as `InputField` but renders a `<textarea>`. Height set via `rows` prop (default 5). Padding `p-x5` wraps the textarea. Same `required` behavior as `InputField`.

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

### `SelectField`
Figma's `type="dropdown"` variant. Same label/border/helper-text shell, but renders a `<button type="button">` trigger (not an editable input) showing `value` (primary text) or `placeholder` (muted text), with a trailing `ChevronDown` (24×24, `--color-primary`). Border is always `border-border-hover` — Figma's file has no dim "default" instance of the dropdown type, unlike the standard input's idle state. This component is **only the closed trigger** — Figma's dev-mode node doesn't specify an open/options-list state, so there's no popover baked in here. The caller owns what opens on `onClick` (typically a `BottomSheet` picker).

```tsx
<SelectField
  label="Class"
  value={selectedClass}
  placeholder="Choose a class"
  onClick={() => setShowClassSheet(true)}
  required
/>
```

## Working Agreement
- **Never modify Supabase schema/RLS/data directly** — always via a reviewable migration file (`supabase/migrations/`). No ad-hoc `apply_migration`/dashboard/`execute_sql` DDL or data edits against production; write the migration, let it be reviewed, then apply.
- **After any refactor touching optimistic updates or Realtime**, explain the data flow before and after in plain language — not just the diff.
- **Prefer small, reviewable diffs over large rewrites.** If a fix requires touching >5 files, pause and describe the plan first.
- **Run lint + typecheck + build after every change** before reporting it as done.

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

## Disabled / Dev-Gated Features
- Voice notes: UI removed; `XP_VALUES['voice']` + element `lightning` still defined server-side
- Poll creation: dev-gated via `nexus_poll_feature`; dispatches `nexus-poll-feature-change` event
- Events (`message_type: 'event'`, `features/events/`): dev-gated via `nexus_events_enabled`

## Gotchas
- `CREATE OR REPLACE FUNCTION` only replaces if signature matches exactly. Adding/removing params creates a new overload → ambiguous RPC errors. Always `DROP FUNCTION` old signatures first.
- Optimistic messages carry `tempId`. Reconciliation **must** call `updateMessage(tempId, { id })` in place — never `removeMessage(tempId)` on success. Only remove on RPC error.
- `insert_message` RPC uses `auth.uid()` internally — returns `null` from service role. For server-side inserts use `service.from('messages').insert(...)` directly.
- **Don't use Framer Motion `animate={{ width }}` inside a TanStack virtualizer.** Use CSS `transition: width 0.5s ease-out` instead.
- **`RETURNS TABLE` creates implicit output variables that shadow columns.** Always qualify table-prefixed column names in PL/pgSQL to avoid `42702` ambiguity.
- **iOS Safari clears sessionStorage on PWA kill/relaunch.** Always write to both sessionStorage and IDB; read sessionStorage first (sync), fall back to IDB (async ~5ms).
- **`SwipeableCrewCard`**: `wasDragging` set in `onDragEnd` only (not `onDragStart`) — setting it in `onDragStart` blocks `onClick` for micro-movements. `onDragStart` calls `cancelLongPress()` to prevent 500ms timer firing on slow swipes.
- **iOS Safari `<button>` background**: `-webkit-appearance: button` overrides custom `background` values. Always include `appearance-none` (Tailwind) on styled `<button>` elements — `SheetActionButton` already does this.
- **`FloatingBackButton`'s `replaceState(/home) + pushState(/chat)` effect runs on every mount** — including returning from a sub-page. Before any `router.push()` away from chat, call `sessionStorage.setItem('nexus_chat_from', 'chat')` so the effect skips re-manipulation on return; otherwise it stacks an extra `/home` history entry per round trip.
- **`SlidePage`'s left-edge swipe listener fires through fixed overlays** — they're still DOM children, so touch events bubble up. Pass `nativeSwipe={overlayOpen}` whenever any overlay is active, or the swipe handler can call `router.back()` while the overlay is showing.
- **`squad_definitions.creator_id` FK points to `auth.users`, not `public.profiles`.** Supabase embedded selects (`profiles!creator_id(username)`) will fail — the FK hint resolves to `auth.users` which is a different schema. Fetch creator usernames via a separate `profiles` query keyed on the collected `creator_id` values.
- **Realtime INSERT handlers that need profile data should cache known usernames in a `useRef`.** Seed the cache from `initialDefinitions` (or equivalent server-fetched data) on mount, then only hit Supabase for unseen `creator_id` values. This avoids a DB round-trip for every INSERT from a known user. See `profileCacheRef` in `DefinitionHomePage`.
- **`insert_message`'s `RETURNING *` already contains every column** (reply/image fields included) — `ChatInput`'s send/sendImages/sendGif broadcast and patch the store directly from that returned row (`broadcastNewMessage(raw)` / `updateMessage(tempId, raw)`) instead of hand-picking fields. Don't reintroduce manually-constructed payload objects; they drift from what was actually written.
- **Postgres Changes `filter` on `profiles` UPDATE must be scoped to known member IDs** (`id=in.(...)`) — an unfiltered listener receives every profile update in the entire database and discards irrelevant ones client-side. Same principle applies to any new `postgres_changes` subscription: always filter server-side, never rely on client-side discarding.
- **`broadcastTyping` gates on `isTypingRef` before calling `.track()`.** `handleInput` calls it on every keystroke; without the transition guard it would re-send presence on every character instead of only on the not-typing↔typing edge.
- **Client-side filters can silently re-hide rows that already passed RLS — check the DB before assuming data was deleted.** Two real cases so far: (1) Vibes vanishing after leaving a crew — `notes` SELECT RLS required *current* crew membership (fixed: also allow `created_by = auth.uid()`), and `profile/page.tsx` separately re-filtered by joined-crew ids client-side (fixed: query is now just `created_by = user.id`). (2) `VibesGrid`'s `MUSIC_DOMAINS` allowlist didn't recognize `m.youtube.com`, so valid saved notes were filtered out of the display array; `normHost()` now strips `m.` as well as `www.`, and the allowlist is a single shared `MUSIC_DOMAINS` constant in `config.ts` (was previously duplicated and had drifted between `VibesGrid` and `chat/[crewId]/page.tsx`).
- **`profile_photos` / `notes` deletes are hard deletes with no versioning** — `deletePhotoAction`/`deleteNoteAction` remove the DB row and storage object together, permanently, with no recovery path. `PhotosGrid`'s Remove Photo requires a confirm-sheet tap before calling it; don't remove that guard or add a similarly instant destructive action elsewhere.
- **Any new path that writes `profiles.username` must call `validateUsernameFormat()`** (`src/shared/utils/username.ts`) — it's the only enforcement of the `^[A-Za-z0-9_]+$` rule; nothing checks it at the DB level (no `CHECK` constraint). See Username Format.
- **Data migrations that backfill a flag/state should select by a condition, not hardcoded ids** — `needs_username_reset`'s backfill used `where username !~ '^[A-Za-z0-9_]+$'` rather than the specific ids found during audit, so it stays correct if more legacy rows are discovered later.
- **Memoizing a derived value only helps if its own inputs are stable.** `ChatInput`'s `members` (`Object.values(memberProfiles).filter(...)`) built a fresh array every render; wrapping a *downstream* consumer (e.g. `SquadDetailsSheet`'s `sortedMembers`) in `useMemo` still recomputed every time because its dependency (`members`) never `===` the previous render's. Had to memoize `members` itself (deps: `memberProfiles`, `kickedIds` — both genuinely stable) before the downstream memoizations became effective. When adding `useMemo`/`useCallback` around something derived from a prop, check whether that prop's own upstream derivation is stable — otherwise the memoization is a no-op.
- **The global `notification_preferences` table (`notif_messages`/`notif_mentions`/`notif_replies`) has no client write path anymore** — the Settings page's Notification row (which used to toggle it) was removed since notification prefs are now per-crew (`crew_notification_preferences`, via `SquadDetailsSheet`). But `send-notification`'s edge function still reads `notification_preferences` first and ANDs it with the per-crew row — it's a global kill-switch that gates `message_received`/`mention_received`/`reply_received` regardless of crew. Any row a user previously set to `false` there is now permanently stuck off with no UI to re-enable it, and no one can newly mute all-crews notifications. If global mute needs to come back, it belongs inside the Account section of the Edit Profile sheet, not as its own top-level Settings row.
- **`TickerBanner`** (`src/shared/components/banners/TickerBanner.tsx`, Figma 189:1767) is the sole `profiles.status` marquee — props are just `{ text }`; the pixel-art quote glyph, quoting, and marquee/loop math are baked in, not caller-configurable. It had drifted into four independent hand-rolled copies (`ProfileClient`, `MemberProfileClient`, `AccountPageMember`, `UserCard`, `FriendsClient` each had their own `StatusTicker`/`ProfileStatusTicker`, plus two call sites passing a mismatched pixelarticons `Message` icon into the real component) before being consolidated — each copy had silently drifted on font size, text color, or the dot separator. If you need a status/mood ticker anywhere, render `<TickerBanner text={status} />`; do not hand-roll another marquee.
