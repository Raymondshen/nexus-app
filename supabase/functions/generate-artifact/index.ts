import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' }

// ─── Rarity roll ──────────────────────────────────────────────────────────────
// common 60 % / rare 25 % / epic 12 % / legendary 3 %
type Rarity = 'common' | 'rare' | 'epic' | 'legendary'

function rollRarity(): Rarity {
  const n = Math.random() * 100
  if (n < 3)  return 'legendary'
  if (n < 15) return 'epic'
  if (n < 40) return 'rare'
  return 'common'
}

// ─── Templates keyed by boss type ─────────────────────────────────────────────

interface Template {
  name:       string
  asset_type: string
  metadata:   Record<string, unknown>
}

const VOID_TEMPLATES: Record<Rarity, Template[]> = {
  legendary: [
    {
      name:       'Arcane Codex of the First Sage',
      asset_type: 'relic',
      metadata: {
        passive_bonus: '+20% XP from messages over 150 characters',
        active_bonus:  'Once per day: Sage Aura — all messages deal Arcane damage for 1 hour',
        lore:          'Before the Void, there was the Word. The First Sage spoke it once and never needed to speak again.',
        is_sage_mage:  true,
      },
    },
    {
      name:       'Void Crown',
      asset_type: 'gear',
      metadata: {
        passive_bonus: '+15% damage in Phase 3 raids',
        active_bonus:  'Surge: next 5 messages deal double damage',
        lore:          'The Void wears no crown — but those who defeat it may.',
        is_sage_mage:  false,
      },
    },
  ],
  epic: [
    {
      name:       'Mantle of the Abyss',
      asset_type: 'gear',
      metadata: {
        passive_bonus: "Silence does not spawn The Void for 12 hours",
        active_bonus:  'Invoke once: absorb the next boss phase transition',
        lore:          "Woven from silence itself — the very thing The Void feeds on.",
        is_sage_mage:  false,
      },
    },
    {
      name:       'Fractured Void Sigil',
      asset_type: 'gear',
      metadata: {
        passive_bonus: '+10 XP on every voice message sent by the crew',
        active_bonus:  'Resonance: the next reaction combo chains infinitely for 30 seconds',
        lore:          'A broken seal. Whatever it was keeping closed is already out.',
        is_sage_mage:  false,
      },
    },
  ],
  rare: [
    {
      name:       'Shard of Eternal Silence',
      asset_type: 'relic',
      metadata: {
        passive_bonus: '+10 XP for the first message after any 6-hour silence',
        lore:          "A fragment of the Void's core. Still hums with forgotten darkness.",
        is_sage_mage:  false,
      },
    },
    {
      name:       'Void-Touched Talisman',
      asset_type: 'relic',
      metadata: {
        passive_bonus: '+5 XP bonus on every reaction message',
        lore:          'Warm to the touch. Strange, given where it came from.',
        is_sage_mage:  false,
      },
    },
  ],
  common: [
    {
      name:       'Echo of the Void',
      asset_type: 'relic',
      metadata: {
        passive_bonus: '+2 XP on the first daily message',
        lore:          'What remains when the Void retreats.',
        is_sage_mage:  false,
      },
    },
    {
      name:       'Dusted Remains',
      asset_type: 'relic',
      metadata: {
        passive_bonus: 'Worth more as memory than as power.',
        lore:          'You beat the Void. This proves it.',
        is_sage_mage:  false,
      },
    },
  ],
}

// ─── Fallback name generator ──────────────────────────────────────────────────

const ADJECTIVES = ['Fractured','Ancient','Dark','Ruined','Spectral','Lost','Shattered','Cursed','Ethereal','Forsaken']
const NOUNS      = ['Relic','Crystal','Shard','Tome','Sigil','Amulet','Rune','Totem','Seal','Fragment']

function randomName(bossName: string): string {
  const adj  = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  return `${adj} ${noun} of ${bossName}`
}

function pickTemplate(templates: Template[]): Template {
  return templates[Math.floor(Math.random() * templates.length)]
}

// ─── Edge function ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { crew_id, boss_id, mvp_user_id, participant_user_ids } = await req.json() as {
      crew_id:               string
      boss_id:               string
      mvp_user_id:           string
      participant_user_ids:  string[]
    }

    if (!crew_id || !boss_id || !mvp_user_id) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: JSON_HEADERS })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Fetch boss name
    const { data: boss } = await supabase
      .from('bosses')
      .select('name, type')
      .eq('id', boss_id)
      .single()

    const bossName = (boss?.name ?? 'THE VOID').toUpperCase()
    const bossType = boss?.type ?? 'void'

    // Determine rarity
    const rarity = rollRarity()

    // Pick template (void boss has built-in templates; others get random names)
    let template: Template

    if (bossType === 'void' && VOID_TEMPLATES[rarity]) {
      template = pickTemplate(VOID_TEMPLATES[rarity])
    } else {
      template = {
        name:       randomName(bossName),
        asset_type: rarity === 'epic' ? 'gear' : 'relic',
        metadata: {
          passive_bonus: '+5 XP on all messages for 24 hours',
          lore:          `A relic of the battle against ${bossName}.`,
          is_sage_mage:  false,
        },
      }
    }

    // Fetch participant usernames
    const participantIds = [...new Set([mvp_user_id, ...(participant_user_ids ?? [])])]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', participantIds)

    const profileMap: Record<string, string> = {}
    for (const p of profiles ?? []) {
      profileMap[p.id] = p.username
    }
    const mvpUsername       = profileMap[mvp_user_id] ?? 'Unknown'
    const participantNames  = participantIds.map((id) => profileMap[id] ?? 'Unknown').filter(Boolean)

    // Build metadata
    const metadata = {
      ...template.metadata,
      boss_name:         bossName,
      participant_names: participantNames,
      mvp_username:      mvpUsername,
    }

    // Insert artifact
    const { data: artifact, error: artifactErr } = await supabase
      .from('artifacts')
      .insert({
        crew_id,
        name:           template.name,
        rarity,
        source_boss_id: boss_id,
        mvp_user_id,
        asset_type:     template.asset_type,
        metadata,
      })
      .select('*')
      .single()

    if (artifactErr || !artifact) {
      return new Response(JSON.stringify({ error: artifactErr?.message ?? 'Insert failed' }), { status: 500, headers: JSON_HEADERS })
    }

    // Insert system message that MessageList will parse as artifact_drop
    await supabase.from('messages').insert({
      crew_id,
      user_id:      mvp_user_id,
      content:      `ARTIFACT_DROP:${artifact.id}`,
      message_type: 'system',
      element_type: 'arcane',
      xp_awarded:   0,
    })

    return new Response(JSON.stringify({ artifact }), { headers: JSON_HEADERS })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: JSON_HEADERS })
  }
})
