import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { BottomNav } from "@/components/ui/BottomNav";
import { WelcomeDetector } from "@/components/ui/WelcomeDetector";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import type {
  MessageWithProfile,
  Profile,
  CrewMember,
  Message,
  Crew,
  ActiveRaid,
} from "@/types";

interface ChatPageProps {
  params:       Promise<{ crewId: string }>;
  searchParams: Promise<{ welcome?: string }>;
}

export default async function ChatPage({ params, searchParams }: ChatPageProps) {
  const supabase = await createClient();

  // Stage 1 — auth + route params in parallel
  const [{ data: { user } }, { crewId }, { welcome }] = await Promise.all([
    supabase.auth.getUser(),
    params,
    searchParams,
  ]);
  if (!user) redirect("/login");

  // Stage 2 — all crew data in parallel (RLS enforces access)
  // Combining both crew_members queries into one to halve the round-trips.
  const [allMembersResult, crewResult, messagesResult, raidResult] = await Promise.all([
    supabase.from("crew_members").select("*").eq("crew_id", crewId),
    supabase.from("crews").select("*").eq("id", crewId).single(),
    supabase
      .from("messages")
      .select("*")
      .eq("crew_id", crewId)
      .order("created_at", { ascending: true })
      .limit(50),
    supabase
      .from("active_raids")
      .select("*")
      .eq("crew_id", crewId)
      .is("defeated_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle(),
  ]);

  const memberRows = (allMembersResult.data ?? []) as CrewMember[];
  const crew       = crewResult.data as Crew | null;

  // Membership check — RLS returns empty if not a member
  const isMember = memberRows.some((r) => r.user_id === user.id);
  if (!isMember || !crew) redirect("/home");

  const memberUserIds = memberRows.map((r) => r.user_id);

  // Stage 3 — profiles (depends on member IDs from stage 2)
  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, username, avatar_class")
    .in("id", memberUserIds);

  const profiles = (profileRows ?? []) as Pick<Profile, "id" | "username" | "avatar_class">[];

  const memberProfiles: Record<string, Pick<Profile, "id" | "username" | "avatar_class">> =
    Object.fromEntries(profiles.map((p) => [p.id, p]));

  const memberLastSeen: Record<string, string | null> = {};
  for (const row of memberRows) {
    memberLastSeen[row.user_id] = row.last_seen as string | null;
  }

  const messageRows = (messagesResult.data ?? []) as Message[];
  const initialMessages: MessageWithProfile[] = messageRows.map((m) => ({
    ...m,
    profile: memberProfiles[m.user_id] ?? { id: m.user_id, username: "???", avatar_class: null },
  }));

  const raidRow = raidResult.data as ActiveRaid | null;

  return (
    <div
      className="flex flex-col bg-[#0a0612]"
      style={{ height: '100dvh', maxWidth: 480, margin: '0 auto', overflow: 'hidden' }}
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
          initialMessages={initialMessages}
          memberProfiles={memberProfiles}
          initialRaid={raidRow ?? null}
        />
      </ErrorBoundary>

      <ErrorBoundary>
        <ChatInput
          crewId={crewId}
          userId={user.id}
          userProfile={
            memberProfiles[user.id] ?? { id: user.id, username: "???", avatar_class: null }
          }
        />
      </ErrorBoundary>

      <BottomNav crewId={crewId} />
    </div>
  );
}
