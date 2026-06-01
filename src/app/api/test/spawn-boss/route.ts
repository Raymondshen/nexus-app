import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
  const { crew_id } = await request.json()
  if (!crew_id) return NextResponse.json({ error: 'crew_id required' }, { status: 400 })

  // Verify caller is authenticated and a member of this crew
  const serverClient = await createServerClient()
  const { data: authData, error: authErr } = await serverClient.auth.getUser()
  const user = authData?.user
  if (authErr) console.error('[spawn-boss] auth error:', authErr.message)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: membership } = await serverClient
    .from('crew_members')
    .select('id')
    .eq('crew_id', crew_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Not a member of this crew' }, { status: 403 })

  // Use service role for the spawn — bypasses RLS on active_raids
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: existingRaid } = await admin
    .from('active_raids')
    .select('id')
    .eq('crew_id', crew_id)
    .is('defeated_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (existingRaid) {
    return NextResponse.json({ error: 'A raid is already active' }, { status: 409 })
  }

  const { data: boss } = await admin
    .from('bosses')
    .select('id, max_hp, name')
    .eq('type', 'void')
    .limit(1)
    .single()

  if (!boss) return NextResponse.json({ error: 'No void boss configured in DB' }, { status: 404 })

  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

  const { data: raid, error: raidErr } = await admin
    .from('active_raids')
    .insert({
      crew_id,
      boss_id:    boss.id,
      current_hp: boss.max_hp,
      max_hp:     boss.max_hp,
      expires_at: expiresAt,
    })
    .select('id')
    .single()

  if (raidErr || !raid) {
    return NextResponse.json({ error: raidErr?.message ?? 'Failed to create raid' }, { status: 500 })
  }

  await admin.from('messages').insert({
    crew_id,
    user_id:      user.id,
    content:      `BOSS_SPAWN:${raid.id}`,
    message_type: 'system',
    element_type: 'arcane',
    xp_awarded:   0,
  })

  return NextResponse.json({ ok: true, raid_id: raid.id, boss_name: boss.name })
  } catch (err) {
    console.error('[spawn-boss] unhandled error:', err)
    const msg = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
