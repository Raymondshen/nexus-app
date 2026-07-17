import { LinkPill, type LinkPillType } from '@/shared/components/ui/LinkPill'
import { extractSocialHandle, extractDisplayHostname, type SocialPlatform } from '@/shared/utils/socialLinks'

interface SocialLinksRowProps {
  instagramUrl?:  string | null
  xUrl?:          string | null
  redditUrl?:     string | null
  linkedinUrl?:   string | null
  customSiteUrl?: string | null
  /**
   * Manage Profile's hero live-previews these pills as the user types, before the
   * links are saved — set false there so the preview pills don't navigate away
   * mid-edit. Display pages (ProfileClient, AccountPageMember) leave this on.
   */
  interactive?:   boolean
}

// Row of LinkPills (Figma 105:533's social-link row) for a profile's optional social
// links — pixelarticons has no Instagram/X/Reddit/LinkedIn brand marks, so the 4
// platform pills use the static badge assets under public/icons/social-*.svg; Custom
// Site uses the pixelarticons Link icon. Renders nothing if every link is unset.
export function SocialLinksRow({ instagramUrl, xUrl, redditUrl, linkedinUrl, customSiteUrl, interactive = true }: SocialLinksRowProps) {
  const entries: Array<{ platform: SocialPlatform; url: string | null | undefined }> = [
    { platform: 'instagram', url: instagramUrl },
    { platform: 'x',         url: xUrl },
    { platform: 'reddit',    url: redditUrl },
    { platform: 'linkedin',  url: linkedinUrl },
  ]

  const pills = entries
    .filter((e): e is { platform: SocialPlatform; url: string } => !!e.url)
    .map((e) => ({
      type:  e.platform as LinkPillType,
      href:  e.url,
      // Falls back to hostname for a legacy link saved before strict-format
      // validation existed — never hides a link the user actually set.
      label: extractSocialHandle(e.platform, e.url) ?? extractDisplayHostname(e.url),
    }))

  if (customSiteUrl) {
    pills.push({ type: 'custom', href: customSiteUrl, label: extractDisplayHostname(customSiteUrl) ?? 'Site' })
  }

  if (pills.length === 0) return null

  return (
    <div className="flex flex-shrink-0 flex-wrap items-center w-full" style={{ gap: 'var(--x3)' }}>
      {pills.map(({ type, href, label }) => (
        <LinkPill key={type} type={type} href={interactive ? href : null} label={label} />
      ))}
    </div>
  )
}
