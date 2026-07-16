const MAX_LEN = 200

/**
 * Normalizes a raw social-link input for storage. Empty → null. A value
 * without an http(s) scheme gets `https://` force-prepended — this is what
 * keeps a `javascript:`-style input inert (it can never survive as its own
 * URL scheme once the prefix is applied), not just a formatting nicety.
 */
export function normalizeSocialUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return withScheme.slice(0, MAX_LEN)
}
