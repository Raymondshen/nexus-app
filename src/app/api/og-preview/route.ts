import { NextRequest, NextResponse } from 'next/server'
import { OG_PREVIEW } from '@/shared/constants/config'
import { fetchOGPreview } from '@/shared/utils/og-preview'

export async function GET(req: NextRequest) {
  const rawUrl = new URL(req.url).searchParams.get('url')
  if (!rawUrl) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

  let valid = false
  try {
    const p = new URL(rawUrl)
    valid = p.protocol === 'http:' || p.protocol === 'https:'
  } catch {}
  if (!valid) return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })

  const preview = await fetchOGPreview(rawUrl)
  return NextResponse.json(preview, {
    headers: { 'Cache-Control': `public, max-age=${OG_PREVIEW.OG_CACHE_TTL_SECONDS}` },
  })
}
