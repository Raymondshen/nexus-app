'use client'

// Each character animates in on its own staggered delay via CSS keyframes
// defined in globals.css (.text-effect-letter / text-effect-letters-pull-up).
export function LettersPullUpText({ text }: { text: string }) {
  return (
    <span style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
      {Array.from(text).map((ch, i) => (
        <span key={i} className="text-effect-letter" style={{ animationDelay: `${i * 40}ms` }}>
          {ch}
        </span>
      ))}
    </span>
  )
}
