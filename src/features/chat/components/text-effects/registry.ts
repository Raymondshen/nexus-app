import type { TextEffect } from '@/types'

// Single source of truth for available text effects — consumed by the
// definition effect picker (DefinitionHomePage) and the chat keyword
// renderer (MessageBubble via TextEffectText).
export const TEXT_EFFECTS: { id: TextEffect; label: string }[] = [
  { id: 'letters_pull_up', label: 'Letters Pull Up' },
  { id: 'blur_in',         label: 'Blur in' },
  { id: 'bouncy_text',     label: 'Bouncy Text' },
]
