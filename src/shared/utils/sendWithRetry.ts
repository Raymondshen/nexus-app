import { createClient } from '@/shared/supabase/client'
import { useChatStore } from '@/store/chatStore'
import { removeFromOutbox, type OutboxJob } from './outbox'
import type { Message } from '@/types'

const MAX_ATTEMPTS    = 4          // 1 initial try + 3 retries
const RETRY_DELAYS_MS = [1000, 3000, 7000]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Postgres/PostgREST errors (e.g. `not_a_member`) carry a `code` and won't succeed on
// retry — only bare network failures (fetch throwing, timeouts) are worth retrying.
function isRetryable(err: unknown): boolean {
  if (!err) return false
  return !(err as { code?: string }).code
}

// Attempts insert_message with backoff, reflecting progress on the optimistic message's
// sendStatus so the bubble can show "sending…" / "failed — tap to retry". Used for both
// a fresh send and a manual/automatic retry of a previously failed one — same code path
// either way, so retries behave identically to the original attempt.
export async function sendWithRetry(job: OutboxJob, onSuccess: (raw: Message) => void): Promise<void> {
  useChatStore.getState().updateMessage(job.tempId, { sendStatus: 'sending' })

  const supabase = createClient()
  let lastErr: unknown = null

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 7000)
    try {
      const { data: raw, error } = await supabase.rpc('insert_message', {
        p_crew_id:         job.crewId,
        p_content:         job.content,
        p_message_type:    job.messageType,
        p_reply_to_id:     job.replyToId ?? null,
        p_reply_preview:   job.replyPreview ?? null,
        p_reply_username:  job.replyUsername ?? null,
        p_image_url:       job.imageUrl ?? null,
        p_image_blur_hash: job.imageBlurHash ?? null,
      })
      if (error) throw error
      if (!raw) throw new Error('No message returned from server.')

      const store = useChatStore.getState()
      // A Postgres Changes INSERT can beat this response back — if it already landed
      // as a separate entry, drop that duplicate before patching the optimistic one.
      if (store.messages.some((m) => m.id === raw.id)) store.removeMessage(raw.id)
      store.updateMessage(job.tempId, { ...raw, sendStatus: undefined })
      await removeFromOutbox(job.crewId, job.tempId)

      onSuccess(raw as Message)
      return
    } catch (err) {
      lastErr = err
      if (!isRetryable(err)) break
    }
  }

  useChatStore.getState().updateMessage(job.tempId, { sendStatus: 'failed' })
  if (process.env.NODE_ENV !== 'production') console.warn('[sendWithRetry] giving up after retries', lastErr)
}
