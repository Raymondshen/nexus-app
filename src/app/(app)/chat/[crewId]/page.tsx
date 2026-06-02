import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { MessageList } from "@/components/chat/MessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { BottomNav } from "@/components/ui/BottomNav";
import { WelcomeDetector } from "@/components/ui/WelcomeDetector";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import type { MessageWithProfile, Profile, Message, Crew, ActiveRaid } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type MemberProfile = Pick<Profile, "id" | "username" | "avatar_class" | "avatar_url">
type MemberProfileMap = Record<string, MemberProfile>
type MemberRow = { user_id: string; last_seen: string | null; profile: MemberProfile | null }

// ─── Streamed messages ────────────────────────────────────────────────────────
// Fetched after the header resolves so the UI is unblocked sooner.

async function MessagesStream({
  crewId,
  crewName,
  currentUserId,
  memberProfiles,
  initialRaid,
}: {
  crewId:         string
  crewName:       string
  currentUserId:  string
  memberProfiles: MemberProfileMap
  initialRaid:    ActiveRaid | null
}) {
  // Never throw from here — a server component error inside Suspense cannot be
  // retried from the client (the stream is already done). On any failure, render
  // an empty MessageList; the Realtime subscription delivers live messages anyway.
  let initialMessages: MessageWithProfile[] = []

  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("crew_id", crewId)
      .order("created_at", { ascending: false })
      .limit(50)

    // Reverse so they display oldest→newest in the list
    initialMessages = ((data ?? []) as Message[]).reverse().map((m) => ({
      ...m,
      profile: memberProfiles[m.user_id] ?? {
        id: m.user_id, username: "???", avatar_class: null, avatar_url: null,
      },
    }))
  } catch {
    // Network / auth error — fall through with empty history
  }

  return (
    <MessageList
      crewId={crewId}
      crewName={crewName}
      currentUserId={currentUserId}
      initialMessages={initialMessages}
      memberProfiles={memberProfiles}
      initialRaid={initialRaid}
    />
  )
}

function MessageListSkeleton() {
  return (
    <div className="flex-1 overflow-hidden px-4 pt-4 flex flex-col gap-3">
      {[52, 35, 60, 45, 30, 55, 40].map((w, i) => (
        <div key={i} className={`flex items-end gap-2 ${i % 3 === 0 ? "flex-row-reverse" : ""}`}>
          <div className="w-7 h-7 bg-[#1a1a2e] animate-pulse flex-shrink-0" />
          <div
            className="h-9 bg-[#1a1a2e] animate-pulse"
            style={{ width: `${w}%`, maxWidth: 260, animationDelay: `${i * 60}ms` }}
          />
        </div>
      ))}
    </div>
  )
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

  // Stage 2 — crew + members + raid only; messages are streamed separately so
  // the header, input, and nav render without waiting for message history.
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
        <Suspense fallback={<MessageListSkeleton />}>
          <MessagesStream
            crewId={crewId}
            crewName={crew.name}
            currentUserId={user.id}
            memberProfiles={memberProfiles}
            initialRaid={raidRow ?? null}
          />
        </Suspense>
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
