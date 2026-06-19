import { type NextRequest, NextResponse } from 'next/server'
import { KLIPY_API_BASE_URL, KLIPY_PAGE_SIZE, KLIPY_TRENDING_REVALIDATE_SECONDS } from '@/lib/config'

export const dynamic = 'force-dynamic'

interface KlipyFileVariant {
  url:    string
  width:  number
  height: number
  size?:  number
}

interface KlipyItem {
  id:           string
  title:        string | null
  blur_preview: string | null
  file: {
    sm?: { gif?: KlipyFileVariant }
    md?: { gif?: KlipyFileVariant; jpg?: KlipyFileVariant }
    hd?: { gif?: KlipyFileVariant }
  }
}

function parseItem(item: KlipyItem) {
  const smGif = item.file?.sm?.gif
  const mdJpg = item.file?.md?.jpg
  const mdGif = item.file?.md?.gif
  return {
    id:           item.id,
    title:        item.title ?? '',
    blurPreview:  item.blur_preview ?? null,
    thumbnailUrl: mdJpg?.url ?? smGif?.url ?? '',
    gifUrl:       smGif?.url ?? mdGif?.url ?? '',
    width:        smGif?.width  ?? mdGif?.width  ?? 220,
    height:       smGif?.height ?? mdGif?.height ?? 165,
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const type    = searchParams.get('type') ?? 'trending'
  const q       = searchParams.get('q') ?? ''
  const page    = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const apiKey  = process.env.KLIPY_API_KEY ?? ''
  const locale  = 'en-US'

  let klipyUrl: string
  let fetchOpts: RequestInit

  if (type === 'search' && q.trim()) {
    klipyUrl = `${KLIPY_API_BASE_URL}/web/gifs/search?q=${encodeURIComponent(q.trim())}&locale=${locale}&page=${page}&per_page=${KLIPY_PAGE_SIZE}`
    fetchOpts = { cache: 'no-store', headers: { Authorization: `Bearer ${apiKey}` } }
  } else {
    klipyUrl = `${KLIPY_API_BASE_URL}/web/common-trending?locale=${locale}&page=${page}&per_page=${KLIPY_PAGE_SIZE}`
    fetchOpts = { next: { revalidate: KLIPY_TRENDING_REVALIDATE_SECONDS }, headers: { Authorization: `Bearer ${apiKey}` } } as RequestInit
  }

  try {
    const res = await fetch(klipyUrl, fetchOpts)
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch GIFs' }, { status: 502 })
    }
    const json = await res.json()
    const items: KlipyItem[] = json?.data?.data ?? []
    const hasNext: boolean   = json?.data?.has_next ?? false

    return NextResponse.json({ gifs: items.map(parseItem), hasNext, page })
  } catch (err) {
    console.error('[gif] unhandled error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
