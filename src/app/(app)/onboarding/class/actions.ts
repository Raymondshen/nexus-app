'use server'

import { redirect } from 'next/navigation'
import { revalidateTag } from 'next/cache'
import { createClient } from '@/shared/supabase/server'
import type { AvatarClass } from '@/types'

const SELECTABLE_CLASSES: AvatarClass[] = ['mage', 'warrior', 'rogue', 'healer', 'archer']

export async function selectClassAction(
  _prevState: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const selectedClass = formData.get('class') as AvatarClass
  const crewId        = formData.get('crewId') as string

  if (!SELECTABLE_CLASSES.includes(selectedClass)) return { error: 'Select a class to continue.' }
  if (!crewId) redirect('/home')

  // crew_members.class is the per-crew source of truth — required
  const { error: memberErr } = await supabase
    .from('crew_members')
    .update({ class: selectedClass })
    .eq('crew_id', crewId)
    .eq('user_id', user.id)

  if (memberErr) return { error: memberErr.message }

  // profiles.avatar_class kept in sync for profile page display (best-effort)
  await supabase
    .from('profiles')
    .update({ avatar_class: selectedClass })
    .eq('id', user.id)

  revalidateTag(`profile:${user.id}`, 'max')
  revalidateTag(`crew-members:${crewId}`, 'max')

  redirect(`/chat/${crewId}`)
}
