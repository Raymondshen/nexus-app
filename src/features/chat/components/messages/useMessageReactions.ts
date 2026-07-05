'use client'

import { useCallback, useRef, useState } from 'react'
import { useChatStore } from '@/store/chatStore'
import { createClient } from '@/shared/supabase/client'

type ReactResponse = {
  reactions:     Record<string, string[]>
  hype_man_heal: boolean
  heal_amount:   number
  error?:        string
}

interface UseMessageReactionsArgs {
  messageId:      string
  crewId:         string
  currentUserId:  string
  reactions:      Record<string, string[]> | null | undefined
  onHypeManHeal?: (amount: number) => void
}

// Owns optimistic reaction state, the write, and the in-flight guard for one message.
// The in-flight flag is mirrored into chatStore.pendingReactionIds so MessageList's
// realtime/background-fetch merges can tell a genuine local mutation apart from a
// merely-empty snapshot — see chatStore.ts for why that distinction matters.
export function useMessageReactions({
  messageId, crewId, currentUserId, reactions, onHypeManHeal,
}: UseMessageReactionsArgs) {
  const [optimisticReactions, setOptimisticReactions] = useState<Record<string, string[]> | null>(null)

  // Prevents the double-fire (touchend + synthetic click) on iOS from calling
  // handleReaction twice — which would add then immediately remove the reaction.
  const reactionInFlightRef = useRef(false)
  // Always-current reactions value — avoids stale closure in handleReaction without
  // needing `reactions` as a useCallback dep (which would recreate it on every change).
  const reactionsRef = useRef(reactions)
  reactionsRef.current = reactions

  const updateMessage         = useChatStore((s) => s.updateMessage)
  const markReactionPending   = useChatStore((s) => s.markReactionPending)
  const clearReactionPending  = useChatStore((s) => s.clearReactionPending)

  const handleReaction = useCallback(async (emoji: string) => {
    // Prevent double-fire (iOS touchend → synthetic click) from toggling twice.
    if (reactionInFlightRef.current) return
    reactionInFlightRef.current = true
    markReactionPending(messageId)

    const prev      = reactionsRef.current ?? {}
    const users     = prev[emoji] ?? []
    const isActive  = users.includes(currentUserId)
    const wasAdding = !isActive

    const nextUsers = isActive
      ? users.filter((id) => id !== currentUserId)
      : [...users, currentUserId]

    const next = { ...prev }
    if (nextUsers.length === 0) delete next[emoji]
    else next[emoji] = nextUsers

    // Local optimistic override — shields the pill from any Realtime UPDATEs that
    // arrive while the request is in-flight (e.g. award-xp patching xp_awarded on
    // the same message row, which triggers a Postgres Changes UPDATE with stale
    // reactions before react-to-message has written the new value).
    setOptimisticReactions(next)
    updateMessage(messageId, { reactions: next })

    // Use browser client so the user's live session JWT is sent — prevents 401s
    // when the edge function has JWT verification enabled.
    const supabase = createClient()
    const { data, error } = await supabase.functions.invoke<ReactResponse>('react-to-message', {
      body: { message_id: messageId, emoji, user_id: currentUserId, crew_id: crewId },
    })

    reactionInFlightRef.current = false

    if (error) {
      console.error('[react-to-message]', error)
      // Only rollback on a confirmed HTTP rejection (4xx/5xx).
      // Network failures keep the optimistic state; Postgres Changes will sync.
      if (error.name === 'FunctionsHttpError') {
        setOptimisticReactions(null)
        updateMessage(messageId, { reactions: prev })
      } else {
        setOptimisticReactions(null)
      }
      clearReactionPending(messageId)
      return
    }

    if (data?.reactions != null) {
      // Guard: if we were ADDING but the server didn't include our emoji, the RPC
      // saw stale state and toggled us back off. Discard and let Postgres Changes sync.
      if (wasAdding && !(data.reactions[emoji] ?? []).includes(currentUserId)) {
        setOptimisticReactions(null)
        clearReactionPending(messageId)
        return
      }
      updateMessage(messageId, { reactions: data.reactions })
    }
    // Clear optimistic overlay — prop now has the server-reconciled value.
    setOptimisticReactions(null)
    clearReactionPending(messageId)
    if (data?.hype_man_heal && data.heal_amount > 0) {
      onHypeManHeal?.(data.heal_amount)
    }
  }, [messageId, crewId, currentUserId, updateMessage, markReactionPending, clearReactionPending, onHypeManHeal])

  const displayReactions = optimisticReactions ?? ((reactions ?? {}) as Record<string, string[]>)

  return { displayReactions, handleReaction }
}
