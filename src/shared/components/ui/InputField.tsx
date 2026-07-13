'use client'

import { forwardRef, useId } from 'react'
import { ChevronDown } from 'pixelarticons/react/ChevronDown'

// ─── shared label / helper text ───────────────────────────────────────────
// Figma 402:9678 — label row (optional required asterisk, --red) and helper
// text row, shared by InputField, TextareaField, and SelectField below.

function FieldLabel({ htmlFor, label, required }: { htmlFor: string; label: string; required?: boolean }) {
  return (
    <label
      htmlFor={htmlFor}
      className="font-body font-medium text-primary leading-none"
      style={{ fontSize: 'var(--sm)', fontVariationSettings: '"opsz" 14' }}
    >
      {label}
      {required && <span style={{ color: 'var(--red)' }}> *</span>}
    </label>
  )
}

function FieldHelperText({ helperText }: { helperText?: string }) {
  if (!helperText) return null
  return (
    <p
      className="font-body font-normal text-tertiary tracking-[0.2px] leading-normal w-full"
      style={{ fontSize: 'var(--xxs)', fontVariationSettings: '"opsz" 14' }}
    >
      {helperText}
    </p>
  )
}

// ─── InputField ───────────────────────────────────────────────────────────────
// Figma 402:9678 — single-line labelled input with optional helper text.
// States: border-border (idle) → border-border-hover (focus-within, active state).

interface InputFieldProps {
  label:           string
  value:           string
  onChange:        (value: string) => void
  placeholder?:    string
  helperText?:     string
  required?:       boolean
  maxLength?:      number
  autoComplete?:   string
  autoCapitalize?: string
  type?:           string
}

export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(function InputField({
  label,
  value,
  onChange,
  placeholder,
  helperText,
  required = false,
  maxLength,
  autoComplete = 'off',
  autoCapitalize,
  type = 'text',
}, ref) {
  const id = useId()

  return (
    <div className="flex flex-col w-full" style={{ gap: 'var(--x3)' }}>
      <FieldLabel htmlFor={id} label={label} required={required} />
      <div
        className="w-full border border-border h-[50px] flex items-center overflow-hidden transition-colors focus-within:border-border-hover"
        style={{ paddingLeft: 'var(--x5)', paddingRight: 'var(--x5)' }}
      >
        <input
          ref={ref}
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete={autoComplete}
          autoCapitalize={autoCapitalize}
          required={required}
          className="w-full h-full bg-transparent font-body font-normal text-primary placeholder:text-muted focus:outline-none"
          style={{ fontSize: 'var(--sm)', fontVariationSettings: '"opsz" 14' }}
        />
      </div>
      <FieldHelperText helperText={helperText} />
    </div>
  )
})

// ─── TextareaField ────────────────────────────────────────────────────────────
// Same design system as InputField but multiline. Shares label / helper / border
// token rules; height grows with content via the rows prop.

interface TextareaFieldProps {
  label:        string
  value:        string
  onChange:     (value: string) => void
  placeholder?: string
  helperText?:  string
  required?:    boolean
  maxLength?:   number
  rows?:        number
}

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  helperText,
  required = false,
  maxLength,
  rows = 5,
}, ref) {
  const id = useId()

  return (
    <div className="flex flex-col w-full" style={{ gap: 'var(--x3)' }}>
      <FieldLabel htmlFor={id} label={label} required={required} />
      <div
        className="w-full border border-border transition-colors focus-within:border-border-hover"
        style={{ padding: 'var(--x5)' }}
      >
        <textarea
          ref={ref}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={rows}
          required={required}
          className="w-full bg-transparent font-body font-normal text-primary placeholder:text-muted focus:outline-none resize-none"
          style={{ fontSize: 'var(--sm)', fontVariationSettings: '"opsz" 14' }}
        />
      </div>
      <FieldHelperText helperText={helperText} />
    </div>
  )
})

// ─── SelectField ──────────────────────────────────────────────────────────────
// Figma 402:9678 "dropdown" type variant — same label/border/helper-text shell
// as InputField, but a non-editable trigger with a trailing ChevronDown instead
// of a text caret. Figma's dev-mode node only specifies the closed-trigger look
// (always border-border-hover — there's no dim "default" dropdown instance in
// the file, unlike the standard input's idle state) — no popover/options list
// is part of this design, so this component is purely the trigger; the caller
// owns what opens on click (a BottomSheet, a native picker, etc).

interface SelectFieldProps {
  label:        string
  value?:       string
  placeholder?: string
  onClick:      () => void
  helperText?:  string
  required?:    boolean
  disabled?:    boolean
}

export function SelectField({
  label,
  value,
  placeholder,
  onClick,
  helperText,
  required = false,
  disabled = false,
}: SelectFieldProps) {
  const id = useId()

  return (
    <div className="flex flex-col w-full" style={{ gap: 'var(--x3)' }}>
      <FieldLabel htmlFor={id} label={label} required={required} />
      <button
        id={id}
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="w-full border border-border-hover h-[50px] flex items-center justify-between overflow-hidden transition-opacity appearance-none disabled:opacity-40"
        style={{ paddingLeft: 'var(--x5)', paddingRight: 'var(--x5)', gap: 'var(--x5)' }}
      >
        <span
          className={`flex-1 min-w-0 text-left truncate font-body font-normal ${value ? 'text-primary' : 'text-muted'}`}
          style={{ fontSize: 'var(--sm)', fontVariationSettings: '"opsz" 14' }}
        >
          {value || placeholder}
        </span>
        <ChevronDown style={{ width: 24, height: 24, color: 'var(--color-primary)', flexShrink: 0 }} />
      </button>
      <FieldHelperText helperText={helperText} />
    </div>
  )
}
