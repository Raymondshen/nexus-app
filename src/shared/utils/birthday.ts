const BIRTHDAY_FORMAT = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Real calendar date, not today/future. Shared by `completeSignupAction`
 * (Setup Profile's Birthday field) and `saveBirthdayAction` (the legacy
 * onboarding/birthday step) — both write the same `profiles.birthday`
 * column and need to agree on what counts as valid. Returns an error
 * message if `value` (a `YYYY-MM-DD` string) is invalid, else null.
 */
export function validateBirthday(value: string): string | null {
  const match = BIRTHDAY_FORMAT.exec(value)
  if (!match) return 'That date doesn\'t exist. Please check your birthday.'

  const year  = parseInt(match[1], 10)
  const month = parseInt(match[2], 10)
  const day   = parseInt(match[3], 10)
  const date  = new Date(year, month - 1, day)

  // Catches Feb 30, Apr 31, etc. — `Date` silently rolls invalid day/month
  // combinations into the next real date instead of throwing.
  if (
    date.getMonth()    !== month - 1 ||
    date.getDate()     !== day       ||
    date.getFullYear() !== year
  ) {
    return 'That date doesn\'t exist. Please check your birthday.'
  }

  // Compare calendar dates only, not date+time — comparing `date` (midnight)
  // straight against `new Date()` (right now) would let a birthday of
  // literally today slip through, since midnight is almost always earlier
  // than "now" and the comparison would read as false.
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  if (date >= startOfToday) {
    return 'Birthday cannot be today or in the future.'
  }

  return null
}

/** Inverse of the parse above — numeric date parts to the `YYYY-MM-DD` string `profiles.birthday` stores. */
export function formatBirthday(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
