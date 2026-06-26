'use client'

import React from 'react'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[Nexus] Component error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center gap-3 p-8">
          <p className="font-pixel text-[9px] text-[#ff4444] text-center leading-relaxed">
            Something broke.<br />Refresh to continue.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="font-pixel text-[8px] text-[#bf5fff] border border-[#bf5fff]/40 px-4 py-2"
          >
            RELOAD
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
