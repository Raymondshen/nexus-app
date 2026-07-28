import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

async function deleteStorageFiles(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  storageKey: string,
) {
  const slash    = storageKey.lastIndexOf('/')
  const folder   = storageKey.slice(0, slash)
  const tsPrefix = storageKey.slice(slash + 1)
  const { data: files } = await supabase.storage.from(bucket).list(folder, { search: tsPrefix })
  if (files && files.length > 0) {
    await supabase.storage.from(bucket).remove(files.map((f) => `${folder}/${f.name}`))
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  })

  // Optional immediate target — a dev-triggered "Remove Permanently" action
  // (adminDeleteUserAction, /profile/developer/manage-notifications) bypasses
  // the 7-day pending_deletions grace period entirely by naming a user_id
  // directly, instead of relying on the cron's delete_at-expiry sweep below.
  let targetUserId: string | null = null
  try {
    const body = await req.json()
    if (body && typeof body.user_id === 'string') targetUserId = body.user_id
  } catch {
    // Cron call sends no body — not an error, just means "sweep expired rows".
  }

  let expired: { user_id: string }[]
  if (targetUserId) {
    expired = [{ user_id: targetUserId }]
  } else {
    const { data, error: fetchError } = await supabase
      .from('pending_deletions')
      .select('user_id')
      .lte('delete_at', new Date().toISOString())

    if (fetchError) {
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }
    expired = (data ?? []) as { user_id: string }[]
  }

  if (expired.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  let processed = 0
  const errors: string[] = []

  for (const row of expired) {
    const userId = row.user_id
    try {
      // Fetch storage keys before deleting profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('avatar_storage_key, background_storage_key')
        .eq('id', userId)
        .maybeSingle()

      const p = profile as { avatar_storage_key?: string | null; background_storage_key?: string | null } | null

      // Delete storage files
      if (p?.avatar_storage_key) {
        await deleteStorageFiles(supabase, 'avatars', p.avatar_storage_key)
      }
      if (p?.background_storage_key) {
        await deleteStorageFiles(supabase, 'backgrounds', p.background_storage_key)
      }

      // Phase 2 — leaf-level rows that reference tables deleted below
      await supabase.from('definition_suggestions').delete().eq('suggester_id', userId)

      // Phase 3 — rows that reference messages (polls.message_id)
      await supabase.from('polls').delete().eq('creator_id', userId)

      // Phase 4 — rows that reference crew_members
      await supabase.from('squad_definitions').delete().eq('creator_id', userId)

      // Phase 4b — event_rsvps.user_id, events.created_by, crews.dm_partner_1/2,
      // and crews.last_message_sender_id are all `NO ACTION` FKs straight to
      // auth.users (verified via pg_constraint — none of them cascade), so any
      // of them left pointing at this user blocks Phase 7's auth.admin.deleteUser
      // with a raw 23503 rather than a clean, catchable Supabase error. This is
      // what silently left user 576b3362-7a9e-495b-be80-c1346f2ab0a1's profile
      // wiped but auth row orphaned the first time this ran against a real
      // account — Phases 2-6 all succeeded, only Phase 7 failed.
      // - Own RSVPs first (events.id -> event_rsvps.event_id cascades, but a
      //   user's RSVP to someone ELSE's event isn't touched by the next line).
      await supabase.from('event_rsvps').delete().eq('user_id', userId)
      // - Events this user created — cascades any remaining event_rsvps for them.
      await supabase.from('events').delete().eq('created_by', userId)
      // - A DM crew is meaningless with one partner gone (same "hard-delete
      //   when the relationship can't continue" precedent as leave_crew wiping
      //   a squad's last member) — every crews child table cascades or
      //   SET NULLs from `crews`, so this is safe as a single delete.
      await supabase.from('crews').delete().eq('dm_partner_1', userId)
      await supabase.from('crews').delete().eq('dm_partner_2', userId)
      // - Any surviving (non-DM) crew where this user sent the last message —
      //   just clear the attribution; the crew and its other members stay.
      await supabase.from('crews').update({ last_message_sender_id: null }).eq('last_message_sender_id', userId)

      // Phase 5 — main data rows
      await Promise.all([
        supabase.from('messages').delete().eq('user_id', userId),
        supabase.from('push_subscriptions').delete().eq('user_id', userId),
        supabase.from('notification_preferences').delete().eq('user_id', userId),
        supabase.from('friendships').delete().or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
        supabase.from('coin_log').delete().eq('user_id', userId),
        supabase.from('crew_xp_log').delete().eq('user_id', userId),
        supabase.from('crew_members').delete().eq('user_id', userId),
      ])

      // Phase 6 — profile row
      await supabase.from('profiles').delete().eq('id', userId)

      // Phase 7 — auth user (cascades pending_deletions via ON DELETE CASCADE)
      const { error: authError } = await supabase.auth.admin.deleteUser(userId)
      if (authError) {
        errors.push(`${userId}: auth delete failed — ${authError.message}`)
        continue
      }

      processed++
    } catch (err) {
      errors.push(`${userId}: ${String(err)}`)
    }
  }

  return new Response(JSON.stringify({ processed, errors }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
})
