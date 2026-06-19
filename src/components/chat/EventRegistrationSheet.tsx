'use client'

import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Check } from 'pixelarticons/react/Check'
import { Close } from 'pixelarticons/react/Close'

interface EventRegistrationSheetProps {
  onStayGoing: () => void
  onNotGoing:  () => void
  onClose:     () => void
}

export function EventRegistrationSheet({ onStayGoing, onNotGoing, onClose }: EventRegistrationSheetProps) {
  const content = (
    <motion.div
      className="fixed inset-0 z-[90] flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="relative w-full max-w-[480px] bg-black border-t border-[var(--color-border)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex flex-col items-center"
          style={{
            gap:           24,
            paddingTop:    24,
            paddingLeft:   16,
            paddingRight:  16,
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 28px)',
          }}
        >
          {/* Header */}
          <div className="w-full">
            <p
              className="font-body font-bold w-full"
              style={{
                fontSize:            'var(--text-md)',
                color:               'var(--color-primary)',
                lineHeight:          'normal',
                fontVariationSettings: '"opsz" 14',
              }}
            >
              Change Registration Status
            </p>
          </div>

          {/* Buttons */}
          <div className="flex flex-col w-full" style={{ gap: 16 }}>
            {/* Going Confirmed — solid green */}
            <button
              onClick={onStayGoing}
              className="w-full flex items-center justify-center overflow-hidden"
              style={{
                height:     48,
                gap:        8,
                background: 'var(--color-green)',
                paddingLeft:  16,
                paddingRight: 16,
              }}
            >
              <Check style={{ width: 16, height: 16, color: 'var(--color-primary)' }} aria-hidden="true" />
              <span
                className="font-silkscreen leading-none"
                style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary)' }}
              >
                Going Confirmed
              </span>
            </button>

            {/* Not Going — red border */}
            <button
              onClick={onNotGoing}
              className="w-full flex items-center justify-center overflow-hidden"
              style={{
                height:     48,
                gap:        8,
                border:     '1px solid var(--color-red)',
                paddingLeft:  16,
                paddingRight: 16,
              }}
            >
              <Close style={{ width: 16, height: 16, color: 'var(--color-red)' }} aria-hidden="true" />
              <span
                className="font-silkscreen leading-none"
                style={{ fontSize: 'var(--text-xs)', color: 'var(--color-red)' }}
              >
                Not Going
              </span>
            </button>

            {/* Never mind — purple border */}
            <button
              onClick={onClose}
              className="w-full flex items-center justify-center overflow-hidden"
              style={{
                height:     48,
                border:     '1px solid var(--color-purple)',
                paddingLeft:  16,
                paddingRight: 16,
              }}
            >
              <span
                className="font-silkscreen leading-none"
                style={{ fontSize: 'var(--text-xs)', color: 'var(--color-purple)' }}
              >
                Never mind
              </span>
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )

  return createPortal(content, document.body)
}
