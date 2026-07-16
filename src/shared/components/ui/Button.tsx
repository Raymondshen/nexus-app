'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { clsx } from 'clsx'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  // 'primary'→filled, 'secondary'→outlined kept for backward compat
  variant?: 'filled' | 'outlined' | 'primary' | 'secondary' | 'danger'
  // Outlined: border + text in that color, no background fill —
  // 'purple' (502:2788), 'red' (502:2789), 'tertiary' (502:2723), 'green'.
  // Filled: only 'red' and 'green' override the default purple background
  // (danger / success states, e.g. the "Reserved" success button).
  color?:   'purple' | 'red' | 'green' | 'tertiary'
  size?:    'lg' | 'md' | 'sm'
  shadow?:  boolean
  icon?:    ReactNode
  loading?: boolean
}

export function Button({
  variant  = 'filled',
  color,
  size     = 'lg',
  shadow   = false,
  icon,
  loading  = false,
  disabled,
  children,
  className,
  style,
  ...props
}: ButtonProps) {
  const isOutlined = variant === 'outlined' || variant === 'secondary'
  const isRed      = variant === 'danger' || color === 'red'
  const isGreen    = !isRed && color === 'green'
  const isTertiary = !isRed && !isGreen && color === 'tertiary'

  return (
    <button
      disabled={disabled || loading}
      style={{
        boxShadow: shadow
          ? isRed
            ? '4px 4px 0px 0px rgba(239,68,68,0.5)'
            : '4px 4px 0px 0px rgba(168,85,247,0.5)'
          : undefined,
        ...style,
      }}
      className={clsx(
        'flex items-center justify-center overflow-hidden transition-opacity',
        'disabled:opacity-40 focus-visible:outline-none',
        // Size
        size === 'lg' && !shadow && ['h-[48px] px-[var(--space-5)]', 'gap-[var(--x2)]'],
        size === 'lg' &&  shadow && ['py-[var(--space-5)] px-[var(--space-6)]', 'gap-[var(--x2)]'],
        size === 'md'            && ['py-[var(--space-4)] px-[var(--space-5)]', 'gap-[var(--x2)]'],
        size === 'sm'            && ['py-[var(--space-3)] px-[var(--space-5)]', 'gap-[var(--x2)]'],
        // Colors — outlined is always transparent (Figma 502:2788 purple / 502:2789 red / 502:2723 tertiary), never filled
        !isOutlined && !isRed && !isGreen && 'bg-purple active:opacity-80',
        !isOutlined &&  isRed             && 'bg-[var(--red)] active:opacity-80',
        !isOutlined &&  isGreen           && 'bg-[var(--green)] active:opacity-80',
         isOutlined &&  isTertiary && 'border border-tertiary active:opacity-70',
         isOutlined &&  isGreen && 'border border-[var(--green)] active:opacity-70',
         isOutlined && !isRed && !isTertiary && !isGreen && 'border border-purple active:opacity-70',
         isOutlined &&  isRed && 'border border-[var(--red)] active:opacity-70',
        className
      )}
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
          className="font-silkscreen leading-none whitespace-nowrap"
          style={{
            fontSize: size === 'lg' ? 'var(--text-xs)' : 'var(--text-xxs)',
            color: isOutlined
              ? isTertiary ? 'var(--color-tertiary)' : isRed ? 'var(--red)' : isGreen ? 'var(--green)' : 'var(--color-purple)'
              : 'var(--color-primary)',
          }}
        >
          {children}
        </span>
      )}
    </button>
  )
}
