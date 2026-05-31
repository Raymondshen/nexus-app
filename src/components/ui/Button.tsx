'use client'

import type { ButtonHTMLAttributes } from 'react'
import { clsx } from 'clsx'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger'
  loading?: boolean
}

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  children,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={clsx(
        'font-pixel text-[11px] tracking-wider px-4 py-3',
        'transition-all duration-75',
        'active:translate-y-[2px]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bf5fff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0612]',
        variant === 'primary' && [
          'bg-[#bf5fff] text-[#0a0612]',
          'hover:bg-[#d080ff]',
          'shadow-[3px_3px_0px_#7b2fa8] active:shadow-none',
        ],
        variant === 'secondary' && [
          'bg-transparent text-[#bf5fff] border-2 border-[#bf5fff]',
          'hover:bg-[#bf5fff]/10',
          'shadow-[3px_3px_0px_#7b2fa8] active:shadow-none',
        ],
        variant === 'danger' && [
          'bg-[#ff4444] text-white',
          'hover:bg-[#ff6666]',
          'shadow-[3px_3px_0px_#aa1111] active:shadow-none',
        ],
        className
      )}
      {...props}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-1">
          <span
            className="inline-block w-1 h-1 bg-current animate-bounce"
            style={{ animationDelay: '0ms' }}
          />
          <span
            className="inline-block w-1 h-1 bg-current animate-bounce"
            style={{ animationDelay: '150ms' }}
          />
          <span
            className="inline-block w-1 h-1 bg-current animate-bounce"
            style={{ animationDelay: '300ms' }}
          />
        </span>
      ) : (
        children
      )}
    </button>
  )
}
