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

  const { data: expired, error: fetchError } = await supabase
    .from('pending_deletions')
    .select('user_id')
    .lte('delete_at', new Date().toISOString())

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  if (!expired || expired.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  let processed = 0
  const errors: string[] = []

  for (const row of expired as { user_id: string }[]) {
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

      // Phase 1 — nullify optional FK references so cascade constraints don't block us
      await Promise.all([
        supabase.from('app_invites').update({ inviter_id: null }).eq('inviter_id', userId),
        supabase.from('app_invites').update({ used_by: null }).eq('used_by', userId),
        supabase.from('active_raids').update({ mvp_user_id: null }).eq('mvp_user_id', userId),
        supabase.from('artifacts').update({ mvp_user_id: null }).eq('mvp_user_id', userId),
      ])

      // Phase 2 — leaf-level rows that reference tables deleted below
      await supabase.from('definition_suggestions').delete().eq('suggester_id', userId)

      // Phase 3 — rows that reference messages (polls.message_id)
      await supabase.from('polls').delete().eq('creator_id', userId)

      // Phase 4 — rows that reference crew_members
      await supabase.from('squad_definitions').delete().eq('creator_id', userId)

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
