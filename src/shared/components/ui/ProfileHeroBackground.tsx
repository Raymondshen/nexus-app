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
// `objectFit: 'fill'`, not `'cover'` — deliberate. `background_url` is hard-cropped
// to 16:9 at upload time (BackgroundUploadModal's pan/zoom frame), matching
// ManageUserProfile's flat 240px-tall hero almost exactly. This hero is taller
// (280px + safe-area-inset-top, ~339px on a notched phone) — with `cover` that
// mismatch forced a much tighter horizontal crop here than on Manage Profile,
// so the same photo looked far more zoomed in depending which screen you were
// on. `fill` keeps the full width in frame (matching Manage Profile's framing)
// and stretches vertically to cover the extra height instead of cropping the
// sides away — a deliberate mild vertical stretch, not a bug.
export function ProfileHeroBackground({ url }: ProfileHeroBackgroundProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- full-bleed fill; next/image fill would work here too, but this keeps parity with the plain <img> hero markup it replaces
    <img
      src={supabaseImageLoader({ src: url ?? '/img/default_image.png', width: 480, quality: 75 })}
      alt=""
      aria-hidden
      decoding="async"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', pointerEvents: 'none' }}
    />
  )
}
