import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Dev-only manual boss spawn trigger
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Only available in development' }, { status: 403 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Find user's crew
  const { data: membership } = await supabase
    .from('crew_members')
    .select('crew_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Not in a crew' }, { status: 400 })

  const crewId = membership.crew_id

  // Check for existing active raid
  const { data: existingRaid } = await supabase
    .from('active_raids')
    .select('id')
    .eq('crew_id', crewId)
    .is('defeated_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (existingRaid) {
    return NextResponse.json({ error: 'Raid already active', raidId: existingRaid.id }, { status: 409 })
  }

  // Delegate to the check-void-spawn edge function with force flag
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const res = await fetch(`${supabaseUrl}/functions/v1/check-void-spawn`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
    },
    body: JSON.stringify({ crew_id: crewId }),
  })

  const data = await res.json()
  return NextResponse.json({ crew_id: crewId, ...data })
}
