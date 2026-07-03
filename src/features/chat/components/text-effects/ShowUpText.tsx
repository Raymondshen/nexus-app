'use client'

import { motion } from 'framer-motion'

// Each character slides up and fades in, then reverses and fades back out,
// repeating on a staggered, infinite loop — same animate/transition shape as
// BouncyText (loops immediately on mount, no scroll-triggered gating) but a
// slide+fade reveal instead of a bounce.
export function ShowUpText({ text }: { text: string }) {
  return (
    <span style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
      {Array.from(text).map((ch, i) => (
        <motion.span
          key={i}
          initial={{ y: 10, opacity: 0 }}
          animate={{
            y: 0,
            opacity: 1,
            transition: {
              delay: i * 0.1,
              duration: 0.4,
              repeat: Infinity,
              repeatType: 'reverse',
              repeatDelay: 2,
              ease: 'easeInOut',
            },
          }}
          className="inline-block"
        >
          {ch === ' ' ? ' ' : ch}
        </motion.span>
      ))}
    </span>
  )
}
