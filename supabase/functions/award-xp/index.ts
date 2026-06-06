/**
 * award-xp Edge Function
 *
 * Three-layer anti-spam system (all layers run server-side only):
 *
 * LAYER 1 — CONSECUTIVE COOLDOWN (hard stop)
 *   If the same user's previous message in this crew was sent less than 2000ms
 *   ago, this message earns 0 XP and deals 0 damage. Uses messages table.
 *
 * LAYER 2 — BURST WINDOW CAP (hard stop)
 *   If the user has already sent 4 or more messages in this crew in the last
 *   30 seconds, the 5th+ message earns 0 XP. Uses messages table.
 *
 * LAYER 3 — DAILY DIMINISHING RETURNS (multiplier, never a hard stop)
 *   Counts XP-eligible messages sent today (UTC) via crew_xp_log:
 *     Messages  1–30  → multiplier 1.0 (full XP)
 *     Messages 31–60  → multiplier 0.5 (half XP)
 *     Messages 61+    → multiplier 0.1 (floor XP)
 *   The adjusted XP is still written to crew_xp_log and applied to the crew.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const XP_VALUES: Record<string, number> = {
  text:     10,
  voice:    25,
  image:    20,
  reaction:  5,
  system:    0,
}

const COIN_VALUES: Record<string, number> = {
  text:     1,
  voice:    3,
  image:    2,
  reaction: 0,
  system:   0,
}

const XP_BONUS_FIRST_TODAY  = 20
const XP_BONUS_COMBO        = 5
const BOSS_XP_THRESHOLD     = 500
const XP_PER_LEVEL          = 500

// Anti-spam constants
const COOLDOWN_MS           = 2_000   // Layer 1: min gap between messages
const BURST_WINDOW_MS       = 30_000  // Layer 2: burst window
const BURST_MAX_MESSAGES    = 4       // Layer 2: max messages before cap kicks in
const DR_TIER1_LIMIT        = 30      // Layer 3: full XP up to this many messages/day
const DR_TIER2_LIMIT        = 60      // Layer 3: half XP up to this many messages/day

function getElementType(content: string, messageType: string): string {
  if (messageType === 'voice')    return 'lightning'
  if (messageType === 'image')    return 'nature'
  if (messageType === 'reaction') return 'shadow'
  if (messageType === 'system')   return 'arcane'
  if (content.length < 20)        return 'fire'
  if (content.length > 150)       return 'water'
  return 'fire'
}

function getLevelFromXP(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1
}

function getDailyMultiplier(countBeforeThisMessage: number): number {
  if (countBeforeThisMessage < DR_TIER1_LIMIT) return 1.0
  if (countBeforeThisMessage < DR_TIER2_LIMIT) return 0.5
  return 0.1
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const { message_id, crew_id, user_id, username, message_type, content } = await req.json()

    if (!message_id || !crew_id || !user_id || !message_type) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ─── BATCH 1: spam checks + crew data (always, 3 queries in parallel) ────
    const burstWindowStart = new Date(Date.now() - BURST_WINDOW_MS).toISOString()

    const [prevMsgsResult, burstResult, crewResult, senderProfileResult] = await Promise.all([
      // Layer 1: most recent prior message from this user in this crew
      supabase
        .from('messages')
        .select('created_at')
        .eq('crew_id', crew_id)
        .eq('user_id', user_id)
        .neq('id', message_id)
        .order('created_at', { ascending: false })
        .limit(1),

      // Layer 2: burst count in last 30s
      supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('crew_id', crew_id)
        .eq('user_id', user_id)
        .neq('id', message_id)
        .gte('created_at', burstWindowStart),

      // Crew name + XP — needed for both XP path and notifications
      supabase
        .from('crews')
        .select('total_xp, level, name')
        .eq('id', crew_id)
        .single(),

      // Sender dev flag — boss spawns and game events are dev-only for now
      supabase
        .from('profiles')
        .select('is_dev')
        .eq('id', user_id)
        .single(),
    ])

    // ─── LAYER 1: CONSECUTIVE COOLDOWN ──────────────────────────────────────
    let xpBlocked = false
    const prevMessage = prevMsgsResult.data?.[0]
    if (prevMessage) {
      const gapMs = Date.now() - new Date(prevMessage.created_at as string).getTime()
      if (gapMs < COOLDOWN_MS) xpBlocked = true
    }

    // ─── LAYER 2: BURST WINDOW CAP ──────────────────────────────────────────
    if ((burstResult.count ?? 0) >= BURST_MAX_MESSAGES) xpBlocked = true

    const crewBefore  = crewResult.data
    const isDevUser   = senderProfileResult.data?.is_dev === true

    // ─── BASE XP + BONUSES ──────────────────────────────────────────────────
    // Spam-blocked messages earn 0 XP but still trigger crew notifications.
    let xpAwarded = 0
    let newXP     = 0
    let newLevel  = 1

    if (!xpBlocked) {
      xpAwarded = XP_VALUES[message_type] ?? 0

      const todayStart = new Date()
      todayStart.setUTCHours(0, 0, 0, 0)
      const todayStartIso    = todayStart.toISOString()
      const sixtySecondsAgo = new Date(Date.now() - 60_000).toISOString()

      // ─── BATCH 2: bonus queries (3 in parallel, only when not spam-blocked) ─
      const [todayResult, comboResult, drResult] = await Promise.all([
        // First message today bonus
        supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('crew_id', crew_id)
          .eq('user_id', user_id)
          .gte('created_at', todayStartIso)
          .neq('id', message_id),

        // Combo bonus (reply within 60s of someone else)
        supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('crew_id', crew_id)
          .neq('user_id', user_id)
          .gte('created_at', sixtySecondsAgo),

        // Layer 3: daily diminishing returns
        supabase
          .from('crew_xp_log')
          .select('id', { count: 'exact', head: true })
          .eq('crew_id', crew_id)
          .eq('user_id', user_id)
          .gte('created_at', todayStartIso),
      ])

      if (todayResult.count === 0) xpAwarded += XP_BONUS_FIRST_TODAY
      if ((comboResult.count ?? 0) > 0) xpAwarded += XP_BONUS_COMBO

      const multiplier = getDailyMultiplier(drResult.count ?? 0)
      xpAwarded = Math.floor(xpAwarded * multiplier)
    }

    // ─── WRITE XP ───────────────────────────────────────────────────────────
    const oldXP = crewBefore?.total_xp ?? 0

    if (xpAwarded > 0) {
      // Log XP
      await supabase.from('crew_xp_log').insert({
        crew_id,
        user_id,
        xp_amount: xpAwarded,
        source:    message_type,
      })

      newXP          = oldXP + xpAwarded
      const oldLevel = getLevelFromXP(oldXP)
      newLevel       = getLevelFromXP(newXP)

      // Update crew total_xp and level
      await supabase
        .from('crews')
        .update({ total_xp: newXP, level: newLevel })
        .eq('id', crew_id)

      // Update message xp_awarded + element_type
      await supabase
        .from('messages')
        .update({
          xp_awarded:   xpAwarded,
          element_type: getElementType(content ?? '', message_type),
        })
        .eq('id', message_id)

      // Level up notification (dev-only while game events are gated)
      if (newLevel > getLevelFromXP(oldXP) && isDevUser) {
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
    // Coins are awarded for every non-spam message (xpBlocked does not gate coins).
    const coinsEarned = !xpBlocked ? (COIN_VALUES[message_type] ?? 0) : 0
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

    // Boss spawn — dev-only while game events are gated
    const oldThreshold = Math.floor(oldXP / BOSS_XP_THRESHOLD)
    const newThreshold = Math.floor(newXP  / BOSS_XP_THRESHOLD)

    if (newThreshold > oldThreshold && isDevUser) {
      const { data: existingRaid } = await supabase
        .from('active_raids')
        .select('id')
        .eq('crew_id', crew_id)
        .is('defeated_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()

      if (!existingRaid) {
        const { data: voidBoss } = await supabase
          .from('bosses')
          .select('id, max_hp, name')
          .eq('type', 'void')
          .limit(1)
          .single()

        if (voidBoss) {
          const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

          const { data: newRaid } = await supabase
            .from('active_raids')
            .insert({
              crew_id,
              boss_id:    voidBoss.id,
              current_hp: voidBoss.max_hp,
              max_hp:     voidBoss.max_hp,
              expires_at: expiresAt,
            })
            .select('id')
            .single()

          if (newRaid) {
            await supabase.from('messages').insert({
              crew_id,
              user_id,
              content:      `BOSS_SPAWN:${newRaid.id}`,
              message_type: 'system',
              element_type: 'arcane',
              xp_awarded:   0,
            })

            const { data: crewMembers } = await supabase
              .from('crew_members')
              .select('user_id')
              .eq('crew_id', crew_id)

            // Single batch call — one HTTP request regardless of crew size
            const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`
            await fetch(fnUrl, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                user_ids: (crewMembers ?? []).map(m => m.user_id),
                type:     'boss_spawned',
                payload:  {
                  boss_name: voidBoss.name ?? 'The Void',
                  crew_name: crewBefore?.name ?? '',
                  crew_id,
                },
              }),
            }).catch(() => {})
          }
        }
      }
    }

    // Notify other crew members of the new message (skip reactions)
    let notifResults: { uid: string; http: number; result: string }[] = []
    if (message_type !== 'reaction') {
      const { data: otherMembers } = await supabase
        .from('crew_members')
        .select('user_id')
        .eq('crew_id', crew_id)
        .neq('user_id', user_id)

      console.log(`[award-xp] notifying ${otherMembers?.length ?? 0} members for message ${message_id}`)

      // Single batch call — one HTTP request regardless of crew size
      const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`
      const notifRes = await fetch(fnUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_ids:        (otherMembers ?? []).map(m => m.user_id),
          type:            'message_received',
          payload:         {
            sender_name:     username ?? 'Someone',
            content_preview: (content ?? '').slice(0, 80),
            crew_name:       crewBefore?.name ?? '',
            crew_id,
          },
        }),
      })
      const notifData = await notifRes.json().catch(() => ({ results: [] }))
      notifResults = (notifData.results ?? []).map((r: { user_id?: string; status: string }) => ({
        uid:    (r.user_id ?? '?').slice(0, 8),
        http:   notifRes.status,
        result: r.status,
      }))
      console.log(`[award-xp] batch notify: http=${notifRes.status} count=${notifResults.length}`)
    }

    return new Response(
      JSON.stringify({ xp_earned: xpAwarded, new_level: newLevel, new_total_xp: newXP, coins_earned: coinsEarned, notif_count: notifResults.length, notif_results: notifResults }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }
})
