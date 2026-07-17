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

// ─── Per-platform link format ───────────────────────────────────────────────
// Instagram/X/Reddit/LinkedIn must be that platform's own profile-URL shape —
// unlike Custom Site (which stays a free-form link via normalizeSocialUrl above),
// these four cannot hold an arbitrary URL. Username charset/length per pattern
// mirrors each platform's real handle rules.

export type SocialPlatform = 'instagram' | 'x' | 'reddit' | 'linkedin'

const PLATFORM_PATTERNS: Record<SocialPlatform, RegExp> = {
  instagram: /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{1,30})\/?$/i,
  x:         /^(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?$/i,
  reddit:    /^(?:https?:\/\/)?(?:www\.)?reddit\.com\/u(?:ser)?\/([A-Za-z0-9_-]{3,20})\/?$/i,
  linkedin:  /^(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([A-Za-z0-9-]{3,100})\/?$/i,
}

const PLATFORM_HINTS: Record<SocialPlatform, string> = {
  instagram: 'instagram.com/username',
  x:         'x.com/username',
  reddit:    'reddit.com/u/username',
  linkedin:  'linkedin.com/in/username',
}

/**
 * Rejects anything that isn't that platform's own profile-URL shape. Empty input is
 * valid (the field is optional) — returns null. This is the sole enforcement point;
 * call it before normalizeSocialUrl on every write path (client AND server — the
 * server call is the source of truth, the client call is just earlier feedback).
 */
export function validateSocialLinkFormat(platform: SocialPlatform, raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (!PLATFORM_PATTERNS[platform].test(trimmed)) {
    return `Enter a valid link (${PLATFORM_HINTS[platform]})`
  }
  return null
}

/**
 * Pulls the handle/username segment out of an already-format-valid platform link,
 * for display in a LinkPill's 32px label box. Works on both raw in-progress input
 * and the https://-prefixed value normalizeSocialUrl writes to storage.
 */
export function extractSocialHandle(platform: SocialPlatform, raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.match(PLATFORM_PATTERNS[platform])?.[1] ?? null
}

/**
 * Fallback label for a link a strict platform pattern can't parse — e.g. Custom Site
 * (no pattern at all) or a pre-validation legacy link already saved before this rule
 * existed. Never returns null for a non-empty input, so a set link is never hidden.
 */
export function extractDisplayHostname(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
    return url.hostname.replace(/^www\./i, '')
  } catch {
    return null
  }
}
