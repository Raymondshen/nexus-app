'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types'

export async function leaveCrewAction(
  crewId: string,
  token:  string,
): Promise<{ error?: string; deleted?: boolean }> {
  const url     = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return { error: 'Missing Supabase config' }

  // Use the user's JWT in the Authorization header so the SECURITY DEFINER
  // function runs with auth.uid() set correctly — no service role key needed.
  const supabase = createClient<Database>(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data, error } = await supabase.rpc('leave_crew', { p_crew_id: crewId })

  if (error) return { error: error.message }

  revalidatePath('/home')
  const result = (data ?? {}) as { deleted?: boolean; ok?: boolean }
  return result.deleted ? { deleted: true } : {}
}
