'use client'

import type { TextEffect } from '@/types'
import { LettersPullUpText } from './LettersPullUpText'
import { BlurInText } from './BlurInText'
import { BouncyText } from './BouncyText'

// Renders `text` with the given effect applied — used both for a squad
// definition's keyword wherever it's highlighted inline in chat
// (MessageBubble) and to preview each option in the effect picker
// (DefinitionHomePage's TextEffectOptionCard). `null`/unknown effect renders
// plain text.
export function TextEffectText({ text, effect }: { text: string; effect: TextEffect | null }) {
  if (effect === 'letters_pull_up') return <LettersPullUpText text={text} />
  if (effect === 'blur_in') return <BlurInText text={text} />
  if (effect === 'bouncy_text') return <BouncyText text={text} />
  return <>{text}</>
}
