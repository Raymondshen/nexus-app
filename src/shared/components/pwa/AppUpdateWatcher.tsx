'use client'

import { useEffect, useState } from 'react'
import { isStaleBuildError } from '@/shared/utils/staleBuild'
import { AppUpdatePrompt } from '@/shared/components/pwa/AppUpdatePrompt'

// App-wide safety net for stale-build errors (see staleBuild.ts) that happen OUTSIDE
// any React render tree, so ErrorBoundary never sees them — a plain `import()` (not
// wrapped in React.lazy/Suspense) rejecting is a genuine unhandled promise rejection,
// and a `<script>` tag Next's webpack runtime injects for a chunk can fail to load
// entirely before any component even attempts to render. Mounted once in the root
// layout (not just the `(app)` group) so it also covers /login and onboarding, unlike
// ErrorBoundary which only wraps MessageList/ChatInput today.
//
// Uses addEventListener rather than assigning window.onerror directly, so this
// coexists with ErrorLogger's own onerror-chaining (`(app)/layout.tsx`) instead of
// clobbering it — multiple listeners on the same event are normal DOM behavior.
// Deliberately does nothing for any error that doesn't match isStaleBuildError; this
// is not a general-purpose error UI, just the one specific "a new deploy is live and
// this tab hasn't caught up" case.
export function AppUpdateWatcher() {
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    function handleRejection(e: PromiseRejectionEvent) {
      if (isStaleBuildError(e.reason)) setShowPrompt(true)
    }
    function handleError(e: ErrorEvent) {
      if (isStaleBuildError(e.error)) setShowPrompt(true)
    }
    // capture: true also catches resource-load failures (e.g. a chunk <script> 404),
    // which don't bubble — only fire in the capture phase.
    window.addEventListener('unhandledrejection', handleRejection)
    window.addEventListener('error', handleError, true)
    return () => {
      window.removeEventListener('unhandledrejection', handleRejection)
      window.removeEventListener('error', handleError, true)
    }
  }, [])

  if (!showPrompt) return null
  return <AppUpdatePrompt />
}
