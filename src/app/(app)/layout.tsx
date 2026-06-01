import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { GuestBanner } from '@/components/ui/GuestBanner'
import { InstallPrompt } from '@/components/ui/InstallPrompt'
import { NotificationPrompt } from '@/components/ui/NotificationPrompt'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-[#0a0612]">
      <GuestBanner />
      {children}
      <InstallPrompt />
      <NotificationPrompt />
    </div>
  )
}
