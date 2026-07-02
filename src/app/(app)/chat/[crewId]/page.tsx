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

  const MUSIC_DOMAINS = ['youtube.com', 'youtu.be', 'music.youtube.com', 'music.apple.com', 'open.spotify.com', 'spotify.com', 'soundcloud.com']

  // Stage 2 — all 7 queries in parallel.
  // raid + token were previously a sequential Stage 3 (they only need crewId
  // from Stage 1, not any Stage 2 result), so we move them here to eliminate
  // one full server round-trip on every chat open.
  // crew (total_xp) stays uncached — it changes with every message.
  // crew_members fetched fresh for membership check (RLS returns empty for non-members).
  // vibeNotesRes fetches most-recent music note per member for vinyl pills in message bubbles.
  const [cachedProfiles, crewResult, lastSeenResult, gemResult, raidRes, tokenRes, vibeNotesRes] = await Promise.all([
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
    supabase
      .from('notes')
      .select('created_by, og_title, og_image_url')
      .eq('crew_id', crewId)
      .in('source_domain', MUSIC_DOMAINS)
      .order('created_at', { ascending: false })
      .limit(100),
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

  // Build most-recent-music-note map per user for vinyl pills in message bubbles.
  // Notes are ordered by created_at DESC so the first match per user is their latest vibe.
  const memberPinnedVinyls: Record<string, { imageUrl: string | null; title: string | null }> = {}
  for (const n of (vibeNotesRes.data ?? [])) {
    const note = n as { created_by: string; og_title: string | null; og_image_url: string | null }
    if (!memberPinnedVinyls[note.created_by]) {
      memberPinnedVinyls[note.created_by] = {
        imageUrl: note.og_image_url,
        title:    note.og_title,
      }
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
