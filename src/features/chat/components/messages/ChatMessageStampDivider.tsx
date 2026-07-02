export function ChatMessageStampDivider({ label }: { label: string }) {
  return (
    <div className="relative flex items-center w-full my-2">
      <div className="flex-1 border-t border-[var(--color-border)]" />
      <span
        className="absolute left-1/2 -translate-x-1/2 px-[var(--x3)] font-body font-light leading-none whitespace-nowrap"
        style={{
          fontSize:             'var(--xs)',
          color:                'var(--color-muted)',
          backgroundColor:      'var(--color-bg-chat)',
          fontVariationSettings: '"opsz" 14',
        }}
      >
        {label}
      </span>
    </div>
  )
}
