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
export function ProfileHeroBackground({ url }: ProfileHeroBackgroundProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- full-bleed cover fill; next/image fill would work here too, but this keeps parity with the plain <img> hero markup it replaces
    <img
      src={supabaseImageLoader({ src: url ?? '/img/default_image.png', width: 480, quality: 75 })}
      alt=""
      aria-hidden
      decoding="async"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
    />
  )
}
