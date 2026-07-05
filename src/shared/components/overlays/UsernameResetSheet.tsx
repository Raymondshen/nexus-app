'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence } from 'framer-motion'
import { createClient } from '@/shared/supabase/client'
import { validateUsernameFormat } from '@/shared/utils/username'
import { BottomSheet } from '@/shared/components/ui/BottomSheet'
import { InputField } from '@/shared/components/ui/InputField'
import { setUsernameAfterResetAction } from '@/app/(app)/profile/actions'

// Figma 419:1891 — mandatory one-time bottom sheet for accounts whose username
// predates the [A-Za-z0-9_]-only rule (contained spaces, apostrophes, periods, etc).
// Non-dismissible: no backdrop-tap/drag-to-close — the user must set a valid
// username to proceed. See `needs_username_reset` on `profiles`.
export function UsernameResetSheet() {
  const router = useRouter()
  const [visible,    setVisible]    = useState(false)
  const [username,   setUsername]   = useState('')
  const [error,      setError]      = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled || !session?.user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, needs_username_reset')
        .eq('id', session.user.id)
        .maybeSingle()

      if (cancelled || !profile?.needs_username_reset) return
      setUsername((profile.username as string | null) ?? '')
      setVisible(true)
    })

    return () => { cancelled = true }
  }, [])

  async function handleSubmit() {
    if (submitting) return
    const formatError = validateUsernameFormat(username)
    if (formatError) { setError(formatError); return }

    setSubmitting(true)
    setError(null)
    try {
      const result = await setUsernameAfterResetAction(username)
      if (result.error === 'taken') { setError('That username is already taken.'); return }
      if (result.error) { setError(result.error); return }
      setVisible(false)
      router.refresh()
    } catch {
      setError('Failed to save. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AnimatePresence>
      {visible && (
        <BottomSheet onClose={() => {}} disableDrag zIndex={95}>
          <div
            className="flex flex-col items-center w-full"
            style={{ gap: 'var(--x5)', paddingLeft: 'var(--md)', paddingRight: 'var(--md)', paddingBottom: 'max(env(safe-area-inset-bottom), var(--x8))' }}
          >
            <div className="flex flex-col items-start w-full" style={{ gap: 'var(--mini)' }}>
              <p className="font-silkscreen text-tertiary leading-none whitespace-nowrap" style={{ fontSize: 'var(--mini)' }}>
                Sorry! We apologize...
              </p>
              <div className="flex flex-col items-start w-full leading-none" style={{ gap: 'var(--x2)' }}>
                <p className="font-body font-bold text-primary w-full" style={{ fontSize: 'var(--md)', fontVariationSettings: '"opsz" 14' }}>
                  Username needs updating.
                </p>
                <p className="font-body font-light text-tertiary w-full" style={{ fontSize: 'var(--xs)', fontVariationSettings: '"opsz" 14' }}>
                  Your previous username used characters we no longer support (spaces, punctuation, etc). Please choose a new one.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-start w-full" style={{ gap: 'var(--x3)' }}>
              <InputField
                label="New username"
                value={username}
                onChange={(v) => { setUsername(v); if (error) setError(null) }}
                placeholder="Enter a new username"
                maxLength={20}
                autoComplete="off"
                autoCapitalize="none"
              />
              {error && (
                <p className="font-body font-normal w-full" style={{ fontSize: 'var(--xxs)', color: 'var(--red)' }}>
                  {error}
                </p>
              )}
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full flex items-center justify-center appearance-none transition-opacity active:opacity-80 disabled:opacity-50"
              style={{ background: 'var(--color-purple)', boxShadow: '4px 4px 0 rgba(168,85,247,0.5)', padding: 'var(--x5) var(--x6)' }}
            >
              <span className="font-silkscreen leading-none text-primary whitespace-nowrap" style={{ fontSize: 'var(--xs)' }}>
                {submitting ? 'Saving...' : 'Set username'}
              </span>
            </button>
          </div>
        </BottomSheet>
      )}
    </AnimatePresence>
  )
}
