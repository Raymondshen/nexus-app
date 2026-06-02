'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createAdmin } from '@supabase/supabase-js'

export async function leaveCrewAction(
  crewId: string,
  token:  string,
): Promise<{ error?: string; deleted?: boolean }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return { error: 'Server misconfigured — missing Supabase env vars' }
  }

  const admin = createAdmin(supabaseUrl, serviceKey)

  // Verify caller via JWT (same pattern as spawn-boss route)
  const { data: { user }, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !user) return { error: 'Not authenticated' }

  // Count all members currently in the crew
  const { count, error: countErr } = await admin
    .from('crew_members')
    .select('*', { count: 'exact', head: true })
    .eq('crew_id', crewId)

  if (countErr) return { error: countErr.message }

  if ((count ?? 0) <= 1) {
    // Last member — delete the crew entirely (CASCADE removes everything)
    const { error } = await admin.from('crews').delete().eq('id', crewId)
    if (error) return { error: error.message }
    revalidatePath('/home')
    return { deleted: true }
  }

  // Multiple members remain — redistribute this user's MVP artifacts
  const { data: remaining } = await admin
    .from('crew_members')
    .select('user_id')
    .eq('crew_id', crewId)
    .neq('user_id', user.id)

  const remainingIds = (remaining ?? []).map((r) => r.user_id as string)

  if (remainingIds.length > 0) {
    const { data: myArtifacts } = await admin
      .from('artifacts')
      .select('id')
      .eq('crew_id', crewId)
      .eq('mvp_user_id', user.id)

    for (let i = 0; i < (myArtifacts ?? []).length; i++) {
      await admin
        .from('artifacts')
        .update({ mvp_user_id: remainingIds[i % remainingIds.length] })
        .eq('id', myArtifacts![i].id)
    }
  }

  const { error } = await admin
    .from('crew_members')
    .delete()
    .eq('crew_id', crewId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/home')
  return {}
}
