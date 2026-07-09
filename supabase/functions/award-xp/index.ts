/**
 * award-xp Edge Function
 *
 * Anti-spam: 5-SECOND COOLDOWN
 *   If the sender's previous message in this crew was sent less than 5 s ago,
 *   this message earns 0 XP and 0 coins (message is still delivered).
 *
 * XP awards (when not blocked):
 *   First message of the UTC day in this crew → 10 XP (one-time flat award)
 *   All subsequent messages                   →  1 XP
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const XP_BASE        = 1    // XP per message
const XP_FIRST_TODAY = 10   // flat one-time award for first message of the day

const COIN_VALUES: Record<string, number> = {
  text:     1,
  voice:    1,
  image:    1,
  reaction: 0,
  system:   0,
}

// Leveling constants — keep in sync with src/lib/config.ts
const LEVEL_XP_BASE        = 120
const LEVEL_XP_GROWTH_RATE = 1.0435
const LEVEL_CAP            = 100

// Anti-spam constants
const COOLDOWN_MS = 5_000  // soft block if gap < 5 s

// Mirror of src/lib/game/xp.ts — keep in sync with levelFromTotalXp
function getLevelFromXP(xp: number): number {
  let level = 1
  let cumXP = 0
  while (level < LEVEL_CAP) {
    const cost = Math.round(LEVEL_XP_BASE * Math.pow(LEVEL_XP_GROWTH_RATE, level - 1))
    if (cumXP + cost > xp) break
    cumXP += cost
    level++
  }
  return level
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const { message_id, crew_id, user_id, username, message_type, content, mentioned_user_ids, reply_to_id } = await req.json()
    const mentionedIds: string[] = Array.isArray(mentioned_user_ids) ? mentioned_user_ids : []

    if (!message_id || !crew_id || !user_id || !message_type) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    // Identity check: the caller must BE the user they're awarding XP for.
    // verify_jwt alone is insufficient — the public anon key is a valid JWT, so
    // without this anyone with the anon key (it ships in the client bundle)
    // could mint XP/coins for arbitrary user_id/crew_id combinations. The
    // client sends the user's session token; auth.getUser() resolves it and
    // returns no user for the bare anon key or a forged token.
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user: caller } } = await authClient.auth.getUser()
    if (!caller || caller.id !== user_id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ─── BATCH 1: spam check + crew data + other members (+ reply target) ──
    const [prevMsgsResult, crewResult, membersResult, replyMsgResult] = await Promise.all([
      // Cooldown: most recent message from this user in this crew (5 s gap check)
      supabase
        .from('messages')
        .select('created_at')
        .eq('crew_id', crew_id)
        .eq('user_id', user_id)
        .neq('id', message_id)
        .order('created_at', { ascending: false })
        .limit(1),

      // Crew name + XP — needed for both XP path and notifications
      supabase
        .from('crews')
        .select('total_xp, level, name')
        .eq('id', crew_id)
        .single(),

      // Other crew members — fetched here so notification fires immediately
      supabase
        .from('crew_members')
        .select('user_id')
        .eq('crew_id', crew_id)
        .neq('user_id', user_id),

      // Author of the message being replied to, if any — resolved server-side
      // (never trust a client-supplied target user_id for notification routing)
      reply_to_id
        ? supabase.from('messages').select('user_id').eq('id', reply_to_id).single()
        : Promise.resolve({ data: null }),
    ])

    // ─── FIRE NOTIFICATION IMMEDIATELY (fire-and-forget) ────────────────────
    if (message_type !== 'reaction') {
      const otherUserIds = (membersResult.data ?? []).map((m: { user_id: string }) => m.user_id)
      const mentionedSet = new Set(mentionedIds)
      const fnUrl        = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`
      const notifPayload = {
        sender_name:     username ?? 'Someone',
        content_preview: (content ?? '').slice(0, 80),
        crew_name:       crewResult.data?.name ?? '',
        crew_id,
      }

      // Reply target takes priority over mention/message routing for the same
      // recipient — a user who is both replied-to and mentioned gets one push,
      // the more specific reply_received.
      const replyAuthorId = replyMsgResult.data?.user_id as string | undefined
      const replyTargetId = replyAuthorId && replyAuthorId !== user_id && otherUserIds.includes(replyAuthorId)
        ? replyAuthorId
        : null

      if (replyTargetId) {
        fetch(fnUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: replyTargetId, type: 'reply_received', payload: notifPayload }),
        }).catch(() => {})
      }

      if (mentionedSet.size > 0) {
        const validMentioned = otherUserIds.filter((id: string) => mentionedSet.has(id) && id !== replyTargetId)
        if (validMentioned.length > 0) {
          fetch(fnUrl, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_ids: validMentioned, type: 'mention_received', payload: notifPayload }),
          }).catch(() => {})
        }
      }

      const nonMentionedIds = otherUserIds.filter((id: string) => !mentionedSet.has(id) && id !== replyTargetId)
      if (nonMentionedIds.length > 0) {
        fetch(fnUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_ids: nonMentionedIds, type: 'message_received', payload: notifPayload }),
        }).catch(() => {})
      }

      console.log(`[award-xp] notifications fired: ${nonMentionedIds.length} message_received, ${mentionedIds.length} mention_received, ${replyTargetId ? 1 : 0} reply_received (message ${message_id})`)
    }

    // ─── 5-SECOND COOLDOWN (soft block) ─────────────────────────────────────
    let softBlocked = false
    const prevMessage = prevMsgsResult.data?.[0]
    if (prevMessage) {
      const gapMs = Date.now() - new Date(prevMessage.created_at as string).getTime()
      if (gapMs < COOLDOWN_MS) softBlocked = true
    }

    const crewBefore = crewResult.data
    const oldXP      = crewBefore?.total_xp ?? 0

    // ─── XP CALCULATION ─────────────────────────────────────────────────────
    let xpAwarded = 0
    let newXP     = oldXP            // stays current when blocked
    let newLevel  = getLevelFromXP(oldXP)

    if (!softBlocked) {
      const todayStart = new Date()
      todayStart.setUTCHours(0, 0, 0, 0)
      const todayStartIso = todayStart.toISOString()

      // Check if this is the first message today in this crew
      const { count: todayCount } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('crew_id', crew_id)
        .eq('user_id', user_id)
        .gte('created_at', todayStartIso)
        .neq('id', message_id)

      xpAwarded = todayCount === 0 ? XP_FIRST_TODAY : XP_BASE
    }

    // ─── WRITE XP ───────────────────────────────────────────────────────────
    if (xpAwarded > 0) {
      newXP          = oldXP + xpAwarded
      const oldLevel = getLevelFromXP(oldXP)
      newLevel       = getLevelFromXP(newXP)

      await Promise.all([
        supabase.from('crew_xp_log').insert({
          crew_id,
          user_id,
          xp_amount: xpAwarded,
          source:    message_type,
        }),
        supabase
          .from('crews')
          .update({ total_xp: newXP, level: newLevel })
          .eq('id', crew_id),
        supabase
          .from('messages')
          .update({ xp_awarded: xpAwarded })
          .eq('id', message_id),
      ])

      if (newLevel > oldLevel) {
        await supabase.from('messages').insert({
          crew_id,
          user_id,
          content:      `LEVEL_UP:${newLevel}`,
          message_type: 'system',
          element_type: 'arcane',
          xp_awarded:   0,
        })
      }
    }

    // ─── AWARD COINS ────────────────────────────────────────────────────────
    const coinsEarned = !softBlocked ? (COIN_VALUES[message_type] ?? 0) : 0
    if (coinsEarned > 0) {
      await Promise.all([
        supabase.rpc('increment_user_coins', { p_user_id: user_id, p_amount: coinsEarned }),
        supabase.from('coin_log').insert({
          user_id,
          crew_id,
          coins:  coinsEarned,
          source: message_type,
        }),
      ])
    }

    return new Response(
      JSON.stringify({ xp_earned: xpAwarded, new_level: newLevel, new_total_xp: newXP, coins_earned: coinsEarned, notif_count: (membersResult.data ?? []).length, notif_results: [] }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }
})
