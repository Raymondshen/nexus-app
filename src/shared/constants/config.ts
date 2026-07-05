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

export const LEVEL_XP_BASE        = 120
export const LEVEL_XP_GROWTH_RATE = 1.0435
export const LEVEL_CAP            = 100

// ─── Vibes (music note) domain allowlist ─────────────────────────────────────
// `m.youtube.com` is included explicitly because it's an exact-match list used
// in a Postgres `.in()` filter (server) as well as a Set lookup normalized via
// `normHost()` (client) — the mobile hostname needs to be listed here so both
// paths recognize it, not just the client's stripped-prefix normalization.
export const MUSIC_DOMAINS = [
  'youtube.com',
  'm.youtube.com',
  'youtu.be',
  'music.youtube.com',
  'music.apple.com',
  'open.spotify.com',
  'spotify.com',
  'soundcloud.com',
]

export const KLIPY_API_BASE_URL                = 'https://api.klipy.com/api/v1'
export const KLIPY_RATING                      = 'g'
export const KLIPY_SEARCH_DEBOUNCE_MS          = 400
export const KLIPY_PAGE_SIZE                   = 20
export const KLIPY_TRENDING_REVALIDATE_SECONDS = 300

// ─── Combat (Phase 2 — dev-gated) ────────────────────────────────────────────

export const COMBAT_ENABLED_CLASSES = ['warrior', 'healer', 'archer', 'rogue', 'mage'] as const

/** Boss attack interval — fixed 2 hours for the entire fight */
export const BOSS_ATTACK_INTERVAL_MS = 2 * 60 * 60 * 1000

/** Flat boss damage multiplier applied every attack */
export const BOSS_DAMAGE_MULT = 1.3

/** Hours before a downed member naturally revives */
export const DOWNED_REGEN_HOURS = 8

/** Coins to buy one additional revive token */
export const REVIVE_TOKEN_COIN_COST = 20

/** Free revive tokens each crew starts with */
export const REVIVE_TOKEN_FREE_COUNT = 5

/** Rogue momentum resets after this many ms of inactivity in a raid */
export const ROGUE_MOMENTUM_DECAY_MS = 60 * 60 * 1000  // 1 hour

/** Warrior guard duration in ms */
export const WARRIOR_GUARD_DURATION_MS = 60 * 1000  // 60 s

/** Archer volley debuff duration in ms */
export const ARCHER_VOLLEY_DURATION_MS = 30 * 1000  // 30 s

/** Tier base stats — HP and DMG for each crew level range */
export const BOSS_TIERS = [
  { name: 'Rookie',     minLevel: 1,  maxLevel: 20,  baseHP: 500,   baseDMG: 10  },
  { name: 'Adventurer', minLevel: 21, maxLevel: 40,  baseHP: 2000,  baseDMG: 25  },
  { name: 'Veteran',    minLevel: 41, maxLevel: 60,  baseHP: 6000,  baseDMG: 50  },
  { name: 'Elite',      minLevel: 61, maxLevel: 80,  baseHP: 15000, baseDMG: 90  },
  { name: 'Mythic',     minLevel: 81, maxLevel: 100, baseHP: 35000, baseDMG: 150 },
] as const

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
