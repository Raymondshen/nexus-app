import type { ReactNode } from 'react'
import { GuestBanner } from '@/shared/components/banners/GuestBanner'
import { InstallPrompt } from '@/shared/components/pwa/InstallPrompt'
import { NotificationPrompt } from '@/shared/components/pwa/NotificationPrompt'
import { PushRefresh } from '@/shared/components/pwa/PushRefresh'
import { SessionRefresher } from '@/shared/components/ui/SessionRefresher'
import { BadgeClear } from '@/shared/components/pwa/BadgeClear'
import { ErrorLogger } from '@/shared/utils/ErrorLogger'
import { LazyPushDebugFAB } from '@/shared/components/pwa/LazyPushDebugFAB'

// Auth protection is handled by middleware — no getUser() call needed here.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0612]">
      <GuestBanner />
      {children}
      <InstallPrompt />
      <NotificationPrompt />
      <PushRefresh />
      <SessionRefresher />
      <BadgeClear />
      <LazyPushDebugFAB />
      <ErrorLogger />
    </div>
  )
}
