'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/shared/components/ui/Button'
import { GhostLaunchSprite } from '@/shared/components/ui/GhostLaunchSprite'
import { ChatFloatingNav } from '@/shared/components/ui/PageFloatButton'

// Figma 774:20383 "chatroom - empty" — shown in place of the full HomeClient
// dashboard when a user has zero crew_members rows at all (no squads AND no
// DMs, see home/page.tsx). In practice this is the screen a brand-new account
// lands on straight out of CreateProfileStep's "Create Account" (see Login
// section of CLAUDE.md) — the only other way to reach it is leaving your last
// squad having never started a DM either.
//
// The floating header reuses ChatFloatingNav (crewId omitted, historyGuard
// disabled — see that component's own doc comment) rather than hand-rolling a
// near-duplicate identity card: this Figma frame's own "chatNavbarTop" export
// carries a small stale username icon and a 6-dot row that ChatFloatingNav's
// current, actively-maintained revision (Figma 659:9545) doesn't have —
// exactly the kind of stale-Figma-export mismatch CLAUDE.md's Gotchas section
// warns about (see the "Minnesota"/"ROGUE" example). The live component is
// the source of truth here, not this one frame's possibly-outdated duplicate.
export function ChatroomEmptyScreen({
  userId,
  username,
  avatarUrl,
  initialGemBalance,
  initialCoins,
}: {
  userId:             string
  username:           string
  avatarUrl:          string | null
  initialGemBalance:  number
  initialCoins:       number
}) {
  const router = useRouter()

  return (
    <div
      className="relative h-screen w-full bg-black overflow-hidden flex flex-col items-center justify-end"
      style={{
        gap:           'var(--x5)',
        paddingLeft:   'var(--x5)',
        paddingRight:  'var(--x5)',
        paddingBottom: 'max(env(safe-area-inset-bottom), var(--x8))',
      }}
    >
      {/* avatarClass omitted — that prop is crew_members.class (per-crew), not
          profiles.avatar_class (see ChatFloatingNav's own doc comment), and
          this screen exists precisely because the user has no crew
          membership yet. Falls back to the real-photo UserAvatar. */}
      <ChatFloatingNav
        currentUserId={userId}
        avatarUrl={avatarUrl}
        username={username}
        initialGemBalance={initialGemBalance}
        initialCoins={initialCoins}
        historyGuard={false}
      />

      <GhostLaunchSprite size={64} />

      <div className="flex flex-col w-full flex-shrink-0" style={{ gap: 'var(--x5)' }}>
        <Button
          type="button"
          variant="filled"
          rounded
          labelFont="body"
          className="w-full"
          onClick={() => router.push('/home/create')}
        >
          Create a Group
        </Button>

        <Button
          type="button"
          variant="outlined"
          color="primary"
          rounded
          labelFont="body"
          className="w-full"
          onClick={() => router.push('/home/join')}
        >
          Join a Group
        </Button>
      </div>
    </div>
  )
}
