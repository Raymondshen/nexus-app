import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const XP_PER_SOURCE: Record<string, number> = {
  dm:      5,
  mention: 10,
}

const RATE_LIMIT_WINDOW_MS = 30_000

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const { user_a_id, user_b_id, source } = await req.json()

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

    if (!XP_PER_SOURCE[source]) {
      return new Response(
        JSON.stringify({ error: 'source must be "dm" or "mention"' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    // Enforce canonical ordering: user_a < user_b (UUID string comparison)
    const canonA = user_a_id < user_b_id ? user_a_id : user_b_id
    const canonB = user_a_id < user_b_id ? user_b_id : user_a_id

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Check sender has the beta enabled + rate limit (2 queries in parallel)
    const rateLimitStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()

    const [senderProfileResult, recentLogResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('friendship_xp_enabled')
        .eq('id', user_a_id)
        .single(),

      supabase
        .from('friendship_xp_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_a', canonA)
        .eq('user_b', canonB)
        .gte('awarded_at', rateLimitStart),
    ])

    const senderEnabled = (senderProfileResult.data as { friendship_xp_enabled?: boolean } | null)?.friendship_xp_enabled === true

    if (!senderEnabled) {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'beta_not_enabled' }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    if ((recentLogResult.count ?? 0) > 0) {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'rate_limited' }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    const xpAwarded = XP_PER_SOURCE[source]

    // Atomic increment + log insert in parallel
    const [xpResult, logResult] = await Promise.all([
      supabase.rpc('increment_friendship_xp', {
        p_user_a: canonA,
        p_user_b: canonB,
        p_amount: xpAwarded,
      }),

      supabase.from('friendship_xp_log').insert({
        user_a:     canonA,
        user_b:     canonB,
        xp_awarded: xpAwarded,
        source,
      }),
    ])

    if (xpResult.error) throw xpResult.error
    if (logResult.error) throw logResult.error

    const totalXP = xpResult.data as number

    return new Response(
      JSON.stringify({ total_xp: totalXP, xp_awarded: xpAwarded }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }
})
