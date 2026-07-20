import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache"
import { createClient, createServiceClient } from "@/shared/supabase/server";
import { ChatFloatingNav } from "@/shared/components/ui/PageFloatButton";
import { MessageList } from "@/features/chat/components/messages/MessageList";
import { ChatInput } from "@/features/chat/components/input/ChatInput";
import { WelcomeDetector } from "@/shared/components/pwa/WelcomeDetector";
import { ErrorBoundary } from "@/shared/components/ui/ErrorBoundary";
import { SlidePage } from "@/app/layouts/SlidePage";
import { MUSIC_DOMAINS } from "@/shared/constants/config";
import type { Profile, Crew, AvatarClass } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type MemberProfile = Pick<Profile, "id" | "username" | "avatar_class" | "avatar_url" | "background_url" | "status">
type MemberProfileMap = Record<string, MemberProfile>
// class is the crew-specific class; last_seen is fetched fresh (not cached)
type MemberRow = { user_id: string; last_seen: string | null; class: AvatarClass | null; joined_at: string | null }

// ─── Cache ────────────────────────────────────────────────────────────────────

// Member profiles (username, avatar) change rarely — cache for 60 s.
// avatar_class comes from crew_members.class (per-crew) not profiles.avatar_class (global).
// Invalidated by revalidateTag('crew-members:{crewId}') on join/leave.
function getCachedMemberProfiles(crewId: string) {
  return unstable_cache(
    async () => {
      const supabase = createServiceClient()
      const { data } = await supabase
        .from("crew_members")
        .select("user_id, class, profile:profiles(id, username, avatar_url, background_url, status, birthday)")
        .eq("crew_id", crewId)
      type RawRow = { user_id: string; class: string | null; profile: (Omit<MemberProfile, 'avatar_class'> & { birthday: string | null }) | null }
      return (data ?? []).map((r) => {
        const row = r as unknown as RawRow
        return {
          user_id: row.user_id,
          profile: row.profile
            ? { ...row.profile, avatar_class: row.class as AvatarClass | null }
            : null,
        }
      }) as { user_id: string; profile: (MemberProfile & { birthday: string | null }) | null }[]
    },
    // v2: cache key bumped when background_url was added to the select — old
    // cached entries under the v1 key predate that column and would otherwise
    // keep serving stale profiles missing it until their 300s TTL happened to
    // lapse, making the squad-card background look like it "worked for some
    // members but not others" depending on each crew's cache freshness.
    [`chat-member-profiles-v2:${crewId}`],
    { tags: [`crew-members:${crewId}`], revalidate: 300 }
  )()
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface ChatPageProps {
  params:       Promise<{ crewId: string }>;
  searchParams: Promise<{ welcome?: string }>;
}

export default async function ChatPage({ params, searchParams }: ChatPageProps) {
  const supabase = await createClient();

  // Stage 1 — session (cookie-only, no network) + route params in parallel
  const [{ data: { session } }, { crewId }, { welcome }] = await Promise.all([
    supabase.auth.getSession(),
    params,
    searchParams,
  ]);
  if (!session) redirect("/login");
  const user = session.user;

  // Stage 2 — all 6 queries in parallel.
  // crew (total_xp) stays uncached — it changes with every message.
  // crew_members fetched fresh for membership check (RLS returns empty for non-members).
  // vibeNotesRes fetches most-recent music note per member for vinyl pills in message bubbles.
  // chatRoomOrderRes: this user's non-DM crews, most-recently-active first — feeds the
  // dev-gated chat swipe-navigation feature (see ChatInput's chatRoomOrder prop). Fetched
  // unconditionally (cheap, same join shape as lastSeenResult) rather than gating behind
  // an extra is_dev round trip, since the toggle itself is a plain client-side dev flag.
  const [cachedProfiles, crewResult, lastSeenResult, gemResult, vibeNotesRes, memberPinRes, chatRoomOrderRes] = await Promise.all([
    getCachedMemberProfiles(crewId),
    supabase.from("crews").select("id, name, invite_code, level, total_xp, image_url, background_image_url").eq("id", crewId).single(),
    supabase
      .from("crew_members")
      .select("user_id, last_seen, class, joined_at")
      .eq("crew_id", crewId),
    supabase.from("profiles").select("gem_balance, coins, pinned_crew_id").eq("id", user.id).single(),
    // Most-recent music notes per member within this crew (fallback source)
    supabase
      .from('notes')
      .select('id, created_by, og_title, og_image_url')
      .eq('crew_id', crewId)
      .in('source_domain', MUSIC_DOMAINS)
      .order('created_at', { ascending: false })
      .limit(100),
    // Each member's pinned_vinyl_id from their profile
    supabase
      .from('crew_members')
      .select('user_id, profile:profiles(pinned_vinyl_id)')
      .eq('crew_id', crewId),
    supabase
      .from('crew_members')
      .select('crew_id, last_seen, joined_at, crews(id, is_dm, last_message_at)')
      .eq('user_id', user.id),
  ]);

  const crew         = crewResult.data as Crew | null;
  const profileRow   = gemResult.data as { gem_balance: number; coins: number; pinned_crew_id: string | null } | null;
  const gemBalance   = profileRow?.gem_balance ?? 0;
  const userCoins    = profileRow?.coins ?? 0;
  const pinnedCrewId = profileRow?.pinned_crew_id ?? null;

  // This user's group-chat (non-DM) memberships — see Stage 2's chatRoomOrderRes query
  // above. Feeds both `chatRoomOrder` (ChatInput's dev-gated chat swipe-navigation feature)
  // and, below, the total-unread-messages count ChatFloatingNav's header shows.
  type ChatRoomOrderRow = {
    crew_id:    string
    last_seen:  string | null
    joined_at:  string | null
    crews:      { id: string; is_dm: boolean; last_message_at: string | null } | null
  }
  const chatRoomOrderRows = ((chatRoomOrderRes.data ?? []) as unknown as ChatRoomOrderRow[])
    .filter((r) => r.crews && !r.crews.is_dm)
  const chatRoomOrder = [...chatRoomOrderRows]
    .sort((a, b) => (b.crews!.last_message_at ?? '').localeCompare(a.crews!.last_message_at ?? ''))
    .map((r) => r.crews!.id);

  // Membership check — fresh query (RLS returns empty for non-members)
  const lastSeenRows = (lastSeenResult.data ?? []) as MemberRow[]
  const isMember = lastSeenRows.some((r) => r.user_id === user.id);
  if (!isMember || !crew) redirect("/home");

  // Build profile map from cached data
  const memberProfiles: MemberProfileMap = Object.fromEntries(
    cachedProfiles.filter((r) => r.profile).map((r) => [r.user_id, r.profile!])
  );

  // Per-crew class check — uses crew_members.class so each crew has its own class selection.
  // lastSeenResult is always fresh (not cached) so no redirect-loop risk.
  const currentMemberRow = lastSeenRows.find((r) => r.user_id === user.id)
  if (!currentMemberRow?.class) {
    redirect(`/onboarding/class?crew=${crewId}`)
  }

  // Stage 3 — total unread "group messages" (non-DM only, matching chatRoomOrderRows above)
  // across every crew this user belongs to, for ChatFloatingNav's header (Figma 603:3526).
  // Depends on Stage 2's crew ids/cutoffs, so it can't join that parallel batch; run after
  // the membership/class redirects above so a page that's about to redirect away doesn't
  // pay for this extra round trip first. Same last_seen-falls-back-to-joined_at cutoff
  // convention home/page.tsx's own unread query uses.
  const totalUnreadResult = chatRoomOrderRows.length > 0
    ? await supabase.rpc('get_unread_counts', {
        p_crew_ids: chatRoomOrderRows.map((r) => r.crew_id),
        p_cutoffs:  chatRoomOrderRows.map((r) => (r.last_seen ?? r.joined_at) as string),
      })
    : { data: [] as { crew_id: string; unread_count: number }[] };
  const totalUnreadMessages = (totalUnreadResult.data ?? []).reduce((sum, r) => sum + (r.unread_count ?? 0), 0);

  // Creator = member with the earliest joined_at
  const creatorId = lastSeenRows.length > 0
    ? lastSeenRows.reduce((earliest, row) => {
        if (!earliest.joined_at) return row
        if (!row.joined_at) return earliest
        return row.joined_at < earliest.joined_at ? row : earliest
      }, lastSeenRows[0]).user_id
    : null

  // Build vinyl pill map for message bubbles.
  // Priority: user's pinned vibe → most-recent music note in this crew.
  type NoteRow = { id: string; created_by: string; og_title: string | null; og_image_url: string | null }
  type PinRow  = { user_id: string; profile: { pinned_vinyl_id: string | null } | null }

  // Index crew notes: by id (for pinned lookup) and by user (most-recent first for fallback)
  const noteById:    Record<string, NoteRow>   = {}
  const notesByUser: Record<string, NoteRow[]> = {}
  for (const n of (vibeNotesRes.data ?? []) as unknown as NoteRow[]) {
    noteById[n.id] = n
    if (!notesByUser[n.created_by]) notesByUser[n.created_by] = []
    notesByUser[n.created_by].push(n)
  }

  // Extract each member's pinned_vinyl_id
  const pinnedMap: Record<string, string | null> = {}
  for (const r of (memberPinRes.data ?? []) as unknown as PinRow[]) {
    pinnedMap[r.user_id] = r.profile?.pinned_vinyl_id ?? null
  }

  // Pinned notes that aren't in the crew board need a global lookup
  const missingIds = Object.values(pinnedMap).filter((id): id is string => !!id && !noteById[id])

  // Neither depends on the other — only on data already available above
  // (lastSeenRows, missingIds) — so they run as one parallel batch instead of two
  // sequential round trips.
  const [historyResult, extraNotesResult] = await Promise.all([
    // Past usernames of current members — lets @mentions in old messages resolve to
    // whatever the member's username is now. Small/rare table; no FK path from
    // crew_members to username_history for an embedded select, so fetched separately.
    supabase
      .from('username_history')
      .select('user_id, old_username')
      .in('user_id', lastSeenRows.map((r) => r.user_id)),
    missingIds.length > 0
      ? supabase.from('notes').select('id, created_by, og_title, og_image_url').in('id', missingIds)
      : Promise.resolve({ data: null }),
  ])

  const initialMentionAliases: [string, string][] = (
    (historyResult.data ?? []) as { user_id: string; old_username: string }[]
  ).map((h) => [h.old_username.toLowerCase(), h.user_id])

  const extraById: Record<string, NoteRow> = {}
  for (const n of (extraNotesResult.data ?? []) as unknown as NoteRow[]) extraById[n.id] = n

  const memberPinnedVinyls: Record<string, { imageUrl: string | null; title: string | null }> = {}
  // Users with an explicit pin
  for (const [userId, pinnedId] of Object.entries(pinnedMap)) {
    if (pinnedId) {
      const note = noteById[pinnedId] ?? extraById[pinnedId]
      if (note) {
        memberPinnedVinyls[userId] = { imageUrl: note.og_image_url, title: note.og_title }
        continue
      }
    }
    // Fallback: most-recent note in this crew
    const fallback = notesByUser[userId]?.[0]
    if (fallback) memberPinnedVinyls[userId] = { imageUrl: fallback.og_image_url, title: fallback.og_title }
  }
  // Users with crew notes but no pinned_vinyl_id entry
  for (const [userId, notes] of Object.entries(notesByUser)) {
    if (!memberPinnedVinyls[userId] && notes.length > 0) {
      memberPinnedVinyls[userId] = { imageUrl: notes[0].og_image_url, title: notes[0].og_title }
    }
  }

  return (
    <SlidePage
      className="flex flex-col bg-black"
      disableSwipe
      style={{
        position: 'fixed',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        maxWidth: 480,
        marginLeft: 'auto',
        marginRight: 'auto',
        overflow: 'hidden',
      }}
    >
      {welcome === "1" && <WelcomeDetector crewId={crewId} />}

      <ChatFloatingNav
        crewId={crewId}
        currentUserId={user.id}
        avatarUrl={memberProfiles[user.id]?.avatar_url ?? null}
        username={memberProfiles[user.id]?.username ?? null}
        initialGemBalance={gemBalance}
        initialCoins={userCoins}
        avatarClass={memberProfiles[user.id]?.avatar_class ?? null}
        initialTotalUnreadMessages={totalUnreadMessages}
      />

      <ErrorBoundary>
        <MessageList
          crewId={crewId}
          crewName={crew.name}
          currentUserId={user.id}
          memberProfiles={memberProfiles}
          creatorId={creatorId}
          memberPinnedVinyls={memberPinnedVinyls}
          inviteCode={crew.invite_code}
          initialMentionAliases={initialMentionAliases}
        />
      </ErrorBoundary>

      <ErrorBoundary>
        <ChatInput
          crewId={crewId}
          userId={user.id}
          userProfile={
            memberProfiles[user.id] ?? {
              id: user.id, username: "???", avatar_class: null, avatar_url: null, background_url: null, status: null,
            }
          }
          memberProfiles={memberProfiles}
          memberPinnedVinyls={memberPinnedVinyls}
          crewName={crew.name}
          inviteCode={crew.invite_code}
          creatorId={creatorId ?? undefined}
          crewImageUrl={crew.image_url ?? null}
          crewBackgroundImageUrl={(crew as { background_image_url?: string | null }).background_image_url ?? null}
          initialXP={crew.total_xp}
          currentUserId={user.id}
          chatRoomOrder={chatRoomOrder}
          initialPinnedCrewId={pinnedCrewId}
        />
      </ErrorBoundary>

    </SlidePage>
  );
}
