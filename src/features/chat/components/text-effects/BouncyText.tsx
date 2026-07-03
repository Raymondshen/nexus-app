"use client";

import { motion } from "framer-motion";

// Each character bounces up and back down on a staggered, infinitely-repeating
// loop. Adapted from a standalone reference component to fit inline usage
// (chat keyword highlights, definition-effect-picker labels) rather than a
// large standalone heading.
export function BouncyText({ text }: { text: string }) {
  return (
    <span style={{ display: "inline-block", whiteSpace: "nowrap" }}>
      {Array.from(text).map((ch, i) => (
        <motion.span
          key={i}
          initial={{ y: 0 }}
          animate={{
            y: [0, -6, 0],
            transition: {
              delay: i * 0.1,
              duration: 0.6,
              repeat: Infinity,
              repeatDelay: 2,
              ease: "easeInOut",
            },
          }}
          className="inline-block"
        >
          {ch}
        </motion.span>
      ))}
    </span>
  );
}
