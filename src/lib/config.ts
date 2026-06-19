export const config = {
  supabase: {
    url:     process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  },
  app: {
    url:     (() => {
      const raw = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
      // Ensure the URL always has a scheme so downstream code and Supabase never
      // receive a bare hostname (e.g. "example.com" instead of "https://example.com").
      return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    })(),
    name:    'Nexus',
    version: '1.0.0',
  },
  push: {
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null,
    configured:     !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  },
  isDev:  process.env.NODE_ENV === 'development',
  isProd: process.env.NODE_ENV === 'production',
}

export function validateConfig(): void {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ]
  const optional = [
    'NEXT_PUBLIC_SITE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  ]

  for (const name of required) {
    if (!process.env[name]) {
      throw new Error(`[Nexus] Missing required env var: ${name}. Check your environment variables.`)
    }
  }

  for (const name of optional) {
    if (!process.env[name]) {
      console.warn(`[Nexus] Optional env var not set: ${name}`)
    }
  }
}

// Named exports used by client components
export const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const OG_PREVIEW = {
  OG_FETCH_TIMEOUT_MS:      3000,
  OG_IMAGE_MAX_WIDTH:        400,
  OG_DESCRIPTION_MAX_CHARS:  120,
  OG_CACHE_TTL_SECONDS:    86400,
} as const

export const IMAGE_PREVIEW_Z_INDEX   = 9999
export const FRIENDSHIP_TOAST_Z_INDEX = 9001
export const GEM_TOAST_Z_INDEX        = 9000

export const GEM_DAILY_LIMIT = 1
export const GEM_IDB_KEY     = 'nexus_gem_claimed_at'

export const PIN_MAX_PER_CREW          = 5
export const PIN_MAX_DURATION_MINUTES  = 525960  // ~1 year
export const PIN_FEATURE_KEY           = 'nexus_pin_feature'

export const KLIPY_API_BASE_URL                = 'https://api.klipy.com/api/v1'
export const KLIPY_RATING                      = 'g'
export const KLIPY_SEARCH_DEBOUNCE_MS          = 400
export const KLIPY_PAGE_SIZE                   = 20
export const KLIPY_TRENDING_REVALIDATE_SECONDS = 300

export const IMAGE_CONFIG = {
  MAX_UPLOAD_BYTES:          15_728_640, // 15 MB
  MAX_GIF_BYTES:              5_242_880, //  5 MB
  CHAT_IMAGE_MAX_WIDTH_PX:        1200,
  CHAT_IMAGE_QUALITY:             0.80,
  ARTIFACT_IMAGE_MAX_WIDTH_PX:     800,
  ARTIFACT_IMAGE_QUALITY:         0.85,
  AVATAR_IMAGE_MAX_WIDTH_PX:       256,
  AVATAR_IMAGE_QUALITY:           0.70,
  LQIP_SIZE_PX:                     20,
} as const
