export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 20

// Letters, digits, underscore only — no spaces, apostrophes, periods, or other
// special characters. Enforced on every path that sets a username (invite
// completion, profile edit, the legacy-username reset gate).
const USERNAME_FORMAT_RE = /^[A-Za-z0-9_]+$/

/** Returns an error message if `value` fails username length/format rules, else null. */
export function validateUsernameFormat(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length < USERNAME_MIN_LENGTH) return `Username must be at least ${USERNAME_MIN_LENGTH} characters.`
  if (trimmed.length > USERNAME_MAX_LENGTH) return `Username must be ${USERNAME_MAX_LENGTH} characters or fewer.`
  if (!USERNAME_FORMAT_RE.test(trimmed)) return 'Only letters, numbers, and underscores are allowed.'
  return null
}
