// Run: npm run backfill-notes-og -- spotify
//      npm run backfill-notes-og -- youtube
//
// One-time (re-runnable/idempotent) backfill for `notes` rows saved before a given
// platform's creator-name fix in src/shared/utils/og-preview.ts went live — those rows'
// `og_title` has no " · Artist" suffix (or, for YouTube, still carries the un-stripped
// " - Topic" suffix). Re-fetches each matching-domain note's preview with the current
// fetchOGPreview and updates the row if anything changed. Consolidates what used to be
// two near-identical scripts (backfill-spotify-notes.ts / backfill-youtube-notes.ts) —
// add a new platform by adding one entry to HOSTS_BY_PLATFORM.
//
// Uses the service-role key directly (not src/shared/supabase/server.ts — that module
// imports next/headers at the top level, which throws outside a Next.js request context).

process.loadEnvFile('.env.local')

import { createClient } from '@supabase/supabase-js'
import { fetchOGPreview } from '../src/shared/utils/og-preview'

const HOSTS_BY_PLATFORM = {
  spotify: ['open.spotify.com', 'www.spotify.com', 'spotify.com'],
  youtube: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'music.youtube.com'],
} as const

type Platform = keyof typeof HOSTS_BY_PLATFORM

const PAGE_SIZE = 200
const DELAY_MS  = 300 // be polite to each platform's endpoint — avoid hammering

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const platform = process.argv[2] as Platform | undefined
  if (!platform || !(platform in HOSTS_BY_PLATFORM)) {
    throw new Error(`Usage: npm run backfill-notes-og -- <${Object.keys(HOSTS_BY_PLATFORM).join('|')}>`)
  }
  const hosts = [...HOSTS_BY_PLATFORM[platform]]

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  let updated = 0, unchanged = 0, failed = 0, from = 0

  for (;;) {
    const { data: rows, error } = await supabase
      .from('notes')
      .select('id, url, og_title, og_image_url, source_domain')
      .in('source_domain', hosts)
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

  console.log(`\nDone (${platform}). updated=${updated} unchanged=${unchanged} failed=${failed}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
