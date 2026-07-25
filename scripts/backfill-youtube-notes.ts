// Run: npm run backfill-youtube-notes
//
// One-time (re-runnable/idempotent) backfill for `notes` rows saved before the
// YouTube/YouTube Music creator-name fix (src/shared/utils/og-preview.ts). Those rows
// were saved while fetchYouTubePreview didn't append the channel's author_name, so
// their `og_title` has no " · Artist" suffix. Re-fetches each YouTube-domain note's
// preview with the now-fixed fetchOGPreview and updates the row if anything changed.
//
// Uses the service-role key directly (not src/shared/supabase/server.ts — that
// module imports next/headers at the top level, which throws outside a Next.js
// request context). Mirrors scripts/backfill-spotify-notes.ts.

process.loadEnvFile('.env.local')

import { createClient } from '@supabase/supabase-js'
import { fetchOGPreview } from '../src/shared/utils/og-preview'

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'music.youtube.com'])
const PAGE_SIZE = 200
const DELAY_MS  = 300 // be polite to YouTube's oEmbed endpoint — avoid hammering

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  let updated = 0, unchanged = 0, failed = 0, from = 0
  const youtubeHostList = [...YOUTUBE_HOSTS]

  for (;;) {
    const { data: rows, error } = await supabase
      .from('notes')
      .select('id, url, og_title, og_image_url, source_domain')
      .in('source_domain', youtubeHostList)
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw new Error(`Fetch page failed: ${error.message}`)
    if (!rows || rows.length === 0) break

    for (const row of rows) {
      try {
        const preview = await fetchOGPreview(row.url)
        const nextTitle = preview?.title ?? null
        const nextImage = preview?.image ?? null

        if (nextTitle !== row.og_title || nextImage !== row.og_image_url) {
          const { error: updateError } = await supabase
            .from('notes')
            .update({ og_title: nextTitle, og_image_url: nextImage })
            .eq('id', row.id)
          if (updateError) throw new Error(updateError.message)
          updated++
          console.log(`updated  ${row.id}  "${row.og_title ?? ''}" -> "${nextTitle ?? ''}"`)
        } else {
          unchanged++
        }
      } catch (e) {
        failed++
        console.error(`failed   ${row.id}  ${row.url}  ${e instanceof Error ? e.message : e}`)
      }
      await sleep(DELAY_MS)
    }

    from += PAGE_SIZE
  }

  console.log(`\nDone. updated=${updated} unchanged=${unchanged} failed=${failed}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
