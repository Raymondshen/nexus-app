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
  const color = disabled ? 'var(--color-tertiary)' : 'var(--color-primary)'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center appearance-none active:opacity-70 disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        background:   'var(--color-surface-elevated)',
        borderRadius: 8,
        padding:      'var(--x5)',
        gap:          8,
        color,
      }}
    >
      {/* Icon inherits color via currentColor — pass icon without a color style. Note
          currentColor only reaches inline/pixelarticons SVGs, not an <img src="…svg">
          referencing an external file with its own baked-in fill — callers using a
          static asset icon (e.g. RoomPinSheet's pin-heart.svg) need to swap the asset
          itself for a tertiary-filled variant when `disabled` is set. */}
      <span
        className="flex-shrink-0 flex items-center justify-center"
        style={{ width: 20, height: 20 }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span
        className="flex-1 font-body font-semibold leading-normal text-left"
        style={{ fontSize: 'var(--sm)', fontVariationSettings: '"opsz" 14', letterSpacing: '0.2px', color }}
      >
        {label}
      </span>
    </button>
  )
}
