'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

interface BottomNavProps {
  crewId: string
}

export function BottomNav({ crewId }: BottomNavProps) {
  const pathname = usePathname()
  const router   = useRouter()
  const isHome  = pathname === '/home'
  const isChat  = pathname.startsWith('/chat')
  const isVault = pathname.startsWith('/vault')

  return (
    <div
      className="flex items-stretch border-t border-[#1a1a2e] bg-[#080514] flex-shrink-0"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <Link
        href="/home"
        className="flex-1 flex flex-col items-center justify-center gap-1 py-3"
        onMouseEnter={() => router.prefetch('/home')}
        onTouchStart={() => router.prefetch('/home')}
        style={{
          minHeight: 56,
          color: isHome ? '#bf5fff' : '#3d2660',
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>🏠</span>
        <span className="font-pixel text-[6px]">HOME</span>
        {isHome && <span className="w-1 h-1 rounded-full bg-[#bf5fff] mt-0.5" />}
      </Link>

      <Link
        href={`/chat/${crewId}`}
        className="flex-1 flex flex-col items-center justify-center gap-1 py-3"
        onMouseEnter={() => router.prefetch(`/chat/${crewId}`)}
        onTouchStart={() => router.prefetch(`/chat/${crewId}`)}
        style={{
          minHeight: 56,
          color: isChat ? '#bf5fff' : '#3d2660',
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>⚔</span>
        <span className="font-pixel text-[6px]">CHAT</span>
        {isChat && <span className="w-1 h-1 rounded-full bg-[#bf5fff] mt-0.5" />}
      </Link>

      <Link
        href={`/vault/${crewId}`}
        className="flex-1 flex flex-col items-center justify-center gap-1 py-3"
        onMouseEnter={() => router.prefetch(`/vault/${crewId}`)}
        onTouchStart={() => router.prefetch(`/vault/${crewId}`)}
        style={{
          minHeight: 56,
          color: isVault ? '#bf5fff' : '#3d2660',
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>🏛</span>
        <span className="font-pixel text-[6px]">VAULT</span>
        {isVault && <span className="w-1 h-1 rounded-full bg-[#bf5fff] mt-0.5" />}
      </Link>
    </div>
  )
}
