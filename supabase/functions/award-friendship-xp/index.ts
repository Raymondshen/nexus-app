import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const XP_PER_EVENT  = 1
const DAILY_XP_CAP  = 10

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const { user_a_id, user_b_id, source, local_midnight_utc } = await req.json()

    if (!user_a_id || !user_b_id || !source) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: user_a_id, user_b_id, source' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    if (user_a_id === user_b_id) {
      return new Response(
        JSON.stringify({ error: 'user_a_id and user_b_id must be different' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    if (!['dm', 'mention'].includes(source)) {
      return new Response(
        JSON.stringify({ error: 'source must be "dm" or "mention"' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    // Canonical ordering: lesser UUID is always user_a
    const canonA = user_a_id < user_b_id ? user_a_id : user_b_id
    const canonB = user_a_id < user_b_id ? user_b_id : user_a_id

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Use client's local midnight (for device-local daily reset) if valid, else UTC midnight
    const dailyStart = (() => {
      if (local_midnight_utc) {
        try {
          const d = new Date(local_midnight_utc)
          const now = Date.now()
          // Sanity-check: must be in the past and within the last 24h
          if (!isNaN(d.getTime()) && d.getTime() <= now && now - d.getTime() < 86_400_000) {
            return d.toISOString()
          }
        } catch { /* fall through */ }
      }
      return new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'
    })()

    // Beta flag check + daily XP count in parallel
    const [senderProfileResult, dailyCountResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('friendship_xp_enabled')
        .eq('id', user_a_id)
        .single(),

      supabase
        .from('friendship_xp_log')
        .select('id', { count: 'exact', head: true })
        .eq('sender_id', user_a_id)
        .gte('awarded_at', dailyStart),
    ])

    const senderEnabled = (senderProfileResult.data as { friendship_xp_enabled?: boolean } | null)?.friendship_xp_enabled === true

    if (!senderEnabled) {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'beta_not_enabled' }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    // Each event is worth 1 XP, so count = total XP awarded today
    if ((dailyCountResult.count ?? 0) >= DAILY_XP_CAP) {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'daily_limit_reached' }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    // Atomic increment + log insert in parallel
    const [xpResult, logResult] = await Promise.all([
      supabase.rpc('increment_friendship_xp', {
        p_user_a: canonA,
        p_user_b: canonB,
        p_amount: XP_PER_EVENT,
      }),

      supabase.from('friendship_xp_log').insert({
        user_a:     canonA,
        user_b:     canonB,
        sender_id:  user_a_id,
        xp_awarded: XP_PER_EVENT,
        source,
      }),
    ])

    if (xpResult.error) throw xpResult.error
    if (logResult.error) throw logResult.error

    const totalXP = xpResult.data as number

    return new Response(
      JSON.stringify({ total_xp: totalXP, xp_awarded: XP_PER_EVENT }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }
})
