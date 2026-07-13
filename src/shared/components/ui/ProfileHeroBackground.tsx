import { supabaseImageLoader } from '@/shared/supabase/imageLoader'

interface ProfileHeroBackgroundProps {
  url: string | null
}

// Shared full-bleed profile hero background (Figma's ~390x280 "hero" band) —
// used by ProfileClient (own profile), AccountPageMember, and
// MemberProfileClient (viewing another member). Was identical inline markup
// in all three call sites, fetching the full-original uploaded photo with no
// resize; now goes through the Supabase render API like every other image in
// the app instead of shipping a multi-MB source for a ~390x280 display area.
//
// `objectFit: 'cover'` — scales to fill the container's full height, scaling
// width proportionally with it, and clips whatever width overflows. This
// hero (280px + safe-area-inset-top, ~339px on a notched phone) is taller
// than ManageUserProfile's flat 240px hero, so `cover` here crops more of
// the photo's width than Manage Profile does — that's expected given the
// different container shapes, not a bug. (`background_url` is hard-cropped
// to 16:9 at upload time via BackgroundUploadModal's pan/zoom frame.)
//
// This was briefly `objectFit: 'fill'` (stretch, no crop) — that was working
// around `supabaseImageLoader` requesting a non-proportional image from
// Supabase's render endpoint (width-only requests don't scale height to
// match, so the "source" this was covering was already the wrong aspect
// ratio). That's fixed at the loader level now (`resize=contain`), so
// `cover` is correct again — don't reintroduce `fill` without re-checking
// the actual bytes `supabaseImageLoader` returns first.
export function ProfileHeroBackground({ url }: ProfileHeroBackgroundProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- full-bleed cover fill; next/image fill would work here too, but this keeps parity with the plain <img> hero markup it replaces
    <img
      // width matches BackgroundUploadModal's max upload canvas (1080x608) — the hero is
      // full-bleed up to SlidePage's 480px maxWidth, so on a 2-3x DPR phone a smaller
      // request forces the browser to upscale an already-compressed source, which read as
      // pixelation. Requesting the source's own max resolution avoids compounding that
      // with a second lossy downscale+upscale round-trip.
      src={supabaseImageLoader({ src: url ?? '/img/default_image.png', width: 1080, quality: 90 })}
      alt=""
      aria-hidden
      decoding="async"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
    />
  )
}
