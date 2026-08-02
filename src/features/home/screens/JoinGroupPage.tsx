'use client'

import { SlidePage } from '@/app/layouts/SlidePage'
import { JoinGroupStep } from '@/features/auth/screens/JoinGroupStep'

// Authenticated-route wrapper around JoinGroupStep (previously reachable only
// pre-auth, via LoginForm's local step machine) — reused as-is rather than
// duplicated, since it already fully supports an already-signed-in caller:
// checkInviteCodeAction's `alreadySignedIn` flips its CTA straight to
// "Join Group" (joinCrewSessionAction, no Google round trip), see that
// component's own doc comment. `onBack` is omitted so PageHeader falls back
// to this SlidePage's own goBack via context.
//
// Mirrors CreateSquadPage's exact SlidePage styling (fixed inset-0, 480px
// centered column) so the two "no groups yet" entry points (ChatroomEmptyScreen's
// Create a Group / Join a Group buttons) transition identically.
export function JoinGroupPage() {
  return (
    <SlidePage
      className="bg-black flex flex-col"
      style={{ position: 'fixed', inset: 0, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden' }}
    >
      <JoinGroupStep />
    </SlidePage>
  )
}
