'use client'

import type { TextEffect } from '@/types'
import { BouncyText } from './BouncyText'
import { ShowUpText } from './ShowUpText'

// Renders `text` with the given effect applied — used both for a squad
// definition's keyword wherever it's highlighted inline in chat
// (MessageBubble) and to preview each option in the effect picker
// (DefinitionHomePage's TextEffectOptionCard). `null`/unknown effect renders
// plain text.
export function TextEffectText({ text, effect }: { text: string; effect: TextEffect | null }) {
  if (effect === 'bouncy_text') return <BouncyText text={text} />
  if (effect === 'show_up') return <ShowUpText text={text} />
  return <>{text}</>
}
