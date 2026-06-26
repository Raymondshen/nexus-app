import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/shared/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/boss-attack`
  const res = await fetch(fnUrl, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  })

  const data = await res.json()
  return NextResponse.json(data)
}
