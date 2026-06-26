'use client'

import { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useCombatStore } from '@/store/combatStore'
import type { CombatEvent } from '@/types'

const EVENT_COLOR: Record<string, string> = {
  player_attack:  'var(--color-secondary)',
  player_crit:    'var(--color-coins)',
  ability_used:   '#a855f7',
  boss_attack:    'var(--color-danger)',
  member_downed:  'var(--color-danger)',
  member_revived: 'var(--color-success)',
  boss_spawn:     '#a855f7',
  raid_victory:   'var(--color-coins)',
  raid_escaped:   'var(--color-tertiary)',
  heal:           'var(--color-success)',
  self_heal:      'var(--color-success)',
  stat_boost:     'var(--color-coins)',
}

function EventRow({ event }: { event: CombatEvent }) {
  const color   = EVENT_COLOR[event.kind] ?? 'var(--color-tertiary)'
  const d       = new Date(event.ts)
  const dateStr = d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

  return (
    <div
      className="font-body"
      style={{ fontSize: 11, fontVariationSettings: '"opsz" 14', lineHeight: 'normal', padding: '4px 16px' }}
    >
      <span style={{ color: 'var(--color-tertiary)' }}>{dateStr} · {timeStr} · </span>
      <span style={{ color }}>{event.text}</span>
    </div>
  )
}

export function CombatLog() {
  const events      = useCombatStore((s) => s.combatEvents)
  const parentRef   = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)

  const virtualizer = useVirtualizer({
    count:            events.length,
    getScrollElement: () => parentRef.current,
    estimateSize:     () => 28,
    overscan:         5,
    getItemKey:       (i) => events[i].id,
  })

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

  const listHeight = Math.min(events.length * 28, 160)

  return (
    <div
      ref={parentRef}
      onScroll={handleScroll}
      className="nexus-scroll"
      style={{ height: listHeight, overflowY: 'auto', paddingTop: 8, paddingBottom: 4 }}
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
  )
}
