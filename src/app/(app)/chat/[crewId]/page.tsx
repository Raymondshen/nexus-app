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
  const { crewId } = await params;
  const { welcome } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verify membership
  const { data: membership } = await supabase
    .from("crew_members")
    .select("id")
    .eq("crew_id", crewId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) redirect("/onboarding");

  // Fetch crew
  const { data: crew } = (await supabase
    .from("crews")
    .select("*")
    .eq("id", crewId)
    .single()) as { data: Crew | null };

  if (!crew) redirect("/onboarding");

  // Fetch all crew members (including last_seen for presence)
  const { data: memberRows } = (await supabase
    .from("crew_members")
    .select("*")
    .eq("crew_id", crewId)) as { data: CrewMember[] | null };

  const memberUserIds = (memberRows ?? []).map((r) => r.user_id);

  // Build last_seen map keyed by user_id
  const memberLastSeen: Record<string, string | null> = {}
  for (const row of memberRows ?? []) {
    memberLastSeen[row.user_id] = row.last_seen as string | null
  }

  const { data: profileRows } = (await supabase
    .from("profiles")
    .select("id, username, avatar_class")
    .in("id", memberUserIds)) as {
    data: Pick<Profile, "id" | "username" | "avatar_class">[] | null;
  };

  const profiles = profileRows ?? [];

  const memberProfiles: Record<
    string,
    Pick<Profile, "id" | "username" | "avatar_class">
  > = Object.fromEntries(profiles.map((p) => [p.id, p]));

  // Fetch last 50 messages
  const { data: messageRows } = (await supabase
    .from("messages")
    .select("*")
    .eq("crew_id", crewId)
    .order("created_at", { ascending: true })
    .limit(50)) as { data: Message[] | null };

  const initialMessages: MessageWithProfile[] = (messageRows ?? []).map(
    (m) => ({
      ...m,
      profile: memberProfiles[m.user_id] ?? {
        id: m.user_id,
        username: "???",
        avatar_class: null,
      },
    }),
  );

  // Fetch active raid
  const { data: raidRow } = (await supabase
    .from("active_raids")
    .select("*")
    .eq("crew_id", crewId)
    .is("defeated_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()) as { data: ActiveRaid | null };

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
          memberProfiles[user.id] ?? {
            id: user.id,
            username: "???",
            avatar_class: null,
          }
        }
        />
      </ErrorBoundary>

      <BottomNav crewId={crewId} />
    </div>
  );
}
