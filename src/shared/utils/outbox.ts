import { get as idbGet, set as idbSet } from 'idb-keyval'
import type { MessageType } from '@/types'

// A pending send that hasn't been confirmed by the server yet. Carries everything
// insert_message needs to retry, plus the extra fields award-xp wants for XP/mention
// notifications. Persisted to IDB so an app-kill or reload mid-send doesn't lose it —
// ChatInput re-attempts every job found here for the current crew on mount.
export interface OutboxJob {
  tempId:            string
  crewId:            string
  userId:            string
  username:          string
  content:           string
  messageType:       MessageType
  replyToId?:        string | null
  replyPreview?:     string | null
  replyUsername?:    string | null
  imageUrl?:         string | null
  imageBlurHash?:    string | null
  mentionedUserIds:  string[]
  createdAt:         string
}

function outboxKey(crewId: string): string {
  return `nexus-outbox-${crewId}`
}

export async function readOutbox(crewId: string): Promise<OutboxJob[]> {
  return (await idbGet<OutboxJob[]>(outboxKey(crewId)).catch(() => undefined)) ?? []
}

export async function addToOutbox(job: OutboxJob): Promise<void> {
  const jobs = await readOutbox(job.crewId)
  await idbSet(outboxKey(job.crewId), [...jobs.filter((j) => j.tempId !== job.tempId), job]).catch(() => {})
}

export async function removeFromOutbox(crewId: string, tempId: string): Promise<void> {
  const jobs = await readOutbox(crewId)
  await idbSet(outboxKey(crewId), jobs.filter((j) => j.tempId !== tempId)).catch(() => {})
}
