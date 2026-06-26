'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SlidePage, useSlideBack } from '@/app/layouts/SlidePage'
import { ChevronLeft } from 'pixelarticons/react/ChevronLeft'
import { Close } from 'pixelarticons/react/Close'
import { deleteClientErrorAction } from '@/app/actions/errors'
import type { ClientError } from '@/types'

function BackButton() {
  const goBack = useSlideBack()
  return (
    <button
      onClick={goBack}
      aria-label="Back"
      className="flex-shrink-0 flex items-center justify-center"
      style={{ width: 24, height: 40 }}
    >
      <ChevronLeft style={{ width: 24, height: 24, color: 'var(--color-purple)' }} aria-hidden="true" />
    </button>
  )
}

function ErrorDetailSheet({
  error,
  onClose,
}: {
  error: ClientError | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    if (!error) return
    const text = [
      `User: ${error.username ?? '—'} (${error.email ?? '—'})`,
      `URL: ${error.url ?? '—'}`,
      `Time: ${new Date(error.created_at).toLocaleString()}`,
      '',
      error.message,
      '',
      error.stack ?? '',
    ].join('\n').trim()
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <AnimatePresence>
      {error && (
        <>
          <motion.div
            className="fixed inset-0 z-[48] bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[50] max-w-[480px] mx-auto"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            <div
              className="bg-surface border-t flex flex-col"
              style={{
                borderColor: 'rgba(255,215,0,0.3)',
                maxHeight: '80vh',
                paddingBottom: 'max(env(safe-area-inset-bottom), var(--space-5))',
              }}
            >
              {/* Sheet header */}
              <div className="flex items-center justify-between flex-shrink-0" style={{ padding: 'var(--space-5)' }}>
                <div className="flex flex-col gap-[var(--space-1)] min-w-0">
                  <p className="font-body font-semibold text-primary leading-none truncate" style={{ fontSize: 'var(--text-sm)', fontVariationSettings: '"opsz" 14' }}>
                    {error.username ?? '—'}
                  </p>
                  <p className="font-body font-normal leading-none truncate" style={{ fontSize: 'var(--text-xxs)', color: 'var(--color-tertiary)', fontVariationSettings: '"opsz" 14' }}>
                    {error.email ?? '—'} · {new Date(error.created_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="flex-shrink-0 flex items-center justify-center"
                  style={{ width: 32, height: 32 }}
                >
                  <Close style={{ width: 16, height: 16, color: 'var(--color-secondary)' }} aria-hidden="true" />
                </button>
              </div>

              {/* Full error content */}
              <div
                className="flex-1 overflow-y-auto nexus-scroll"
                style={{ paddingLeft: 'var(--space-5)', paddingRight: 'var(--space-5)', paddingBottom: 'var(--space-5)' }}
              >
                <pre
                  className="font-body text-primary whitespace-pre-wrap break-all leading-relaxed"
                  style={{ fontSize: 'var(--text-xxs)', fontVariationSettings: '"opsz" 14' }}
                >
                  {[error.message, error.stack].filter(Boolean).join('\n\n')}
                </pre>
              </div>

              {/* Copy button */}
              <div style={{ padding: 'var(--space-5)', paddingTop: 0 }}>
                <button
                  onClick={handleCopy}
                  className="w-full h-12 border flex items-center justify-center overflow-hidden transition-colors"
                  style={{
                    borderColor: copied ? 'rgba(102,187,106,0.6)' : 'rgba(255,215,0,0.35)',
                    background:  copied ? 'rgba(102,187,106,0.08)' : 'rgba(255,215,0,0.05)',
                  }}
                >
                  <span
                    className="font-pixel leading-none whitespace-nowrap"
                    style={{ fontSize: 'var(--text-mini)', color: copied ? '#66bb6a' : '#ffd700' }}
                  >
                    {copied ? 'COPIED!' : 'COPY ERROR LOG'}
                  </span>
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

interface ErrorLogsClientProps {
  initialErrors: ClientError[]
}

export function ErrorLogsClient({ initialErrors }: ErrorLogsClientProps) {
  const [errors,  setErrors]  = useState<ClientError[]>(initialErrors)
  const [active,  setActive]  = useState<ClientError | null>(null)
  const [deleting, setDeleting] = useState<Set<string>>(new Set())

  const handleDelete = useCallback(async (id: string) => {
    setDeleting((p) => new Set(p).add(id))
    try {
      const result = await deleteClientErrorAction(id)
      if (!result.error) setErrors((prev) => prev.filter((e) => e.id !== id))
    } finally {
      setDeleting((p) => { const s = new Set(p); s.delete(id); return s })
    }
  }, [])

  return (
    <SlidePage className="min-h-screen bg-black flex flex-col">

      {/* Header */}
      <div
        className="bg-black flex-shrink-0"
        style={{
          paddingLeft: 'var(--space-5)',
          paddingRight: 'var(--space-5)',
          paddingBottom: 'var(--space-3)',
          paddingTop: 'max(env(safe-area-inset-top), var(--space-3))',
        }}
      >
        <div className="flex items-center h-10" style={{ gap: 'var(--space-3)' }}>
          <BackButton />
          <span className="font-silkscreen text-[length:var(--text-xxl)] text-primary uppercase leading-none">
            Error Logs
          </span>
          {errors.length > 0 && (
            <span
              className="font-pixel leading-none ml-auto"
              style={{ fontSize: 'var(--text-mini)', color: '#ffd700' }}
            >
              {errors.length}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div
        className="flex-1 overflow-y-auto nexus-scroll flex flex-col"
        style={{
          paddingLeft: 'var(--space-5)',
          paddingRight: 'var(--space-5)',
          paddingTop: 'var(--space-5)',
          paddingBottom: 'max(env(safe-area-inset-bottom), var(--space-5))',
          gap: 'var(--space-4)',
        }}
      >
        {errors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="font-pixel text-[9px] text-primary mb-3">NO ERRORS</p>
            <p className="font-pixel text-[7px] text-muted">No client errors have been recorded.</p>
          </div>
        ) : (
          errors.map((err) => (
            <button
              key={err.id}
              onClick={() => setActive(err)}
              className="w-full text-left flex flex-col overflow-hidden"
              style={{
                background: 'rgba(239,68,68,0.04)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 'var(--space-2)',
                padding: 'var(--space-4)',
                gap: 'var(--space-2)',
              }}
            >
              {/* User row */}
              <div className="flex items-center justify-between gap-[var(--space-3)]">
                <div className="flex items-center gap-[var(--space-2)] min-w-0 flex-1">
                  <span className="font-body font-semibold text-primary leading-none truncate" style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}>
                    {err.username ?? '—'}
                  </span>
                  <span className="font-body font-normal leading-none truncate flex-shrink-0" style={{ fontSize: 'var(--text-xxs)', color: 'var(--color-tertiary)', fontVariationSettings: '"opsz" 14' }}>
                    {err.email ?? '—'}
                  </span>
                </div>
                <div className="flex items-center gap-[var(--space-3)] flex-shrink-0">
                  <span className="font-silkscreen leading-none whitespace-nowrap" style={{ fontSize: 'var(--text-mini)', color: 'var(--color-muted)' }}>
                    {new Date(err.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(err.id) }}
                    disabled={deleting.has(err.id)}
                    className="font-pixel leading-none disabled:opacity-40 transition-opacity hover:opacity-70"
                    style={{ fontSize: 'var(--text-mini)', color: '#ef4444' }}
                  >
                    {deleting.has(err.id) ? '...' : '✕'}
                  </button>
                </div>
              </div>

              {/* Error preview — 3-line clamp */}
              <p
                className="font-body font-normal leading-snug text-secondary overflow-hidden"
                style={{
                  fontSize: 'var(--text-xxs)',
                  fontVariationSettings: '"opsz" 14',
                  display:           '-webkit-box',
                  WebkitLineClamp:   3,
                  WebkitBoxOrient:   'vertical',
                  overflow:          'hidden',
                  wordBreak:         'break-all',
                }}
              >
                {err.message}
                {err.stack ? `\n${err.stack}` : ''}
              </p>
            </button>
          ))
        )}
      </div>

      <ErrorDetailSheet error={active} onClose={() => setActive(null)} />
    </SlidePage>
  )
}
