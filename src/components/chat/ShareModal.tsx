'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Copy } from 'pixelarticons/react/Copy'
import { Check } from 'pixelarticons/react/Check'
import type { Crew } from '@/types'

interface ShareModalProps {
  crew:    Pick<Crew, 'name' | 'invite_code'>
  onClose: () => void
}

export function ShareModal({ crew, onClose }: ShareModalProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`Come join my squad on Nexus app ${crew.invite_code}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API not available
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="relative w-full max-w-[480px] bg-surface border-t border-border-hover flex flex-col gap-6 items-center p-4"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-2 items-start w-full">
          <p className="font-pixel text-[8px] text-tertiary leading-none whitespace-nowrap">
            SQUAD SH**!
          </p>
          <p
            className="font-body font-bold text-[18px] text-primary leading-none whitespace-nowrap"
            style={{ fontVariationSettings: '"opsz" 14' }}
          >
            Invite Your Squad
          </p>
        </div>

        <div className="flex items-center justify-between bg-[rgba(168,85,247,0.1)] border border-purple p-4 w-full overflow-hidden">
          <p
            className="font-silkscreen text-[24px] text-purple leading-none tracking-[0.2px]"
            style={{ textShadow: '0px 0px 3px var(--color-purple)' }}
          >
            {crew.invite_code}
          </p>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-4 py-3 flex-shrink-0 transition-colors duration-150"
            style={copied
              ? { backgroundColor: '#22c55e', boxShadow: '2px 2px 0px 0px rgba(34,197,94,0.5)' }
              : { backgroundColor: 'var(--color-purple)' }
            }
          >
            {copied ? (
              <>
                <Check style={{ width: 12, height: 12, color: 'white' }} aria-hidden="true" />
                <span className="font-silkscreen text-[11px] text-white leading-none whitespace-nowrap">copied</span>
              </>
            ) : (
              <>
                <Copy style={{ width: 12, height: 12, color: 'white' }} aria-hidden="true" />
                <span className="font-silkscreen text-[11px] text-white leading-none whitespace-nowrap">Copy Code</span>
              </>
            )}
          </button>
        </div>

        <button
          onClick={onClose}
          className="h-12 w-full flex items-center justify-center font-pixel text-[8px] text-tertiary transition-colors active:text-primary"
        >
          CLOSE
        </button>
      </motion.div>
    </motion.div>
  )
}
