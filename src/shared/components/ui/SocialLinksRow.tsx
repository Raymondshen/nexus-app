interface SocialLinksRowProps {
  instagramUrl?:  string | null
  xUrl?:          string | null
  redditUrl?:     string | null
  linkedinUrl?:   string | null
  customSiteUrl?: string | null
}

// Plain text-link row for a profile's optional social links. No brand icons —
// pixelarticons has no Instagram/X/Reddit/LinkedIn marks, so each link is just
// its platform name, opening in a new tab (same target/rel convention as
// LinkPreviewCard's OG-preview links). Renders nothing if all links are unset.
export function SocialLinksRow({ instagramUrl, xUrl, redditUrl, linkedinUrl, customSiteUrl }: SocialLinksRowProps) {
  const links = [
    { label: 'Instagram',  url: instagramUrl },
    { label: 'X',          url: xUrl },
    { label: 'Reddit',     url: redditUrl },
    { label: 'LinkedIn',   url: linkedinUrl },
    { label: 'Custom Site', url: customSiteUrl },
  ].filter((l): l is { label: string; url: string } => !!l.url)

  if (links.length === 0) return null

  return (
    <div
      className="flex flex-shrink-0 flex-wrap items-center w-full"
      style={{ gap: 'var(--x5)', paddingLeft: 'var(--md)', paddingRight: 'var(--md)', paddingTop: 'var(--x3)', paddingBottom: 'var(--x3)' }}
    >
      {links.map(({ label, url }) => (
        <a
          key={label}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-body font-medium leading-none"
          style={{ fontSize: 'var(--xs)', color: 'var(--color-purple)', fontVariationSettings: '"opsz" 14' }}
        >
          {label}
        </a>
      ))}
    </div>
  )
}
