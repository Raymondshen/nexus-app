'use client'

import React from 'react'
import { isStaleBuildError } from '@/shared/utils/staleBuild'
import { AppUpdatePrompt } from '@/shared/components/pwa/AppUpdatePrompt'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error:    Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[Nexus] Component error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      // A stale-build error (see staleBuild.ts) always gets the update prompt instead
      // of a generic crash message, even if the caller passed a custom `fallback` —
      // "reload, a new version shipped" is accurate regardless of which component tree
      // caught it, unlike a caller's own fallback which is written for a real bug.
      if (this.state.error && isStaleBuildError(this.state.error)) {
        return <AppUpdatePrompt />
      }
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center gap-3 p-8">
          <p className="font-pixel text-[9px] text-red text-center leading-relaxed">
            Something broke.<br />Refresh to continue.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="font-pixel text-[8px] text-purple border border-purple/40 px-4 py-2"
          >
            RELOAD
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
