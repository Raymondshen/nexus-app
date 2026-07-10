'use client'

import { useSyncExternalStore } from 'react'
import { DEFAULT_QUICK_REACTIONS, REACTION_LOTTIE_MAP } from '@/shared/constants/config'

// Per-device customization of the quick-pick reaction set shown in ChatSheetReact.
// Persisted in localStorage (not synced across devices — a deliberate scope call);
// edited via EmojiReactionPickerSheet. Reactions themselves are unaffected — this
// only changes which emoji appear in the quick-pick row.

const STORAGE_KEY = 'nexus_quick_reactions'
const CHANGE_EVENT = 'nexus-quick-reactions-change'
const COUNT = DEFAULT_QUICK_REACTIONS.length

// Stable default reference so the server/hydration snapshot never changes identity.
const DEFAULT: string[] = [...DEFAULT_QUICK_REACTIONS]

// Cached client snapshot — useSyncExternalStore requires getSnapshot to return a
// stable reference between changes, so we only rebuild it when notified.
let cache: string[] | null = null

// Coerce arbitrary stored data into a valid, fixed-length set: each slot must be a
// known catalog emoji (present in REACTION_LOTTIE_MAP), else it falls back to the
// default for that position. This drops any emoji retired from the catalog.
function sanitize(value: unknown): string[] {
  const arr = Array.isArray(value) ? value : []
  const out: string[] = []
  for (let i = 0; i < COUNT; i++) {
    const e = arr[i]
    out.push(typeof e === 'string' && REACTION_LOTTIE_MAP[e] ? e : DEFAULT[i])
  }
  return out
}

function read(): string[] {
  if (typeof window === 'undefined') return DEFAULT
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? sanitize(JSON.parse(raw)) : DEFAULT
  } catch {
    return DEFAULT
  }
}

export function getQuickReactions(): string[] {
  if (cache === null) cache = read()
  return cache
}

export function setQuickReactions(list: string[]): void {
  const clean = sanitize(list)
  cache = clean
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean))
  } catch {
    /* private mode / quota — keep the in-memory value */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
}

function subscribe(onStoreChange: () => void): () => void {
  function refresh() {
    cache = read()
    onStoreChange()
  }
  function onStorage(e: StorageEvent) {
    if (e.key === STORAGE_KEY) refresh()
  }
  window.addEventListener(CHANGE_EVENT, refresh)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, refresh)
    window.removeEventListener('storage', onStorage)
  }
}

/** Live quick-pick set; re-renders on save (this tab via CustomEvent, others via `storage`). */
export function useQuickReactions(): string[] {
  return useSyncExternalStore(subscribe, getQuickReactions, () => DEFAULT)
}
