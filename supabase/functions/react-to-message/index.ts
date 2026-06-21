import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' }

// Leveling constants — keep in sync with src/lib/config.ts
const LEVEL_XP_BASE        = 120
const LEVEL_XP_GROWTH_RATE = 1.0435
const LEVEL_CAP            = 100

const HYPE_MAN_HEAL_XP = 5

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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json() as {
      message_id: string
      emoji:      string
      user_id:    string
      crew_id:    string
    }
    const { message_id, emoji, user_id, crew_id } = body

    if (!message_id || !emoji || !user_id || !crew_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: JSON_HEADERS },
      )
    }

    // Reject anything that looks like arbitrary text — a grapheme cluster is
    // always short; reject if the raw UTF-16 length is suspiciously large.
    if (typeof emoji !== 'string' || emoji.length > 16) {
      return new Response(
        JSON.stringify({ error: 'Invalid emoji' }),
        { status: 400, headers: JSON_HEADERS },
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verify caller is a crew member and retrieve their class for the Hype Man check
    const { data: membership } = await supabase
      .from('crew_members')
      .select('class')
      .eq('crew_id', crew_id)
      .eq('user_id', user_id)
      .maybeSingle()

    if (!membership) {
      return new Response(
        JSON.stringify({ error: 'Not a crew member' }),
        { status: 403, headers: JSON_HEADERS },
      )
    }

    // Atomic toggle via row-locking Postgres function
    const { data: newReactions, error: toggleErr } = await supabase.rpc(
      'toggle_reaction',
      { p_message_id: message_id, p_emoji: emoji, p_user_id: user_id },
    )

    if (toggleErr) throw toggleErr

    const reactions = (newReactions ?? {}) as Record<string, string[]>

    // Determine whether the caller just added (vs removed) this reaction
    const emojiUsers = reactions[emoji]
    const userAdded  = Array.isArray(emojiUsers) && emojiUsers.includes(user_id)

    // Hype Man passive: when adding a reaction, award bonus XP to the crew
    let hypeMmanHeal = false
    let healAmount   = 0

    if (userAdded && membership.class === 'hype_man') {
      const { data: crew } = await supabase
        .from('crews')
        .select('total_xp')
        .eq('id', crew_id)
        .single()

      if (crew) {
        const oldXP = (crew.total_xp as number) ?? 0
        const newXP = oldXP + HYPE_MAN_HEAL_XP

        await Promise.all([
          supabase.from('crew_xp_log').insert({
            crew_id,
            user_id,
            xp_amount: HYPE_MAN_HEAL_XP,
            source:    'reaction_heal',
          }),
          supabase.from('crews')
            .update({ total_xp: newXP, level: getLevelFromXP(newXP) })
            .eq('id', crew_id),
        ])

        hypeMmanHeal = true
        healAmount   = HYPE_MAN_HEAL_XP
      }
    }

    return new Response(
      JSON.stringify({ reactions, hype_man_heal: hypeMmanHeal, heal_amount: healAmount }),
      { headers: JSON_HEADERS },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: JSON_HEADERS },
    )
  }
})
