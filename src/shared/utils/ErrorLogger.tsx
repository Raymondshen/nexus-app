'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/shared/supabase/client'
import { logClientErrorAction } from '@/app/actions/errors'

export function ErrorLogger() {
  const isDevRef   = useRef(false)
  const activeRef  = useRef(false)  // prevent double-init on StrictMode

  useEffect(() => {
    if (activeRef.current) return
    activeRef.current = true

    // Check if this is an anonymous user — skip logging for guests
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session || session.user.is_anonymous) return
      isDevRef.current = true
    })

    function send(message: string, stack?: string) {
      if (!isDevRef.current) return
      const url = typeof window !== 'undefined' ? window.location.href : undefined
      console.log('[ErrorLogger]', message, stack ?? '')
      logClientErrorAction({ message, stack, url }).catch(() => {})
    }

    const origError = window.onerror
    window.onerror = function (event, source, lineno, colno, error) {
      const msg   = error?.message ?? String(event)
      const stack = error?.stack ?? `${source}:${lineno}:${colno}`
      send(msg, stack)
      return origError ? origError.call(this, event, source, lineno, colno, error) : false
    }

    const handleRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason
      const msg    = reason instanceof Error ? reason.message : String(reason)
      const stack  = reason instanceof Error ? reason.stack : undefined
      send(`Unhandled rejection: ${msg}`, stack)
    }
    window.addEventListener('unhandledrejection', handleRejection)

    // Intercept console.error so dev-visible errors get persisted too
    const origConsoleError = console.error.bind(console)
    console.error = (...args: unknown[]) => {
      origConsoleError(...args)
      const msg = args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ')
      const stack = args.find((a) => a instanceof Error)
      send(msg, stack instanceof Error ? stack.stack : undefined)
    }

    return () => {
      window.onerror = origError
      window.removeEventListener('unhandledrejection', handleRejection)
      console.error = origConsoleError
      activeRef.current = false
    }
  }, [])

  return null
}
