import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' }

// Date.getTimezoneOffset() convention: minutes UTC is ahead of local time. Clamp to
// real-world UTC offsets (UTC-12 .. UTC+14) so a bad client value can't skew the math.
const MAX_OFFSET_MINUTES = 14 * 60

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401, headers: JSON_HEADERS })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // The user id always comes from the verified JWT, never from the request body.
    const { data: userData, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS })
    }
    const userId = userData.user.id

    const body = await req.json().catch(() => ({}))
    let offsetMinutes = Number((body as { timezone_offset_minutes?: unknown })?.timezone_offset_minutes)
    if (!Number.isFinite(offsetMinutes) || Math.abs(offsetMinutes) > MAX_OFFSET_MINUTES) offsetMinutes = 0

    // Shift "now" by the offset to get local wall-clock time, truncate to that day's
    // start, then shift back to get the actual UTC instant of the most recent local midnight.
    const localNow         = new Date(Date.now() - offsetMinutes * 60_000)
    const localMidnightMs  = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate(), 0, 0, 0, 0)
    const localMidnightUtc = new Date(localMidnightMs + offsetMinutes * 60_000).toISOString()

    const { data, error } = await supabase.rpc('claim_daily_gem', {
      p_user_id:        userId,
      p_local_midnight: localMidnightUtc,
    })
    if (error) throw error

    return new Response(JSON.stringify(data), { headers: JSON_HEADERS })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: JSON_HEADERS })
  }
})
