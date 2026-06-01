import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

Deno.serve(async (_req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const now      = new Date()
    const twoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString()
    const nowIso   = now.toISOString()

    // Find active raids expiring within 2 hours that haven't had a warning sent
    const { data: expiringRaids } = await supabase
      .from('active_raids')
      .select('id, crew_id, boss_id, bosses(name)')
      .is('defeated_at', null)
      .eq('expiry_notif_sent', false)
      .gt('expires_at', nowIso)
      .lt('expires_at', twoHours)

    if (!expiringRaids || expiringRaids.length === 0) {
      return new Response(JSON.stringify({ checked: 0 }), { headers: JSON_HEADERS })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    let notified      = 0

    for (const raid of expiringRaids) {
      // Mark sent before dispatching to prevent double-send if this run takes long
      await supabase
        .from('active_raids')
        .update({ expiry_notif_sent: true })
        .eq('id', raid.id)

      const [{ data: crew }, { data: members }] = await Promise.all([
        supabase.from('crews').select('name').eq('id', raid.crew_id).single(),
        supabase.from('crew_members').select('user_id').eq('crew_id', raid.crew_id),
      ])

      const bossName = (raid.bosses as { name: string } | null)?.name ?? 'The Boss'
      const crewName = crew?.name ?? ''

      for (const member of members ?? []) {
        fetch(`${supabaseUrl}/functions/v1/send-notification`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            user_id: member.user_id,
            type:    'raid_expiring',
            payload: { boss_name: bossName, crew_name: crewName, crew_id: raid.crew_id },
          }),
        }).catch(() => {})
      }

      notified++
    }

    return new Response(JSON.stringify({ notified }), { headers: JSON_HEADERS })
  } catch (err) {
    console.error('[check-raid-expiry] error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: JSON_HEADERS },
    )
  }
})
