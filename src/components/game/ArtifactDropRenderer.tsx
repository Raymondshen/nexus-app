'use client'

import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { ArtifactCard } from './ArtifactCard'
import { VictoryOverlay } from './VictoryOverlay'
import { useChatStore } from '@/store/chatStore'
import type { Artifact } from '@/types'

interface ArtifactDropRendererProps {
  artifactId: string
  crewName:   string
}

export function ArtifactDropRenderer({ artifactId, crewName }: ArtifactDropRendererProps) {
  const [artifact,       setArtifact]       = useState<Artifact | null>(null)
  const [showOverlay,    setShowOverlay]     = useState(false)
  const [overlayDone,    setOverlayDone]     = useState(false)
  const crewLevel = useChatStore((s) => s.crewLevel)

  useEffect(() => {
    // Show VictoryOverlay once per artifact (session-scoped)
    const key = `nexus_victory_${artifactId}`
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1')
      setShowOverlay(true)
    } else {
      setOverlayDone(true)
    }

    // Fetch artifact data
    const supabase = createClient()
    supabase
      .from('artifacts')
      .select('*')
      .eq('id', artifactId)
      .single()
      .then(({ data }) => {
        if (data) setArtifact(data as Artifact)
      })
  }, [artifactId])

  const handleDismiss = useCallback(() => {
    setShowOverlay(false)
    setOverlayDone(true)
  }, [])

  return (
    <>
      <AnimatePresence>
        {showOverlay && (
          <VictoryOverlay
            crewName={crewName}
            xpGained={500}
            newLevel={crewLevel > 1 ? crewLevel : null}
            onDismiss={handleDismiss}
          />
        )}
      </AnimatePresence>

      {overlayDone && artifact && (
        <ArtifactCard artifact={artifact} />
      )}

      {overlayDone && !artifact && (
        <div className="w-full my-3 p-4 text-center" style={{ border:'1px solid rgba(191,95,255,0.2)', background:'rgba(10,6,18,0.8)' }}>
          <p className="font-pixel text-[7px] text-[#4a3060]">Loading artifact...</p>
        </div>
      )}
    </>
  )
}
