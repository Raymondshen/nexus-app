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

// ─── Presence ────────────────────────────────────────────────────────────────
/** A member is "online" if their last heartbeat is within this many ms of now. */
export const PRESENCE_ONLINE_THRESHOLD_MS = 45_000

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

// ─── Reaction emoji catalog (JoyPixels Lottie animations) ───────────────────
// Every animated reaction available in the emoji picker (EmojiReactionPickerSheet).
// `emoji` is the standard Unicode character — reactions are stored/toggled by that
// character in messages.reactions, so the animation is a pure rendering enhancement
// and any emoji still degrades gracefully to its glyph. `file` is the Lottie basename
// under public/lottie/reactions/, and is what the picker's search box matches against.
// See LottieReactionIcon (src/shared/components/ui/LottieReactionIcon.tsx).
export interface ReactionEmoji {
  emoji: string
  file:  string
}

export const REACTION_CATALOG: ReactionEmoji[] = [
  { emoji: '✈️',  file: 'airplane' },
  { emoji: '⏰',  file: 'alarm_clock' },
  { emoji: '👽',  file: 'alien' },
  { emoji: '🚗',  file: 'automobile' },
  { emoji: '👇',  file: 'backhand_index_pointing_down' },
  { emoji: '👈',  file: 'backhand_index_pointing_left' },
  { emoji: '👉',  file: 'backhand_index_pointing_right' },
  { emoji: '👆',  file: 'backhand_index_pointing_up' },
  { emoji: '😁',  file: 'beaming_face_with_smiling_eyes' },
  { emoji: '🎂',  file: 'birthday_cake' },
  { emoji: '💣',  file: 'bomb' },
  { emoji: '🍾',  file: 'bottle_with_popping_cork' },
  { emoji: '🎳',  file: 'bowling' },
  { emoji: '💔',  file: 'broken_heart' },
  { emoji: '🦋',  file: 'butterfly' },
  { emoji: '📸',  file: 'camera_with_flash' },
  { emoji: '😹',  file: 'cat_with_tears_of_joy' },
  { emoji: '✅',  file: 'check_mark_button' },
  { emoji: '🎄',  file: 'christmas_tree' },
  { emoji: '🎬',  file: 'clapper_board' },
  { emoji: '👏',  file: 'clapping_hands' },
  { emoji: '🍻',  file: 'clinking_beer_mugs' },
  { emoji: '🥂',  file: 'clinking_glasses' },
  { emoji: '🕐',  file: 'clock' },
  { emoji: '🥶',  file: 'cold_face' },
  { emoji: '💥',  file: 'collision' },
  { emoji: '🎊',  file: 'confetti_ball' },
  { emoji: '🐮',  file: 'cow_face' },
  { emoji: '🤠',  file: 'cowboy_hat_face' },
  { emoji: '🤞',  file: 'crossed_fingers' },
  { emoji: '👑',  file: 'crown' },
  { emoji: '😢',  file: 'crying_face' },
  { emoji: '🏝️',  file: 'desert_island' },
  { emoji: '🎯',  file: 'direct_hit' },
  { emoji: '😵',  file: 'dizzy_face' },
  { emoji: '🐶',  file: 'dog_face' },
  { emoji: '🤤',  file: 'drooling_face' },
  { emoji: '🥁',  file: 'drum' },
  { emoji: '🤯',  file: 'exploding_head' },
  { emoji: '👀',  file: 'eyes' },
  { emoji: '😘',  file: 'face_blowing_a_kiss' },
  { emoji: '😱',  file: 'face_screaming_in_fear' },
  { emoji: '🤮',  file: 'face_vomiting' },
  { emoji: '🤕',  file: 'face_with_head_bandage' },
  { emoji: '🧐',  file: 'face_with_monocle' },
  { emoji: '😮',  file: 'face_with_open_mouth' },
  { emoji: '🙄',  file: 'face_with_rolling_eyes' },
  { emoji: '😤',  file: 'face_with_steam_from_nose' },
  { emoji: '🤬',  file: 'face_with_symbols_on_mouth' },
  { emoji: '😂',  file: 'face_with_tears_of_joy' },
  { emoji: '🤒',  file: 'face_with_thermometer' },
  { emoji: '🧚',  file: 'fairy' },
  { emoji: '🎡',  file: 'ferris_wheel' },
  { emoji: '🔥',  file: 'fire' },
  { emoji: '🚒',  file: 'fire_engine' },
  { emoji: '🎆',  file: 'firework' },
  { emoji: '🐟',  file: 'fish' },
  { emoji: '🎣',  file: 'fishing_pole' },
  { emoji: '⛳',  file: 'flag_in_hole' },
  { emoji: '💪',  file: 'flexed_biceps' },
  { emoji: '😳',  file: 'flushed_face' },
  { emoji: '🛸',  file: 'flying_saucer' },
  { emoji: '🐸',  file: 'frog' },
  { emoji: '☹️',  file: 'frowning_face' },
  { emoji: '👻',  file: 'ghost' },
  { emoji: '🌐',  file: 'globe' },
  { emoji: '😄',  file: 'grinning_face_with_smiling_eyes' },
  { emoji: '😆',  file: 'grinning_squinting_face' },
  { emoji: '💗',  file: 'growing_heart' },
  { emoji: '🍔',  file: 'hamburger' },
  { emoji: '🤝',  file: 'handshake' },
  { emoji: '🙉',  file: 'hear_no_evil_monkey' },
  { emoji: '💘',  file: 'heart_with_arrow' },
  { emoji: '🚁',  file: 'helicopter' },
  { emoji: '🐝',  file: 'honeybee' },
  { emoji: '🐎',  file: 'horse' },
  { emoji: '☕',  file: 'hot_brevage' },
  { emoji: '🥵',  file: 'hot_face' },
  { emoji: '🤗',  file: 'hugging_face' },
  { emoji: '💯',  file: 'hundred_points' },
  { emoji: '🎃',  file: 'jack_o_lantern' },
  { emoji: '🦘',  file: 'kangaroo' },
  { emoji: '💋',  file: 'kiss_mark' },
  { emoji: '💡',  file: 'light_bulb' },
  { emoji: '🚂',  file: 'locomotive' },
  { emoji: '😭',  file: 'loudly_crying_face' },
  { emoji: '🤟',  file: 'love_you_gesture' },
  { emoji: '🤥',  file: 'lying_face' },
  { emoji: '🚴‍♂️', file: 'man_biking' },
  { emoji: '🕺',  file: 'man_dancing' },
  { emoji: '🤦‍♂️', file: 'man_facepalming' },
  { emoji: '🧚‍♂️', file: 'man_fairy' },
  { emoji: '🤹‍♂️', file: 'man_juggling' },
  { emoji: '🙋‍♂️', file: 'man_raising_hands' },
  { emoji: '🏃‍♂️', file: 'man_running' },
  { emoji: '🤷‍♂️', file: 'man_shrugging' },
  { emoji: '💁‍♂️', file: 'man_tipping_hand' },
  { emoji: '🧟‍♂️', file: 'man_zombie' },
  { emoji: '👯‍♂️', file: 'men_with_bunny_ears' },
  { emoji: '🖕',  file: 'middle_finger' },
  { emoji: '🤑',  file: 'money_mouth_face' },
  { emoji: '💸',  file: 'money_with_wings' },
  { emoji: '🎶',  file: 'musical_notes' },
  { emoji: '🤓',  file: 'nerd_face' },
  { emoji: '👊',  file: 'oncoming_fist' },
  { emoji: '🚔',  file: 'oncoming_police_car' },
  { emoji: '🦉',  file: 'owl' },
  { emoji: '🥞',  file: 'pancakes' },
  { emoji: '🎉',  file: 'party_popper' },
  { emoji: '🥳',  file: 'partying_face' },
  { emoji: '☮️',  file: 'peace_symbol' },
  { emoji: '🐧',  file: 'penguin' },
  { emoji: '👯',  file: 'people_with_bunny_ears' },
  { emoji: '🚴',  file: 'person_biking' },
  { emoji: '🤦',  file: 'person_facepalming' },
  { emoji: '🤹',  file: 'person_juggling' },
  { emoji: '🙋',  file: 'person_raising_hand' },
  { emoji: '🏃',  file: 'person_running' },
  { emoji: '🤷',  file: 'person_shrugging' },
  { emoji: '💁',  file: 'person_tipping_hand' },
  { emoji: '🐷',  file: 'pig_face' },
  { emoji: '💩',  file: 'pile_of_poo' },
  { emoji: '🔫',  file: 'pistol' },
  { emoji: '🥺',  file: 'pleading_face' },
  { emoji: '🚨',  file: 'police_car_light' },
  { emoji: '🍿',  file: 'popcorn' },
  { emoji: '😡',  file: 'pouting_face' },
  { emoji: '🚫',  file: 'prohibited' },
  { emoji: '🐰',  file: 'rabbit_face' },
  { emoji: '🏳️‍🌈', file: 'rainbow_flag' },
  { emoji: '🙌',  file: 'raising_hands' },
  { emoji: '😌',  file: 'relieved_face' },
  { emoji: '💞',  file: 'revolving_hearts' },
  { emoji: '💍',  file: 'ring' },
  { emoji: '🤖',  file: 'robot' },
  { emoji: '🚀',  file: 'rocket' },
  { emoji: '🎢',  file: 'roller_coaster' },
  { emoji: '🤣',  file: 'rolling_on_the_floor_laughing' },
  { emoji: '🐓',  file: 'rooster' },
  { emoji: '🥪',  file: 'sandwich' },
  { emoji: '🎅',  file: 'santa_claus' },
  { emoji: '🙈',  file: 'see_no_evil_monkey' },
  { emoji: '🤫',  file: 'shushing_face' },
  { emoji: '😴',  file: 'sleeping_face' },
  { emoji: '🎰',  file: 'slot_machine' },
  { emoji: '🦥',  file: 'sloth' },
  { emoji: '☺️',  file: 'smiling_face' },
  { emoji: '😇',  file: 'smiling_face_with_halo' },
  { emoji: '😍',  file: 'smiling_face_with_heart_eyes' },
  { emoji: '🥰',  file: 'smiling_face_with_hearts' },
  { emoji: '😈',  file: 'smiling_face_with_horns' },
  { emoji: '😎',  file: 'smiling_face_with_sunglasses' },
  { emoji: '😏',  file: 'smirking_face' },
  { emoji: '🐍',  file: 'snake' },
  { emoji: '🤧',  file: 'sneezing_face' },
  { emoji: '⛄',  file: 'snowman' },
  { emoji: '⚽',  file: 'soccer_ball' },
  { emoji: '✨',  file: 'sparkles' },
  { emoji: '💖',  file: 'sparkling_heart' },
  { emoji: '🙊',  file: 'speak_no_evil_monkey' },
  { emoji: '🚙',  file: 'sport_utility_vehicle' },
  { emoji: '🐳',  file: 'spouting_whale' },
  { emoji: '🤩',  file: 'star_struck' },
  { emoji: '☀️',  file: 'sun' },
  { emoji: '🌅',  file: 'sunrise' },
  { emoji: '🧸',  file: 'teddy_bear' },
  { emoji: '🤔',  file: 'thinking_face' },
  { emoji: '💭',  file: 'thought_balloon' },
  { emoji: '👎',  file: 'thumbs_down' },
  { emoji: '👍',  file: 'thumbs_up' },
  { emoji: '🌪️',  file: 'tornado' },
  { emoji: '🏆',  file: 'trophy' },
  { emoji: '☔',  file: 'umbrella_with_rain_drops' },
  { emoji: '😒',  file: 'unamused_face' },
  { emoji: '🦄',  file: 'unicorn' },
  { emoji: '🙃',  file: 'upside_down_face' },
  { emoji: '🎻',  file: 'violin' },
  { emoji: '🌋',  file: 'volcano' },
  { emoji: '⚠️',  file: 'warning' },
  { emoji: '👋',  file: 'waving_hand' },
  { emoji: '😩',  file: 'weary_face' },
  { emoji: '😉',  file: 'winking_face' },
  { emoji: '😜',  file: 'winking_face_with_tongue' },
  { emoji: '🚴‍♀️', file: 'woman_biking' },
  { emoji: '💃',  file: 'woman_dancing' },
  { emoji: '🤦‍♀️', file: 'woman_facepalming' },
  { emoji: '🧚‍♀️', file: 'woman_fairy' },
  { emoji: '🤹‍♀️', file: 'woman_juggling' },
  { emoji: '🙋‍♀️', file: 'woman_raising_hand' },
  { emoji: '🏃‍♀️', file: 'woman_running' },
  { emoji: '🤷‍♀️', file: 'woman_shrugging' },
  { emoji: '💁‍♀️', file: 'woman_tipping_hand' },
  { emoji: '🧟‍♀️', file: 'woman_zombie' },
  { emoji: '👯‍♀️', file: 'women_with_bunny_ears' },
  { emoji: '🥴',  file: 'woozy_face' },
  { emoji: '✍️',  file: 'writing_hand' },
  { emoji: '🥱',  file: 'yawning_face' },
  { emoji: '🤪',  file: 'zany_face' },
  { emoji: '🤐',  file: 'zipper_mouth_face' },
  { emoji: '🧟',  file: 'zombie' },
]

// emoji → Lottie path, derived from the catalog. `MsgReactionPills` and the
// quick-pick rows look up animations here; a missing key falls back to the glyph.
export const REACTION_LOTTIE_MAP: Record<string, string> = Object.fromEntries(
  REACTION_CATALOG.map((r) => [r.emoji, `/lottie/reactions/${r.file}.json`]),
)

// Default quick-pick reaction set (Figma 490:5343 top row — 6 primary reactions).
// Users can customize their own set via EmojiReactionPickerSheet; the choice persists
// in localStorage (nexus_quick_reactions) — see src/shared/utils/quickReactions.ts.
export const DEFAULT_QUICK_REACTIONS = ['👍', '👎', '😭', '🤣', '😤', '🔥'] as const

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
  AVATAR_IMAGE_MAX_WIDTH_PX:       256,
  AVATAR_IMAGE_QUALITY:           0.70,
  LQIP_SIZE_PX:                     20,
} as const
