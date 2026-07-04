'use client'

import type { TextEffect } from '@/types'
import { BouncyText } from './BouncyText'
import { ShowUpText } from './ShowUpText'
import { ParticlesText } from './ParticlesText'
import { BlurInText } from './BlurInText'
import { ExplodeText } from './ExplodeText'

// Renders `text` with the given effect applied — used both for a squad
// definition's keyword wherever it's highlighted inline in chat
// (MessageBubble) and to preview each option in the effect picker
// (DefinitionHomePage's TextEffectOptionCard). `null`/unknown effect renders
// plain text.
export function TextEffectText({ text, effect }: { text: string; effect: TextEffect | null }) {
  if (effect === 'bouncy_text') return <BouncyText text={text} />
  if (effect === 'show_up') return <ShowUpText text={text} />
  if (effect === 'particles') return <ParticlesText text={text} />
  if (effect === 'blur_in') return <BlurInText text={text} />
  if (effect === 'explode') return <ExplodeText text={text} />
  return <>{text}</>
}
