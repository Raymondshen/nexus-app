'use client'

import { motion } from 'framer-motion'

// Whole word blurs in from soft-focus to sharp, then reverses and repeats —
// same infinite-loop shape as ShowUpText (loops immediately on mount, no
// scroll-gating), but animates the full string as one unit rather than per
// character. Animating `filter: blur()` per-character would multiply the
// repaint cost across N elements in a scrolling chat list; a single element
// is far cheaper on iOS Safari, where filter animations run on the main
// thread rather than the compositor. Blur radius kept modest (6px, not the
// 20px in the original reference) to keep that per-frame repaint cheap.
export function BlurInText({ text }: { text: string }) {
  return (
    <motion.span
      initial={{ filter: 'blur(6px)', opacity: 0 }}
      animate={{
        filter: ['blur(6px)', 'blur(0px)'],
        opacity: [0, 1],
        transition: {
          duration: 0.6,
          repeat: Infinity,
          repeatType: 'reverse',
          repeatDelay: 2,
          ease: 'easeOut',
        },
      }}
      className="inline-block"
      style={{ willChange: 'filter, opacity' }}
    >
      {text}
    </motion.span>
  )
}
