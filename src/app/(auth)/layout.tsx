import type { ReactNode } from 'react'
import { SpaceBackground } from '@/shared/components/ui/SpaceBackground'

// Bare shell — just the shared space backdrop. The landing screen (Figma
// 544:2786) is a full-bleed design with no boxed card, so the former
// logo+card chrome now lives inside LoginForm itself, scoped to the
// not-yet-redesigned steps (invite-code onward). See LoginForm.tsx.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[var(--color-background)] flex flex-col overflow-hidden">
      <SpaceBackground />
      <div className="relative z-10 flex-1 flex flex-col">
        {children}
      </div>
    </div>
  )
}
