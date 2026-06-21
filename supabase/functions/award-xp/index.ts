/**
 * award-xp Edge Function
 *
 * Two-layer anti-spam system:
 *
 * LAYER 1 — CONSECUTIVE HARD BLOCK
 *   If the last 3 messages in this crew before the current one are all from
 *   the same sender, the sender has ≥ 3 in a row — this message earns 0 XP
 *   and 0 coins. Resets as soon as another user sends a message.
 *
 * LAYER 2 — 30-SECOND COOLDOWN (soft block)
 *   If the sender's previous message in this crew was sent less than 30 s ago,
 *   this message earns 0 XP and 0 coins (message is still delivered).
 *
 * XP awards (when neither layer blocks):
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

const BOSS_XP_THRESHOLD = 500

// Leveling constants — keep in sync with src/lib/config.ts
const LEVEL_XP_BASE        = 120
const LEVEL_XP_GROWTH_RATE = 1.0435
const LEVEL_CAP            = 100

// Anti-spam constants
const COOLDOWN_MS     = 30_000  // Layer 2: soft block if gap < 30 s
const CONSECUTIVE_MAX = 3       // Layer 1: hard block after this many in a row

function getElementType(content: string, messageType: string): string {
  if (messageType === 'voice')    return 'lightning'
  if (messageType === 'image')    return 'nature'
  if (messageType === 'reaction') return 'shadow'
  if (messageType === 'system')   return 'arcane'
  if (content.length < 20)        return 'fire'
  if (content.length > 150)       return 'water'
  return 'fire'
}

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
    const { message_id, crew_id, user_id, username, message_type, content, mentioned_user_ids } = await req.json()
    const mentionedIds: string[] = Array.isArray(mentioned_user_ids) ? mentioned_user_ids : []

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

    // ─── BATCH 1: spam checks + crew data + other members (5 queries in parallel) ─
    const [prevMsgsResult, consecutiveResult, crewResult, senderProfileResult, membersResult] = await Promise.all([
      // Layer 2: most recent message from this user in this crew (30 s cooldown)
      supabase
        .from('messages')
        .select('created_at')
        .eq('crew_id', crew_id)
        .eq('user_id', user_id)
        .neq('id', message_id)
        .order('created_at', { ascending: false })
        .limit(1),

      // Layer 1: last CONSECUTIVE_MAX messages in crew (any sender) to detect run
      supabase
        .from('messages')
        .select('user_id')
        .eq('crew_id', crew_id)
        .neq('id', message_id)
        .order('created_at', { ascending: false })
        .limit(CONSECUTIVE_MAX),

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

      // Other crew members — fetched here so notification fires immediately
      supabase
        .from('crew_members')
        .select('user_id')
        .eq('crew_id', crew_id)
        .neq('user_id', user_id),
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

      if (mentionedSet.size > 0) {
        const validMentioned = otherUserIds.filter((id: string) => mentionedSet.has(id))
        if (validMentioned.length > 0) {
          fetch(fnUrl, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_ids: validMentioned, type: 'mention_received', payload: notifPayload }),
          }).catch(() => {})
        }
      }

      const nonMentionedIds = otherUserIds.filter((id: string) => !mentionedSet.has(id))
      if (nonMentionedIds.length > 0) {
        fetch(fnUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_ids: nonMentionedIds, type: 'message_received', payload: notifPayload }),
        }).catch(() => {})
      }

      console.log(`[award-xp] notifications fired: ${nonMentionedIds.length} message_received, ${mentionedIds.length} mention_received (message ${message_id})`)
    }

    // ─── LAYER 1: CONSECUTIVE HARD BLOCK ────────────────────────────────────
    let xpBlocked = false
    const lastMsgs = consecutiveResult.data ?? []
    if (
      lastMsgs.length === CONSECUTIVE_MAX &&
      lastMsgs.every((m: { user_id: string }) => m.user_id === user_id)
    ) {
      xpBlocked = true
    }

    // ─── LAYER 2: 30-SECOND COOLDOWN (soft block) ───────────────────────────
    let softBlocked = false
    const prevMessage = prevMsgsResult.data?.[0]
    if (!xpBlocked && prevMessage) {
      const gapMs = Date.now() - new Date(prevMessage.created_at as string).getTime()
      if (gapMs < COOLDOWN_MS) softBlocked = true
    }

    const crewBefore = crewResult.data
    const isDevUser  = senderProfileResult.data?.is_dev === true

    // ─── XP CALCULATION ─────────────────────────────────────────────────────
    let xpAwarded = 0
    let newXP     = 0
    let newLevel  = 1

    if (!xpBlocked && !softBlocked) {
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
    const oldXP = crewBefore?.total_xp ?? 0

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
          .update({
            xp_awarded:   xpAwarded,
            element_type: getElementType(content ?? '', message_type),
          })
          .eq('id', message_id),
      ])

      if (newLevel > oldLevel && isDevUser) {
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
    const coinsEarned = (!xpBlocked && !softBlocked) ? (COIN_VALUES[message_type] ?? 0) : 0
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

    // ─── BOSS SPAWN (dev-only) ───────────────────────────────────────────────
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

            const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-notification`
            fetch(fnUrl, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                user_ids: (membersResult.data ?? []).map((m: { user_id: string }) => m.user_id),
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
