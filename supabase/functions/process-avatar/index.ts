// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import sharp from 'npm:sharp'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// 512px omitted — would upscale from a 256px source with no quality gain
const AVIF_SIZES    = [64, 128, 256] as const
const AVIF_QUALITY  = { 64: 65, 128: 65, 256: 70 } as Record<number, number>

serve(async (req) => {
  try {
    const { userId, ts, ext } = await req.json() as { userId: string; ts: string; ext: string }
    if (!userId || !ts || !ext) return new Response('bad request', { status: 400 })

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

    // Download 256px WebP source (the canonical upload)
    const srcPath = `${userId}/${ts}-256.${ext}`
    const { data: blob, error: dlErr } = await supabase.storage.from('avatars').download(srcPath)
    if (dlErr || !blob) return new Response('source not found', { status: 404 })

    const srcBuffer = new Uint8Array(await blob.arrayBuffer())

    // Generate AVIF variants in parallel
    await Promise.all(
      AVIF_SIZES.map(async (size) => {
        const avifBuf: Buffer = await sharp(srcBuffer)
          .resize(size, size, { fit: 'cover' })
          .avif({ quality: AVIF_QUALITY[size] })
          .toBuffer()
        await supabase.storage.from('avatars').upload(
          `${userId}/${ts}-${size}.avif`,
          avifBuf,
          { contentType: 'image/avif', cacheControl: '31536000', upsert: true },
        )
      }),
    )

    return new Response(
      JSON.stringify({ ok: true, sizes: AVIF_SIZES }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('process-avatar error:', e)
    return new Response(String(e), { status: 500 })
  }
})
