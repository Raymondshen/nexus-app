'use client'

import { BottomSheet } from '@/shared/components/ui/BottomSheet'
import { InviteCodeCard } from '@/shared/components/ui/InviteCodeCard'

interface InviteFriendsSheetProps {
  inviteCode: string
  onClose:    () => void
}

// Figma 394:9180
export function InviteFriendsSheet({ inviteCode, onClose }: InviteFriendsSheetProps) {
  return (
    <BottomSheet onClose={onClose} zIndex={80}>
      <div
        className="flex flex-col items-center w-full"
        style={{
          gap:           'var(--x5)',
          paddingLeft:   'var(--md)',
          paddingRight:  'var(--md)',
          paddingBottom: 'max(env(safe-area-inset-bottom), var(--x8))',
        }}
      >
        {/* Header */}
        <div className="flex flex-col w-full" style={{ gap: 'var(--x2)' }}>
          <p className="font-body font-bold leading-none text-primary" style={{ fontSize: 'var(--md)', fontVariationSettings: '"opsz" 14' }}>
            Invite Friends
          </p>
          <p className="font-body font-light leading-none text-tertiary" style={{ fontSize: 'var(--xs)', fontVariationSettings: '"opsz" 14' }}>
            Use this code to invite friends to your squad.
          </p>
        </div>

        <InviteCodeCard inviteCode={inviteCode} />
      </div>
    </BottomSheet>
  )
}
