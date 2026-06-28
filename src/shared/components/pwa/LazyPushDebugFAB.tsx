'use client'

import dynamic from 'next/dynamic'

const PushDebugFABDynamic = dynamic(
  () => import('@/shared/components/pwa/PushDebugFAB').then(m => ({ default: m.PushDebugFAB })),
  { ssr: false }
)

export function LazyPushDebugFAB() {
  return <PushDebugFABDynamic />
}
