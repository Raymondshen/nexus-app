import type { OGPreview } from '@/types'
import { OG_PREVIEW } from '@/shared/constants/config'

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getMeta(html: string, ...names: string[]): string | undefined {
  for (const name of names) {
    const safe = escapeRe(name)
    const re1  = new RegExp(`<meta[^>]+(?:property|name)=["']${safe}["'][^>]+content=["']([^"']+)["']`, 'i')
    const re2  = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${safe}["']`, 'i')
    const m    = re1.exec(html) ?? re2.exec(html)
    if (m?.[1]) return decodeHtmlEntities(m[1].trim())
  }
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&nbsp;/g, ' ')
}

const YOUTUBE_HOSTS = new Set([
  'www.youtube.com', 'youtube.com',
  'music.youtube.com', 'm.youtube.com',
  'youtu.be',
])

function isYouTubeUrl(url: URL): boolean { return YOUTUBE_HOSTS.has(url.hostname) }

function isRedditUrl(url: URL): boolean {
  return url.hostname === 'www.reddit.com'
    || url.hostname === 'reddit.com'
    || url.hostname === 'old.reddit.com'
    || url.hostname === 'np.reddit.com'
    || url.hostname === 'amp.reddit.com'
    || url.hostname === 'm.reddit.com'
    || url.hostname === 'redd.it'
}

function isInstagramUrl(url: URL): boolean {
  return url.hostname === 'www.instagram.com'
    || url.hostname === 'instagram.com'
    || url.hostname === 'instagr.am'
}

function isSpotifyUrl(url: URL): boolean {
  return url.hostname === 'open.spotify.com'
    || url.hostname === 'www.spotify.com'
    || url.hostname === 'spotify.com'
}

function isFacebookUrl(url: URL): boolean {
  return url.hostname === 'www.facebook.com'
    || url.hostname === 'facebook.com'
    || url.hostname === 'm.facebook.com'
    || url.hostname === 'web.facebook.com'
    || url.hostname === 'fb.watch'
}

function isTikTokUrl(url: URL): boolean {
  return url.hostname === 'www.tiktok.com'
    || url.hostname === 'tiktok.com'
    || url.hostname === 'm.tiktok.com'
    || url.hostname === 'vm.tiktok.com'
    || url.hostname === 'vt.tiktok.com'
}

interface YouTubeOEmbed { title?: string; thumbnail_url?: string }

async function fetchYouTubePreview(rawUrl: string, signal: AbortSignal): Promise<OGPreview | null> {
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`
  const res = await fetch(endpoint, { signal, headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) return null
  const data = (await res.json()) as YouTubeOEmbed
  if (!data.title && !data.thumbnail_url) return null
  return { url: rawUrl, title: data.title, image: data.thumbnail_url, site_name: 'YouTube', fetched_at: new Date().toISOString() }
}

// Reddit gates old.reddit.com behind a forced login wall for non-browser requests
// (redirects to /login?reason=lor2) and serves a JS bot-verification challenge page
// on www.reddit.com to an ordinary desktop UA — but still serves full og tags on
// www.reddit.com to a known feed-crawler UA (Twitterbot/Discordbot; see fetchOGPreview's
// UA selection). Normalizing every reddit host variant (old./np./amp./m.) to
// www.reddit.com is what actually matters here — the UA is what unlocks it.
function toWwwRedditUrl(url: URL): string {
  const r = new URL(url.toString())
  r.hostname = 'www.reddit.com'
  return r.toString()
}

interface TikTokOEmbed { title?: string; author_name?: string; thumbnail_url?: string; provider_name?: string }

async function fetchTikTokPreview(rawUrl: string, signal: AbortSignal): Promise<OGPreview | null> {
  const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(rawUrl)}`
  const res = await fetch(endpoint, { signal, headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) return null
  const data = (await res.json()) as TikTokOEmbed
  if (!data.title && !data.thumbnail_url) return null
  return {
    url:        rawUrl,
    title:      data.title,
    description: data.author_name ? `@${data.author_name}` : undefined,
    image:      data.thumbnail_url,
    site_name:  data.provider_name ?? 'TikTok',
    fetched_at: new Date().toISOString(),
  }
}

export async function fetchOGPreview(rawUrl: string): Promise<OGPreview | null> {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(rawUrl)
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') throw new Error()
  } catch {
    return null
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), OG_PREVIEW.OG_FETCH_TIMEOUT_MS)

  try {
    if (isYouTubeUrl(parsedUrl)) {
      const preview = await fetchYouTubePreview(rawUrl, controller.signal)
      clearTimeout(timer)
      return preview
    }
    if (isTikTokUrl(parsedUrl)) {
      const preview = await fetchTikTokPreview(rawUrl, controller.signal)
      clearTimeout(timer)
      return preview
    }

    const fetchUrl = isRedditUrl(parsedUrl) ? toWwwRedditUrl(parsedUrl) : rawUrl
    // Each of these sites serves a near-empty JS shell (or, for Reddit, a bot-verification
    // challenge / forced login wall) to an ordinary browser UA with no session, and only
    // returns real og tags to a UA it recognizes as a known link-preview crawler:
    // - Instagram/Spotify/Facebook accept Facebook's own crawler UA.
    // - Reddit blocks that specific UA (verified: 429s it) but serves www.reddit.com fine
    //   to Twitterbot/Discordbot-style UAs — old.reddit.com no longer works logged-out at
    //   all (redirects to a login wall) regardless of UA, hence the www.reddit.com rewrite above.
    const userAgent = isRedditUrl(parsedUrl)
      ? 'Twitterbot/1.0'
      : isInstagramUrl(parsedUrl) || isSpotifyUrl(parsedUrl) || isFacebookUrl(parsedUrl)
        ? 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
        : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

    const res = await fetch(fetchUrl, { signal: controller.signal, headers: { 'User-Agent': userAgent, 'Accept': 'text/html' } })
    clearTimeout(timer)

    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('text/html')) return null

    const head = (await res.text()).slice(0, 100_000)

    const ogTitle    = getMeta(head, 'og:title')
    const pageTitle  = /<title[^>]*>([^<]+)<\/title>/i.exec(head)?.[1]
    const ogDesc     = getMeta(head, 'og:description')
    const metaDesc   = getMeta(head, 'description')
    const ogSiteName = getMeta(head, 'og:site_name')
    const linkImageM =
      /rel=["']image_src["'][^>]+href=["']([^"']+)["']/i.exec(head) ??
      /href=["']([^"']+)["'][^>]+rel=["']image_src["']/i.exec(head)
    const linkImage = linkImageM?.[1] ? decodeHtmlEntities(linkImageM[1].trim()) : undefined

    let ogImage =
      getMeta(head, 'og:image', 'og:image:secure_url', 'twitter:image:src', 'twitter:image') ??
      linkImage
    if (ogImage) {
      try { ogImage = new URL(ogImage, parsedUrl.origin).toString() } catch {}
    }

    const canonicalM =
      /rel=["']canonical["'][^>]+href=["']([^"']+)["']/i.exec(head) ??
      /href=["']([^"']+)["'][^>]+rel=["']canonical["']/i.exec(head)
    const canonical = canonicalM?.[1] ? decodeHtmlEntities(canonicalM[1].trim()) : undefined

    let description = ogDesc ?? metaDesc
    if (description && description.length > OG_PREVIEW.OG_DESCRIPTION_MAX_CHARS) {
      description = description.slice(0, OG_PREVIEW.OG_DESCRIPTION_MAX_CHARS) + '...'
    }

    let title = ogTitle ?? (pageTitle ? decodeHtmlEntities(pageTitle.trim()) : undefined)

    // Spotify track pages: og:title is just the song name with no artist. Album/playlist
    // og:title already reads fine on its own ("Album — Album by Artist", "Playlist Name"),
    // so only tracks need the artist appended.
    if (title && isSpotifyUrl(parsedUrl) && getMeta(head, 'og:type') === 'music.song') {
      const artist = getMeta(head, 'music:musician_description') ?? ogDesc?.split(' · ')[0]
      if (artist) title = `${title} · ${artist}`
    }

    return {
      url:         canonical ?? rawUrl,
      title,
      description: description ?? undefined,
      image:       ogImage ?? undefined,
      site_name:   ogSiteName ?? undefined,
      fetched_at:  new Date().toISOString(),
    }
  } catch {
    clearTimeout(timer)
    return null
  }
}
