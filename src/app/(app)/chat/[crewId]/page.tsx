import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache"
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { WelcomeDetector } from "@/components/ui/WelcomeDetector";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { SlidePage } from "@/components/ui/SlidePage";
import type { Profile, Crew, ActiveRaid, AvatarClass } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type MemberProfile = Pick<Profile, "id" | "username" | "avatar_class" | "avatar_url">
type MemberProfileMap = Record<string, MemberProfile>
// class is the crew-specific class; last_seen is fetched fresh (not cached)
type MemberRow = { user_id: string; last_seen: string | null; class: AvatarClass | null }

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
        .select("user_id, class, profile:profiles(id, username, avatar_url)")
        .eq("crew_id", crewId)
      // Expose crew_members.class as avatar_class so the rest of the app stays typed
      type RawRow = { user_id: string; class: string | null; profile: Omit<MemberProfile, 'avatar_class'> | null }
      return (data ?? []).map((r) => {
        const row = r as unknown as RawRow
        return {
          user_id: row.user_id,
          profile: row.profile
            ? { ...row.profile, avatar_class: row.class as AvatarClass | null }
            : null,
        }
      }) as { user_id: string; profile: MemberProfile | null }[]
    },
    [`chat-member-profiles:${crewId}`],
    { tags: [`crew-members:${crewId}`], revalidate: 60 }
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

  // Stage 2 — cached member profiles + fresh crew/raid in parallel.
  // crew (total_xp) and active_raids stay uncached — they change with every message.
  // crew_members fetched fresh for membership check (RLS returns empty for non-members).
  const [cachedProfiles, crewResult, raidResult, lastSeenResult] = await Promise.all([
    getCachedMemberProfiles(crewId),
    supabase.from("crews").select("id, name, invite_code, level, total_xp").eq("id", crewId).single(),
    supabase
      .from("active_raids")
      .select("*")
      .eq("crew_id", crewId)
      .is("defeated_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle(),
    supabase
      .from("crew_members")
      .select("user_id, last_seen, class")
      .eq("crew_id", crewId),
  ]);

  const crew    = crewResult.data as Crew | null;
  const raidRow = raidResult.data as ActiveRaid | null;

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

  return (
    <SlidePage
      className="flex flex-col bg-black"
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

      <ChatHeader
        crew={crew}
        initialXP={crew.total_xp}
        initialRaid={raidRow ?? null}
        currentUserId={user.id}
        crewId={crewId}
      />

      <ErrorBoundary>
        <MessageList
          crewId={crewId}
          crewName={crew.name}
          currentUserId={user.id}
          memberProfiles={memberProfiles}
          initialRaid={raidRow ?? null}
        />
      </ErrorBoundary>

      <ErrorBoundary>
        <ChatInput
          crewId={crewId}
          userId={user.id}
          userProfile={
            memberProfiles[user.id] ?? {
              id: user.id, username: "???", avatar_class: null, avatar_url: null,
            }
          }
          memberProfiles={memberProfiles}
        />
      </ErrorBoundary>

    </SlidePage>
  );
}
