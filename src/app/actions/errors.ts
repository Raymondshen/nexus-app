'use server'

import { createClient, createServiceClient } from '@/shared/supabase/server'

export async function logClientErrorAction(payload: {
  message: string
  stack?:  string
  url?:    string
}): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.is_anonymous) return

    const service = createServiceClient()

    // Fetch username in parallel with insert
    const [{ data: profile }] = await Promise.all([
      service.from('profiles').select('username').eq('id', user.id).maybeSingle(),
    ])
    const username = (profile as { username?: string } | null)?.username ?? null

    await service.from('client_errors').insert({
      user_id:  user.id,
      username,
      email:    user.email ?? null,
      message:  payload.message.slice(0, 2000),
      stack:    payload.stack?.slice(0, 5000) ?? null,
      url:      payload.url ?? null,
    })
  } catch {
    // Never throw from an error logger
  }
}

export async function getClientErrorsAction(): Promise<{ data: import('@/types').ClientError[] | null; error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const service = createServiceClient()
    const { data: profile } = await service
      .from('profiles')
      .select('is_dev')
      .eq('id', user.id)
      .maybeSingle()

    if (!(profile as { is_dev?: boolean } | null)?.is_dev) {
      return { data: null, error: 'Forbidden' }
    }

    const { data, error } = await service
      .from('client_errors')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) return { data: null, error: error.message }
    return { data: data as import('@/types').ClientError[], error: null }
  } catch (err) {
    return { data: null, error: String(err) }
  }
}

export async function deleteClientErrorAction(id: string): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const service = createServiceClient()
    const { data: profile } = await service
      .from('profiles')
      .select('is_dev')
      .eq('id', user.id)
      .maybeSingle()

    if (!(profile as { is_dev?: boolean } | null)?.is_dev) return { error: 'Forbidden' }

    await service.from('client_errors').delete().eq('id', id)
    return { error: null }
  } catch (err) {
    return { error: String(err) }
  }
}
