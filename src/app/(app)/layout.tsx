import type { ReactNode } from 'react'
import { GuestBanner } from '@/components/ui/GuestBanner'
import { InstallPrompt } from '@/components/ui/InstallPrompt'
import { NotificationPrompt } from '@/components/ui/NotificationPrompt'
import { PushRefresh } from '@/components/ui/PushRefresh'
import { BadgeClear } from '@/components/ui/BadgeClear'

// Auth protection is handled by middleware — no getUser() call needed here.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0612]">
      <GuestBanner />
      {children}
      <InstallPrompt />
      <NotificationPrompt />
      <PushRefresh />
      <BadgeClear />
    </div>
  )
}
