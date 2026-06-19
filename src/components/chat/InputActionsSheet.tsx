'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Upload } from 'pixelarticons/react/Upload'
import { Chart } from 'pixelarticons/react/Chart'

interface InputActionsSheetProps {
  showUploadPhoto: boolean
  onUploadPhoto:   () => void
  onCreatePoll:    () => void
  onClose:         () => void
}

export function InputActionsSheet({ showUploadPhoto, onUploadPhoto, onCreatePoll, onClose }: InputActionsSheetProps) {
  return (
    <>
      <motion.div
        className="fixed inset-0 z-[60] bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      />

      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[70] bg-black border-t border-border flex flex-col"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        style={{ paddingTop: 24, paddingBottom: 28, paddingLeft: 16, paddingRight: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col w-full" style={{ gap: 16 }}>
          {showUploadPhoto && (
            <button
              onClick={() => { onUploadPhoto(); onClose() }}
              className="w-full h-12 flex items-center justify-center border border-purple active:opacity-70 transition-opacity"
              style={{ gap: 8 }}
            >
              <Upload style={{ width: 16, height: 16, color: 'var(--color-purple)', flexShrink: 0 }} aria-hidden="true" />
              <div className="flex flex-col items-center justify-center" style={{ paddingBottom: 2 }}>
                <span className="font-silkscreen text-purple leading-none" style={{ fontSize: 12 }}>UPLOAD PHOTO</span>
              </div>
            </button>
          )}
          <button
            onClick={() => { onCreatePoll(); onClose() }}
            className="w-full h-12 flex items-center justify-center border border-secondary active:opacity-70 transition-opacity"
            style={{ gap: 8 }}
          >
            <Chart style={{ width: 16, height: 16, color: 'var(--color-secondary)', flexShrink: 0 }} aria-hidden="true" />
            <div className="flex flex-col items-center justify-center" style={{ paddingBottom: 2 }}>
              <span className="font-silkscreen text-secondary leading-none" style={{ fontSize: 12 }}>CREATE A POLL</span>
            </div>
          </button>
        </div>
      </motion.div>
    </>
  )
}
