'use client'

import { type ReactNode } from 'react'

interface SheetActionButtonProps {
  icon:      ReactNode
  /** String or element — supports dynamic labels like `{copied ? 'Copied!' : 'Copy Text'}` */
  label:     ReactNode
  onClick:   () => void
  disabled?: boolean
}

export function SheetActionButton({ icon, label, onClick, disabled = false }: SheetActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center active:opacity-70 disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        background:   'var(--color-surface-elevated)',
        borderRadius: 8,
        padding:      'var(--x5)',
        gap:          8,
        color:        'var(--color-primary)',
      }}
    >
      {/* Icon inherits color via currentColor — pass icon without a color style */}
      <span
        className="flex-shrink-0 flex items-center justify-center"
        style={{ width: 20, height: 20 }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span
        className="flex-1 font-body font-semibold leading-normal text-left"
        style={{ fontSize: 'var(--sm)', fontVariationSettings: '"opsz" 14', letterSpacing: '0.2px', color: 'var(--color-primary)' }}
      >
        {label}
      </span>
    </button>
  )
}
