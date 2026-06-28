import type { ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { GuestBanner } from '@/shared/components/banners/GuestBanner'
import { InstallPrompt } from '@/shared/components/pwa/InstallPrompt'
import { NotificationPrompt } from '@/shared/components/pwa/NotificationPrompt'
import { PushRefresh } from '@/shared/components/pwa/PushRefresh'
import { SessionRefresher } from '@/shared/components/ui/SessionRefresher'
import { BadgeClear } from '@/shared/components/pwa/BadgeClear'
import { ErrorLogger } from '@/shared/utils/ErrorLogger'

const PushDebugFAB = dynamic(
  () => import('@/shared/components/pwa/PushDebugFAB').then(m => ({ default: m.PushDebugFAB })),
  { ssr: false }
)

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
      <PushDebugFAB />
      <ErrorLogger />
    </div>
  )
}
