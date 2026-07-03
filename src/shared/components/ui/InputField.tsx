'use client'

import { useId } from 'react'

// ─── InputField ───────────────────────────────────────────────────────────────
// Figma 402:9678 — single-line labelled input with optional helper text.
// States: border-border (idle) → border-border-hover (focus-within, active state).

interface InputFieldProps {
  label:           string
  value:           string
  onChange:        (value: string) => void
  placeholder?:    string
  helperText?:     string
  maxLength?:      number
  autoComplete?:   string
  autoCapitalize?: string
  type?:           string
}

export function InputField({
  label,
  value,
  onChange,
  placeholder,
  helperText,
  maxLength,
  autoComplete = 'off',
  autoCapitalize,
  type = 'text',
}: InputFieldProps) {
  const id = useId()

  return (
    <div className="flex flex-col w-full" style={{ gap: 'var(--x3)' }}>
      <label
        htmlFor={id}
        className="font-body font-medium text-primary leading-none"
        style={{ fontSize: 'var(--sm)', fontVariationSettings: '"opsz" 14' }}
      >
        {label}
      </label>
      <div
        className="w-full border border-border h-[50px] flex items-center overflow-hidden transition-colors focus-within:border-border-hover"
        style={{ paddingLeft: 'var(--x5)', paddingRight: 'var(--x5)' }}
      >
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete={autoComplete}
          autoCapitalize={autoCapitalize}
          className="w-full h-full bg-transparent font-body font-normal text-primary placeholder:text-muted focus:outline-none"
          style={{ fontSize: 'var(--sm)', fontVariationSettings: '"opsz" 14' }}
        />
      </div>
      {helperText && (
        <p
          className="font-body font-normal text-tertiary tracking-[0.2px] leading-normal w-full"
          style={{ fontSize: 'var(--xxs)', fontVariationSettings: '"opsz" 14' }}
        >
          {helperText}
        </p>
      )}
    </div>
  )
}

// ─── TextareaField ────────────────────────────────────────────────────────────
// Same design system as InputField but multiline. Shares label / helper / border
// token rules; height grows with content via the rows prop.

interface TextareaFieldProps {
  label:        string
  value:        string
  onChange:     (value: string) => void
  placeholder?: string
  helperText?:  string
  maxLength?:   number
  rows?:        number
}

export function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  helperText,
  maxLength,
  rows = 5,
}: TextareaFieldProps) {
  const id = useId()

  return (
    <div className="flex flex-col w-full" style={{ gap: 'var(--x3)' }}>
      <label
        htmlFor={id}
        className="font-body font-medium text-primary leading-none"
        style={{ fontSize: 'var(--sm)', fontVariationSettings: '"opsz" 14' }}
      >
        {label}
      </label>
      <div
        className="w-full border border-border transition-colors focus-within:border-border-hover"
        style={{ padding: 'var(--x5)' }}
      >
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={rows}
          className="w-full bg-transparent font-body font-normal text-primary placeholder:text-muted focus:outline-none resize-none"
          style={{ fontSize: 'var(--sm)', fontVariationSettings: '"opsz" 14' }}
        />
      </div>
      {helperText && (
        <p
          className="font-body font-normal text-tertiary tracking-[0.2px] leading-normal w-full"
          style={{ fontSize: 'var(--xxs)', fontVariationSettings: '"opsz" 14' }}
        >
          {helperText}
        </p>
      )}
    </div>
  )
}
