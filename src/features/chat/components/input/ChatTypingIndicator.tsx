'use client'

import { motion } from 'framer-motion'
import { useChatStore } from '@/store/chatStore'

// Figma 507:2519 "loader" — three dots bouncing in sequence, 2s linear loop (per
// get_motion_context on 507:2528/2530/2531). Each dot has its own y-keyframe/timing pair.
const TYPING_LOADER_DOTS: { y: number[]; times: number[] }[] = [
  { y: [0, -2, 0, 0],    times: [0, 0.2035, 0.401, 1] },
  { y: [0, 0, -2, 0, 0], times: [0, 0.2035, 0.401, 0.6015, 1] },
  { y: [0, 0, -2, 0, 0], times: [0, 0.401, 0.6015, 0.7995, 1] },
]

// Split out of ChatInput on purpose — typingUsernames lives in chatStore rather than
// ChatInput local state specifically so a presence sync only re-renders this small leaf,
// not the ~2000-line ChatInput component tree.
export function ChatTypingIndicator() {
  const typingUsers = useChatStore((s) => s.typingUsernames)

  if (typingUsers.length === 0) return null

  const label = typingUsers.length === 1
    ? `${typingUsers[0]} is typing...`
    : typingUsers.length === 2
      ? `${typingUsers[0]} and ${typingUsers[1]} are typing...`
      : 'Several warriors are typing...'

  return (
    <div
      className="flex items-center justify-center w-full"
      style={{
        gap:           'var(--space-3)',
        paddingLeft:   'var(--space-5)',
        paddingRight:  'var(--space-5)',
        paddingTop:    'var(--space-4)',
        paddingBottom: 'var(--space-4)',
      }}
    >
      <span className="flex items-center flex-shrink-0" style={{ gap: 'var(--space-2)' }}>
        {TYPING_LOADER_DOTS.map((dot, i) => (
          <motion.span
            key={i}
            className="inline-block rounded-full flex-shrink-0"
            style={{ width: 4, height: 4, background: 'var(--color-tertiary)' }}
            animate={{ y: dot.y }}
            transition={{ duration: 2, times: dot.times, ease: 'linear', repeat: Infinity }}
          />
        ))}
      </span>
      <p
        className="flex-1 min-w-0 font-body font-light text-tertiary leading-none [word-break:break-word]"
        style={{ fontSize: 'var(--text-xs)', fontVariationSettings: '"opsz" 14' }}
      >
        {label}
      </p>
    </div>
  )
}
