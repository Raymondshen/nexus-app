import { useMemo, useState, type ReactNode } from 'react'
import type { MemberProfile } from '@/features/chat/components/input/ChatInput'

interface UseMentionAutocompleteParams {
  members:        MemberProfile[]
  userId:         string
  text:           string
  getActiveField: () => HTMLInputElement | HTMLTextAreaElement | null
  setTextRaw:     (val: string) => void
}

// Owns the @mention autocomplete overlay: detecting an in-progress "@partial" query
// at the caret, the filtered match list, completing a selection into the composer
// text, and highlighting resolved @mentions inline. Extracted out of ChatInput
// (which had grown to ~2,500 lines mixing this with presence/composer/send/squad-
// management concerns); nothing about the underlying behavior changed in the move.
export function useMentionAutocomplete({ members, userId, text, getActiveField, setTextRaw }: UseMentionAutocompleteParams) {
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)

  // Lowercased usernames for the highlight overlay — renderHighlightedInput runs on
  // every keystroke render, so build this Set once per membership change, not per call.
  const memberUsernameSet = useMemo(
    () => new Set(members.map((m) => m.username.toLowerCase())),
    [members]
  )

  function getMentionQuery(val: string, cursorPos: number): string | null {
    const before = val.slice(0, cursorPos)
    const atIdx  = before.lastIndexOf('@')
    if (atIdx === -1) return null
    const query = before.slice(atIdx + 1)
    if (/[\s\n]/.test(query)) return null
    return query
  }

  function completeMention(username: string) {
    const field = getActiveField()
    if (!field) return
    const pos     = field.selectionStart ?? text.length
    const before  = text.slice(0, pos)
    const after   = text.slice(pos)
    const atIdx   = before.lastIndexOf('@')
    if (atIdx === -1) return
    const newText = before.slice(0, atIdx) + '@' + username + ' ' + after
    setTextRaw(newText)
    setMentionQuery(null)
    setMentionIndex(0)
    requestAnimationFrame(() => {
      const f = getActiveField()
      if (f) {
        const cur = atIdx + username.length + 2
        f.focus()
        f.setSelectionRange(cur, cur)
      }
    })
  }

  function renderHighlightedInput(val: string): ReactNode {
    const memberSet = memberUsernameSet
    const regex     = /@(\w+)/g
    const parts: ReactNode[] = []
    let lastIdx = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(val)) !== null) {
      if (memberSet.has(match[1].toLowerCase())) {
        if (match.index > lastIdx) parts.push(val.slice(lastIdx, match.index))
        parts.push(
          <mark key={match.index} style={{ background: 'transparent', color: 'var(--color-purple)' }}>
            @{match[1]}
          </mark>
        )
        lastIdx = match.index + match[0].length
      }
    }
    if (lastIdx < val.length) parts.push(val.slice(lastIdx))
    parts.push('​')
    return parts
  }

  const mentionMatches = mentionQuery !== null
    ? members.filter((m) => m.id !== userId && m.username.toLowerCase().startsWith(mentionQuery.toLowerCase()))
    : []

  return {
    mentionQuery, setMentionQuery,
    mentionIndex, setMentionIndex,
    mentionMatches,
    getMentionQuery,
    completeMention,
    renderHighlightedInput,
  }
}
