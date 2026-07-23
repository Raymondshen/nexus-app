'use client'

import { Button } from '@/shared/components/ui/Button'

// Full-viewport prompt shown in place of a raw error whenever the running tab is
// caught on stale JS from a PREVIOUS deploy (see isStaleBuildError in
// shared/utils/staleBuild.ts) — rendered by ErrorBoundary when the render-tree error
// it caught matches that shape, and by AppUpdateWatcher for the same class of error
// happening outside any component tree (an unhandled chunk-load rejection). This is a
// distinct, expected state ("a new build shipped"), not a crash — SWRegister already
// silently reloads once the new service worker actually takes over
// (`controllerchange`), but that hasn't necessarily happened yet by the time a stale
// chunk request 404s, so this fills the gap with an explicit tap-to-reload instead of
// the generic ErrorBoundary "Something broke" message. Reuses the same ghost sprite
// MessageList's empty state uses (`/sprites/ghost/south-flip.gif`) rather than a new
// asset.
export function AppUpdatePrompt() {
  return (
    <div className="fixed inset-0 z-[999] bg-black flex flex-col items-center justify-center text-center" style={{ gap: 'var(--space-5)', padding: 'var(--md)' }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- small looping gif, next/image adds no value */}
      <img
        src="/sprites/ghost/south-flip.gif"
        alt=""
        width={100}
        height={100}
        style={{ imageRendering: 'pixelated' }}
        aria-hidden="true"
      />
      <div className="flex flex-col items-center" style={{ gap: 'var(--space-2)' }}>
        <p className="font-pixel text-primary leading-relaxed" style={{ fontSize: 10 }}>
          New Update Available
        </p>
        <p className="font-body text-secondary leading-relaxed" style={{ fontSize: 'var(--text-sm)', maxWidth: 280 }}>
          Nexus was just updated. Reload to grab the latest version.
        </p>
      </div>
      <Button onClick={() => window.location.reload()}>
        Reload
      </Button>
    </div>
  )
}
