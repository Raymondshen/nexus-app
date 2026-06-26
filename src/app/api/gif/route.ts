import { type NextRequest, NextResponse } from 'next/server'
import { KLIPY_API_BASE_URL, KLIPY_PAGE_SIZE, KLIPY_TRENDING_REVALIDATE_SECONDS } from '@/shared/constants/config'

export const dynamic = 'force-dynamic'

// ── Search endpoint: file has nested sm/md/hd/xs sub-objects ─────────────────
interface KlipySearchItem {
  id:           string
  uuid:         string
  title:        string | null
  blur_preview: string | null
  file: {
    sm?: { gif?: { url: string; width: number; height: number }; jpg?: { url: string } }
    md?: { gif?: { url: string; width: number; height: number }; jpg?: { url: string } }
  }
}

// ── Trending endpoint: file is flat with url/thumbnail_url fields ─────────────
interface KlipyClipItem {
  uuid:         string
  title:        string | null
  blur_preview: string | null
  file: {
    url:                string
    thumbnail_url:      string
    thumbnail_url_webp: string
  }
  file_meta?: {
    gif?:  { width: number; height: number }
    webp?: { width: number; height: number }
  }
}

function parseSearchItem(item: KlipySearchItem) {
  const smGif = item.file?.sm?.gif
  const smJpg = item.file?.sm?.jpg
  const mdJpg = item.file?.md?.jpg
  return {
    id:           item.uuid ?? item.id,
    title:        item.title ?? '',
    blurPreview:  item.blur_preview ?? null,
    thumbnailUrl: smJpg?.url ?? mdJpg?.url ?? smGif?.url ?? '',
    gifUrl:       smGif?.url ?? '',
    width:        smGif?.width  ?? 220,
    height:       smGif?.height ?? 165,
  }
}

function parseClipItem(item: KlipyClipItem) {
  return {
    id:           item.uuid,
    title:        item.title ?? '',
    blurPreview:  item.blur_preview ?? null,
    thumbnailUrl: item.file.thumbnail_url_webp ?? item.file.thumbnail_url ?? '',
    gifUrl:       item.file.thumbnail_url ?? '',
    width:        item.file_meta?.gif?.width  ?? item.file_meta?.webp?.width  ?? 320,
    height:       item.file_meta?.gif?.height ?? item.file_meta?.webp?.height ?? 180,
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const type    = searchParams.get('type') ?? 'trending'
  const q       = searchParams.get('q') ?? ''
  const page    = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const apiKey  = process.env.KLIPY_API_KEY ?? ''
  const locale  = 'en-US'

  const isSearch = type === 'search' && q.trim().length > 0

  let klipyUrl: string
  let fetchOpts: RequestInit

  if (isSearch) {
    klipyUrl  = `${KLIPY_API_BASE_URL}/web/gifs/search?q=${encodeURIComponent(q.trim())}&locale=${locale}&page=${page}&per_page=${KLIPY_PAGE_SIZE}`
    fetchOpts = { cache: 'no-store', headers: { Authorization: `Bearer ${apiKey}` } }
  } else {
    klipyUrl  = `${KLIPY_API_BASE_URL}/web/common-trending?locale=${locale}&page=${page}&per_page=${KLIPY_PAGE_SIZE}`
    fetchOpts = { next: { revalidate: KLIPY_TRENDING_REVALIDATE_SECONDS }, headers: { Authorization: `Bearer ${apiKey}` } } as RequestInit
  }

  try {
    const res = await fetch(klipyUrl, fetchOpts)
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch GIFs' }, { status: 502 })
    }
    const json = await res.json()

    let gifs: ReturnType<typeof parseSearchItem>[]
    let hasNext: boolean

    if (isSearch) {
      const items: KlipySearchItem[] = json?.data?.data ?? []
      gifs    = items.map(parseSearchItem)
      hasNext = json?.data?.has_next ?? false
    } else {
      const items: KlipyClipItem[] = json?.data?.clips ?? []
      gifs    = items.map(parseClipItem)
      hasNext = json?.data?.has_next ?? false
    }

    return NextResponse.json({ gifs, hasNext, page })
  } catch (err) {
    console.error('[gif] unhandled error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
