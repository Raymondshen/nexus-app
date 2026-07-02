export function ChatMessageStampDivider({ label }: { label: string }) {
  return (
    <div className="relative w-full my-[var(--x2)]">
      {/* Full-width 1px line centered on the label */}
      <div className="absolute inset-x-0 top-1/2 border-t border-[var(--color-border)]" />
      {/* Label with background cutout over the line */}
      <p
        className="relative mx-auto w-fit px-[var(--x3)] font-body font-light leading-none text-center"
        style={{
          fontSize:              'var(--xs)',
          color:                 'var(--color-muted)',
          backgroundColor:       'var(--background)',
          letterSpacing:         0,
          fontVariationSettings: '"opsz" 14',
        }}
      >
        {label}
      </p>
    </div>
  )
}
