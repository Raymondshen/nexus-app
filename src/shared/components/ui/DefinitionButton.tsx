'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'

// Figma 402:9772 — two variants:
//   fill   → purple background, primary text (Save Definition)
//   stroke → transparent bg, border + text colour driven by `color` prop

interface DefinitionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant:  'fill' | 'stroke'
  color?:   'purple' | 'tertiary' | 'red'
  icon?:    ReactNode
  loading?: boolean
}

export function DefinitionButton({
  variant,
  color    = 'tertiary',
  icon,
  loading  = false,
  disabled,
  children,
  style,
  ...props
}: DefinitionButtonProps) {
  const isFill   = variant === 'fill'
  const isPurple = color === 'purple'

  const isRed    = color === 'red'

  const textColor = isFill
    ? 'var(--color-primary)'
    : isPurple
    ? 'var(--color-purple)'
    : isRed
    ? 'var(--red)'
    : 'var(--color-tertiary)'

  const borderColor = isPurple
    ? 'var(--color-purple)'
    : isRed
    ? 'var(--red)'
    : 'var(--color-tertiary)'

  return (
    <button
      disabled={disabled || loading}
      className="w-full flex items-center justify-center appearance-none transition-opacity active:opacity-80 disabled:opacity-40 focus-visible:outline-none"
      style={{
        color:        textColor,
        background:   isFill ? 'var(--color-purple)' : 'transparent',
        border:       isFill ? 'none' : `1px solid ${borderColor}`,
        borderRadius: 'var(--x3)',
        padding:      'var(--x5)',
        gap:          '8px',
        ...style,
      }}
      {...props}
    >
      {icon}
      {loading ? (
        <span className="flex items-center gap-1">
          <span className="inline-block w-1 h-1 bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="inline-block w-1 h-1 bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="inline-block w-1 h-1 bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
        </span>
      ) : (
        <span
          className="font-body font-semibold tracking-[0.2px] leading-none"
          style={{ fontSize: 'var(--sm)', fontVariationSettings: '"opsz" 14' }}
        >
          {children}
        </span>
      )}
    </button>
  )
}
