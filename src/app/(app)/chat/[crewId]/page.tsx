import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache"
import { createClient, createServiceClient } from "@/shared/supabase/server";
import { FloatingBackButton } from "@/features/chat/components/navigation/FloatingBackButton";
import { MessageList } from "@/features/chat/components/messages/MessageList";
import { ChatInput } from "@/features/chat/components/input/ChatInput";
import { CombatHUD } from "@/features/combat/components/CombatHUD";
import { WelcomeDetector } from "@/shared/components/pwa/WelcomeDetector";
import { ErrorBoundary } from "@/shared/components/ui/ErrorBoundary";
import { SlidePage } from "@/app/layouts/SlidePage";
import { MUSIC_DOMAINS } from "@/shared/constants/config";
import type { Profile, Crew, AvatarClass, ActiveRaid, CombatMember, CombatClass } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type MemberProfile = Pick<Profile, "id" | "username" | "avatar_class" | "avatar_url" | "status">
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
        .select("user_id, class, profile:profiles(id, username, avatar_url, status, birthday)")
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
    [`chat-member-profiles:${crewId}`],
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

  // Stage 2 — all 7 queries in parallel.
  // raid + token were previously a sequential Stage 3 (they only need crewId
  // from Stage 1, not any Stage 2 result), so we move them here to eliminate
  // one full server round-trip on every chat open.
  // crew (total_xp) stays uncached — it changes with every message.
  // crew_members fetched fresh for membership check (RLS returns empty for non-members).
  // vibeNotesRes fetches most-recent music note per member for vinyl pills in message bubbles.
  const [cachedProfiles, crewResult, lastSeenResult, gemResult, raidRes, tokenRes, vibeNotesRes, memberPinRes] = await Promise.all([
    getCachedMemberProfiles(crewId),
    supabase.from("crews").select("id, name, invite_code, level, total_xp, image_url, background_image_url").eq("id", crewId).single(),
    supabase
      .from("crew_members")
      .select("user_id, last_seen, class, joined_at")
      .eq("crew_id", crewId),
    supabase.from("profiles").select("gem_balance").eq("id", user.id).single(),
    supabase
      .from('active_raids')
      .select('id, crew_id, boss_id, current_hp, max_hp, phase, started_at, expires_at, defeated_at, last_boss_attack_at, guard_user_id, guard_expires_at, volley_expires_at')
      .eq('crew_id', crewId)
      .is('defeated_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle(),
    supabase
      .from('revive_tokens')
      .select('count')
      .eq('crew_id', crewId)
      .maybeSingle(),
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
  ]);

  const crew       = crewResult.data as Crew | null;
  const gemBalance = (gemResult.data as { gem_balance: number } | null)?.gem_balance ?? 0;

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

  // Past usernames of current members — lets @mentions in old messages resolve to
  // whatever the member's username is now. Small/rare table; no FK path from
  // crew_members to username_history for an embedded select, so fetched separately.
  const { data: historyRows } = await supabase
    .from('username_history')
    .select('user_id, old_username')
    .in('user_id', lastSeenRows.map((r) => r.user_id))
  const initialMentionAliases: [string, string][] = (
    (historyRows ?? []) as { user_id: string; old_username: string }[]
  ).map((h) => [h.old_username.toLowerCase(), h.user_id])

  // Combat data — results from the parallel Stage 2 queries above
  let initialRaid:         ActiveRaid | null              = null
  let initialMemberStats:  Record<string, CombatMember>  = {}
  let initialReviveTokens: number                        = 5

  initialRaid         = raidRes.data as ActiveRaid | null
  initialReviveTokens = (tokenRes.data as { count: number } | null)?.count ?? 5

  if (initialRaid) {
    const { data: combatMembers } = await supabase
      .from('crew_combat_members')
      .select('id, raid_id, user_id, class, current_hp, max_hp, ability_bank, is_downed, downed_at, momentum_stack, last_msg_at, guard_expires_at')
      .eq('raid_id', initialRaid.id)
    initialMemberStats = Object.fromEntries(
      (combatMembers ?? []).map((m) => [m.user_id, m as CombatMember])
    )
  }

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
  let extraById: Record<string, NoteRow> = {}
  if (missingIds.length > 0) {
    const { data: extra } = await supabase
      .from('notes')
      .select('id, created_by, og_title, og_image_url')
      .in('id', missingIds)
    for (const n of (extra ?? []) as unknown as NoteRow[]) extraById[n.id] = n
  }

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
      nativeSwipe
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

      <FloatingBackButton crewId={crewId} currentUserId={user.id} initialGemBalance={gemBalance} creatorId={creatorId} />

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

      <CombatHUD
        currentUserId={user.id}
        crewId={crewId}
        memberProfiles={memberProfiles}
        userCombatClass={(currentMemberRow?.class as CombatClass | null) ?? undefined}
      />

      <ErrorBoundary>
        <ChatInput
          crewId={crewId}
          userId={user.id}
          userProfile={
            memberProfiles[user.id] ?? {
              id: user.id, username: "???", avatar_class: null, avatar_url: null, status: null,
            }
          }
          memberProfiles={memberProfiles}
          crewName={crew.name}
          inviteCode={crew.invite_code}
          creatorId={creatorId ?? undefined}
          crewImageUrl={crew.image_url ?? null}
          crewBackgroundImageUrl={(crew as { background_image_url?: string | null }).background_image_url ?? null}
          initialXP={crew.total_xp}
          currentUserId={user.id}
          userCombatClass={(currentMemberRow?.class as CombatClass | null) ?? null}
          initialRaid={initialRaid}
          initialMemberStats={initialMemberStats}
          initialReviveTokens={initialReviveTokens}
        />
      </ErrorBoundary>

    </SlidePage>
  );
}
