import type { ReactNode } from 'react'
import Script from 'next/script'
import { GuestBanner } from '@/shared/components/banners/GuestBanner'
import { InstallPrompt } from '@/shared/components/pwa/InstallPrompt'
import { NotificationPrompt } from '@/shared/components/pwa/NotificationPrompt'
import { PushRefresh } from '@/shared/components/pwa/PushRefresh'
import { SessionRefresher } from '@/shared/components/ui/SessionRefresher'
import { BadgeClear } from '@/shared/components/pwa/BadgeClear'
import { ErrorLogger } from '@/shared/utils/ErrorLogger'
import { LazyPushDebugFAB } from '@/shared/components/pwa/LazyPushDebugFAB'
import { UsernameResetSheet } from '@/shared/components/overlays/UsernameResetSheet'

// Auth protection is handled by middleware — no getUser() call needed here.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0612]">
      {/* Sets/clears nexus_dev_mode from a ?dev=1 / ?dev=0 URL param, running before hydration
          so it's visible to dev-gated components on the same load. Needed because installed
          iOS PWAs use a storage partition separate from Safari — a localStorage write made in
          Safari (e.g. via a bookmarklet) never reaches the standalone app's own storage. */}
      <Script id="dev-flag-bootstrap" strategy="beforeInteractive">
        {`(function(){try{var p=new URLSearchParams(window.location.search);if(p.has('dev')){if(p.get('dev')==='0'){localStorage.removeItem('nexus_dev_mode')}else{localStorage.setItem('nexus_dev_mode','1')}}}catch(e){}})();`}
      </Script>
      <GuestBanner />
      {children}
      <InstallPrompt />
      <NotificationPrompt />
      <PushRefresh />
      <SessionRefresher />
      <BadgeClear />
      <LazyPushDebugFAB />
      <ErrorLogger />
      <UsernameResetSheet />
    </div>
  )
}
