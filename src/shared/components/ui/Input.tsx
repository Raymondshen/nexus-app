'use client'

import { type InputHTMLAttributes, forwardRef } from 'react'
import { clsx } from 'clsx'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className, id, name, ...props },
  ref
) {
  const inputId = id ?? name

  return (
    <div className="flex flex-col gap-[6px]">
      {label && (
        <label
          htmlFor={inputId}
          className="font-pixel text-[9px] text-[#bf5fff] tracking-widest uppercase"
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        name={name}
        className={clsx(
          'w-full bg-[#080514] border-2 px-3 py-3',
          'text-white text-sm leading-none font-sans',
          'placeholder:text-[#3a2555]',
          'transition-all duration-150',
          'focus:outline-none',
          error
            ? 'border-[#ff4444] focus:border-[#ff6666]'
            : 'border-[#2a1545] focus:border-[#bf5fff] focus:shadow-[0_0_0_1px_rgba(191,95,255,0.3)]',
          className
        )}
        {...props}
      />
      {error && (
        <p className="font-pixel text-[9px] text-[#ff4444]">{error}</p>
      )}
    </div>
  )
})
