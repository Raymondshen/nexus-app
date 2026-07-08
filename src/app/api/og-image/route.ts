import { NextRequest, NextResponse } from 'next/server'
import { OG_PREVIEW } from '@/shared/constants/config'

// Same-origin proxy for OG preview images (LinkPreviewCard). Lets next/image's
// built-in optimizer resize/compress them via <Image src="/api/og-image?url=...">
// instead of shipping the source site's full-resolution image into a 260px
// chat thumbnail — next/image can't optimize arbitrary external hosts directly
// (would require an unbounded remotePatterns allowlist), only same-origin or
// allowlisted sources.
export const dynamic = 'force-dynamic'

// Generous upper bound for what's ultimately displayed as a 260px-wide thumbnail.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

const FETCH_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

export async function GET(req: NextRequest) {
  const rawUrl = new URL(req.url).searchParams.get('url')
  if (!rawUrl) return new NextResponse(null, { status: 400 })

  let parsedUrl: URL
  try {
    parsedUrl = new URL(rawUrl)
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') throw new Error()
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), OG_PREVIEW.OG_FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(parsedUrl.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': FETCH_USER_AGENT },
    })
    clearTimeout(timer)

    if (!res.ok || !res.body) return new NextResponse(null, { status: 502 })

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.startsWith('image/')) return new NextResponse(null, { status: 415 })

    const declaredLength = Number(res.headers.get('content-length') ?? '0')
    if (declaredLength > MAX_IMAGE_BYTES) return new NextResponse(null, { status: 413 })

    // Stream with a hard byte cap in case Content-Length is absent or understated.
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel()
        return new NextResponse(null, { status: 413 })
      }
      chunks.push(value)
    }

    const body = Buffer.concat(chunks.map((c) => Buffer.from(c)))

    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': `public, max-age=${OG_PREVIEW.OG_CACHE_TTL_SECONDS}, immutable`,
      },
    })
  } catch {
    clearTimeout(timer)
    return new NextResponse(null, { status: 502 })
  }
}
