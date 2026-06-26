interface CoinIconProps {
  size?: number
}

export function CoinIcon({ size = 16 }: CoinIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      style={{ imageRendering: 'pixelated', display: 'block', flexShrink: 0 }}
      aria-hidden="true"
    >
      {/* Dark outline ring */}
      <rect x="4" y="1" width="8" height="1" fill="#1a1a2e" />
      <rect x="2" y="2" width="2" height="1" fill="#1a1a2e" />
      <rect x="12" y="2" width="2" height="1" fill="#1a1a2e" />
      <rect x="1" y="3" width="1" height="10" fill="#1a1a2e" />
      <rect x="14" y="3" width="1" height="10" fill="#1a1a2e" />
      <rect x="2" y="13" width="2" height="1" fill="#1a1a2e" />
      <rect x="12" y="13" width="2" height="1" fill="#1a1a2e" />
      <rect x="4" y="14" width="8" height="1" fill="#1a1a2e" />

      {/* Shadow (bottom-right) */}
      <rect x="5" y="12" width="7" height="1" fill="#b8860b" />
      <rect x="11" y="5" width="1" height="7" fill="#b8860b" />
      <rect x="10" y="13" width="2" height="1" fill="#b8860b" />

      {/* Main gold fill */}
      <rect x="4" y="2" width="8" height="1" fill="#ffd700" />
      <rect x="2" y="3" width="2" height="1" fill="#ffd700" />
      <rect x="12" y="3" width="2" height="1" fill="#ffd700" />
      <rect x="2" y="4" width="9" height="8" fill="#ffd700" />
      <rect x="11" y="4" width="1" height="8" fill="#ffd700" />
      <rect x="2" y="12" width="8" height="1" fill="#ffd700" />
      <rect x="10" y="12" width="1" height="1" fill="#ffd700" />
      <rect x="2" y="13" width="8" height="1" fill="#ffd700" />

      {/* Highlight (top-left) */}
      <rect x="3" y="3" width="5" height="1" fill="#ffec6e" />
      <rect x="3" y="4" width="1" height="4" fill="#ffec6e" />
      <rect x="4" y="4" width="3" height="1" fill="#ffec6e" />

      {/* $ symbol */}
      <rect x="7" y="5" width="2" height="1" fill="#1a1a2e" />
      <rect x="6" y="6" width="1" height="1" fill="#1a1a2e" />
      <rect x="7" y="7" width="2" height="1" fill="#1a1a2e" />
      <rect x="8" y="8" width="1" height="1" fill="#1a1a2e" />
      <rect x="6" y="9" width="3" height="1" fill="#1a1a2e" />
      <rect x="7" y="4" width="1" height="1" fill="#1a1a2e" />
      <rect x="7" y="10" width="1" height="1" fill="#1a1a2e" />
    </svg>
  )
}
