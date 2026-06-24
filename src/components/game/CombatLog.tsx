'use client'

import { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { motion, AnimatePresence } from 'framer-motion'
import { useCombatStore } from '@/store/combatStore'
import type { CombatEvent } from '@/types'

const EVENT_COLOR: Record<string, string> = {
  player_attack:    'var(--color-primary)',
  player_crit:      'var(--color-crit)',
  ability_used:     'var(--color-purple)',
  boss_attack:      'var(--color-danger)',
  member_downed:    'var(--color-danger)',
  member_revived:   'var(--color-success)',
  phase_transition: '#f59e0b',
  raid_victory:     '#ffd700',
  raid_escaped:     'var(--color-tertiary)',
  heal:             'var(--color-success)',
  self_heal:        'var(--color-success)',
  stat_boost:       'var(--color-coins)',
}

function EventRow({ event }: { event: CombatEvent }) {
  const color = EVENT_COLOR[event.kind] ?? 'var(--color-tertiary)'
  return (
    <div
      className="flex items-start gap-2 px-3 py-1.5"
      style={{ borderBottom: '1px solid #1a0d2e' }}
    >
      <span className="font-pixel flex-shrink-0 mt-0.5" style={{ fontSize: 5, color: 'var(--color-muted)' }}>
        {new Date(event.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
      <span className="font-pixel leading-relaxed" style={{ fontSize: 7, color }}>
        {event.text}
      </span>
    </div>
  )
}

export function CombatLog() {
  const events     = useCombatStore((s) => s.combatEvents)
  const parentRef  = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)

  const virtualizer = useVirtualizer({
    count:           events.length,
    getScrollElement: () => parentRef.current,
    estimateSize:    () => 32,
    overscan:        5,
    getItemKey:      (i) => events[i].id,
  })

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (!atBottomRef.current || events.length === 0) return
    virtualizer.scrollToIndex(events.length - 1, { align: 'end', behavior: 'smooth' })
  }, [events.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleScroll = () => {
    const el = parentRef.current
    if (!el) return
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  if (events.length === 0) return null

  return (
    <div
      style={{
        background:  '#0a0612',
        borderTop:   '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-1"
        style={{ borderBottom: '1px solid #1a0d2e' }}
      >
        <span className="font-pixel" style={{ fontSize: 6, color: '#6b4f8f' }}>COMBAT LOG</span>
        <span className="font-silkscreen" style={{ fontSize: 7, color: 'var(--color-muted)' }}>
          {events.length}
        </span>
      </div>
      <div
        ref={parentRef}
        onScroll={handleScroll}
        style={{ height: 100, overflowY: 'auto' }}
        className="nexus-scroll"
      >
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vi) => (
            <div
              key={vi.key}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              style={{ position: 'absolute', top: vi.start, left: 0, right: 0 }}
            >
              <EventRow event={events[vi.index]} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
