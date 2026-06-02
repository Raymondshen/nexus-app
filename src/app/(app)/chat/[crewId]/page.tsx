import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  // Stage 2 — crew + members + raid; messages are fetched client-side by
  // MessageList so the header, input, and nav render without blocking on history.
  const [allMembersResult, crewResult, raidResult] = await Promise.all([
    supabase
      .from("crew_members")
      .select("user_id, last_seen, profile:profiles(id, username, avatar_class, avatar_url)")
      .eq("crew_id", crewId),
    supabase.from("crews").select("*").eq("id", crewId).single(),
    supabase
      .from("active_raids")
      .select("*")
      .eq("crew_id", crewId)
      .is("defeated_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle(),
  ]);

  const memberRows = (allMembersResult.data as unknown as MemberRow[]) ?? [];
  const crew       = crewResult.data as Crew | null;

  // Membership check — RLS returns empty if not a member
  const isMember = memberRows.some((r) => r.user_id === user.id);
  if (!isMember || !crew) redirect("/home");

  const memberProfiles: MemberProfileMap = Object.fromEntries(
    memberRows.filter((r) => r.profile).map((r) => [r.user_id, r.profile!])
  );

  const memberLastSeen: Record<string, string | null> = {};
  for (const row of memberRows) {
    memberLastSeen[row.user_id] = row.last_seen;
  }

  const profiles = memberRows.filter((r) => r.profile).map((r) => r.profile!);
  const raidRow  = raidResult.data as ActiveRaid | null;

  return (
    <div
      className="flex flex-col bg-[#0a0612]"
      style={{ height: "100dvh", maxWidth: 480, margin: "0 auto", overflow: "hidden" }}
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
