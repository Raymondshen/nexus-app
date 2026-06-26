'use client'

import { useState, useActionState } from 'react'
import { Button } from '@/shared/components/ui/Button'
import { saveBirthdayAction } from '@/app/(app)/onboarding/birthday/actions'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: CURRENT_YEAR - 1899 }, (_, i) => CURRENT_YEAR - 1 - i)

function SelectField({
  label,
  name,
  value,
  onChange,
  children,
}: {
  label: string
  name: string
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="font-pixel text-[8px] text-[#6b4f8f] block mb-2">{label}</label>
      <div className="relative">
        <select
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          className="w-full bg-[#0f0820] border-2 border-[#2a1545] text-white px-3 py-3 text-sm focus:border-[#bf5fff] focus:outline-none pr-8 cursor-pointer"
          style={{ appearance: 'none' }}
        >
          {children}
        </select>
        <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#6b4f8f] text-xs">
          ▼
        </span>
      </div>
    </div>
  )
}

export default function BirthdayClient({
  crewId,
  welcome,
  invite,
}: {
  crewId: string | null
  welcome: boolean
  invite: string | null
}) {
  const [month, setMonth] = useState('')
  const [day,   setDay]   = useState('')
  const [year,  setYear]  = useState('')
  const [state, action, isPending] = useActionState(saveBirthdayAction, null)

  const daysInMonth =
    month && year
      ? new Date(parseInt(year), parseInt(month), 0).getDate()
      : 31

  function handleMonthChange(v: string) {
    setMonth(v)
    // Reset day if it would be out of range for the new month
    if (day && year) {
      const max = new Date(parseInt(year), parseInt(v), 0).getDate()
      if (parseInt(day) > max) setDay('')
    }
  }

  function handleYearChange(v: string) {
    setYear(v)
    if (day && month) {
      const max = new Date(parseInt(v), parseInt(month), 0).getDate()
      if (parseInt(day) > max) setDay('')
    }
  }

  const isComplete = Boolean(month && day && year)

  return (
    <div className="min-h-screen bg-[#0a0612] flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(0,0,0,0.10) 2px, rgba(0,0,0,0.10) 4px)',
        }}
      />

      <div className="relative z-10 w-full max-w-[390px]">
        <div className="text-center mb-8">
          <h1
            className="font-pixel text-3xl text-[#bf5fff] tracking-wider mb-3"
            style={{ textShadow: '0 0 30px rgba(191,95,255,0.9), 0 0 60px rgba(191,95,255,0.4)' }}
          >
            NEXUS
          </h1>
          <h2 className="font-pixel text-[11px] text-white mb-2">DATE OF ORIGIN</h2>
          <p className="font-pixel text-[8px] text-[#6b4f8f]">When were you born, warrior?</p>
        </div>

        {state?.error && (
          <div className="bg-[#ff4444]/10 border border-[#ff4444]/50 px-3 py-2 mb-4">
            <p className="font-pixel text-[9px] text-[#ff4444]">{state.error}</p>
          </div>
        )}

        <form action={action} className="space-y-4">
          <input type="hidden" name="crewId"  value={crewId  ?? ''} />
          <input type="hidden" name="welcome" value={welcome ? '1' : '0'} />
          {invite && <input type="hidden" name="invite" value={invite} />}

          <SelectField label="MONTH" name="month" value={month} onChange={handleMonthChange}>
            <option value="" disabled>Select month</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={String(i + 1)}>{m}</option>
            ))}
          </SelectField>

          <SelectField label="DAY" name="day" value={day} onChange={setDay}>
            <option value="" disabled>Select day</option>
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
              <option key={d} value={String(d)}>{d}</option>
            ))}
          </SelectField>

          <SelectField label="YEAR" name="year" value={year} onChange={handleYearChange}>
            <option value="" disabled>Select year</option>
            {YEARS.map((y) => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </SelectField>

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              loading={isPending}
              disabled={!isComplete}
              className="w-full"
            >
              CONTINUE
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
