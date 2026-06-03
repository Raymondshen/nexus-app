import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache"
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { BottomNav } from "@/components/ui/BottomNav";
import { WelcomeDetector } from "@/components/ui/WelcomeDetector";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import type { Profile, Crew, ActiveRaid } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type MemberProfile = Pick<Profile, "id" | "username" | "avatar_class" | "avatar_url">
type MemberProfileMap = Record<string, MemberProfile>
type MemberRow = { user_id: string; last_seen: string | null; profile: MemberProfile | null }

// ─── Cache ────────────────────────────────────────────────────────────────────

// Member profiles (username, avatar) change rarely — cache for 60 s.
// last_seen is excluded from the cache since it's fetched fresh below.
// Invalidated by revalidateTag('crew-members:{crewId}') on join/leave.
function getCachedMemberProfiles(crewId: string) {
  return unstable_cache(
    async () => {
      const supabase = createServiceClient()
      const { data } = await supabase
        .from("crew_members")
        .select("user_id, profile:profiles(id, username, avatar_class, avatar_url)")
        .eq("crew_id", crewId)
      return (data ?? []) as unknown as { user_id: string; profile: MemberProfile | null }[]
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

  // Stage 2 — cached member profiles + fresh crew/raid/last_seen in parallel.
  // crew (total_xp) and active_raids stay uncached — they change with every message.
  // last_seen is fetched fresh for accurate online-presence dots.
  const [cachedProfiles, crewResult, raidResult, lastSeenResult] = await Promise.all([
    getCachedMemberProfiles(crewId),
    supabase.from("crews").select("*").eq("id", crewId).single(),
    supabase
      .from("active_raids")
      .select("*")
      .eq("crew_id", crewId)
      .is("defeated_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle(),
    supabase
      .from("crew_members")
      .select("user_id, last_seen")
      .eq("crew_id", crewId),
  ]);

  const crew    = crewResult.data as Crew | null;
  const raidRow = raidResult.data as ActiveRaid | null;

  // Membership check — use fresh last_seen rows (RLS returns empty for non-members)
  const lastSeenRows = (lastSeenResult.data ?? []) as { user_id: string; last_seen: string | null }[]
  const isMember = lastSeenRows.some((r) => r.user_id === user.id);
  if (!isMember || !crew) redirect("/home");

  // Build profile map from cached data
  const memberProfiles: MemberProfileMap = Object.fromEntries(
    cachedProfiles.filter((r) => r.profile).map((r) => [r.user_id, r.profile!])
  );

  // Build last_seen map from fresh data
  const memberLastSeen: Record<string, string | null> = {};
  for (const row of lastSeenRows) {
    memberLastSeen[row.user_id] = row.last_seen;
  }

  const profiles = cachedProfiles.filter((r) => r.profile).map((r) => r.profile!);

  return (
    <div
      className="flex flex-col bg-[#0a0612]"
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
        members={profiles}
        initialXP={crew.total_xp}
        initialRaid={raidRow ?? null}
        currentUserId={user.id}
        crewId={crewId}
        memberLastSeen={memberLastSeen}
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
        />
      </ErrorBoundary>

      <BottomNav crewId={crewId} />
    </div>
  );
}
