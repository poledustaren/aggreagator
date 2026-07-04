/**
 * Раскрывающийся тред (Group) в морской стилизации funufunu. Заголовок с иконкой
 * «течение» (кольцо + точка цвета погоды), строка «источник · N сообщ. · время»,
 * макс. балл, caret. Раскрытие — вложенные StormCard + «+ ещё N в этом треде».
 */

import { useState } from 'react'
import type { Area, Group, Project } from '../../types/api'
import { weather } from '../../lib/weather'
import { formatAgo } from '../../lib/datetime'
import { StormCard } from '../items/StormCard'

interface GroupCardProps {
  group: Group
  areas: Area[]
  projects: Project[]
  onDone: (id: string) => void
  onDismiss: (id: string) => void
  onSnooze: (id: string, until: string) => void
  onReassign: (id: string, patch: { area_id?: string; project_id?: string }) => void
  pendingItemId?: string
  defaultOpen?: boolean
}

export function GroupCard({
  group,
  areas,
  projects,
  onDone,
  onDismiss,
  onSnooze,
  onReassign,
  pendingItemId,
  defaultOpen,
}: GroupCardProps) {
  const [expanded, setExpanded] = useState(!!defaultOpen)
  const w = weather(group.importance)
  const sources = [...new Set(group.items.flatMap((i) => i.source_apps))]
  const src = sources[0]
  const more = group.item_count - group.items.length

  return (
    <div style={{ borderRadius: 18, background: 'var(--surface)', overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: 14,
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        {/* Иконка «течение»: кольцо + точка цвета погоды. */}
        <span
          style={{
            width: 32, height: 32, borderRadius: '50%', border: `2px solid ${w.color}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
          }}
        >
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: w.color }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "600 14px/1.2 'Instrument Sans',sans-serif", color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {group.title}
          </div>
          <div className="font-mono" style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>
            {src ? `${src} · ` : ''}{group.item_count} сообщ. · {formatAgo(group.last_activity_at)}
          </div>
        </div>
        <span className="font-mono" style={{ fontSize: 16, fontWeight: 700, color: w.color }}>{group.importance}</span>
        <span style={{ color: 'var(--ink3)', fontSize: 12, width: 12, textAlign: 'center' }}>{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {group.items.map((item) => (
            <StormCard
              key={item.id}
              item={item}
              areas={areas}
              projects={projects}
              pending={pendingItemId === item.id}
              onDone={onDone}
              onDismiss={onDismiss}
              onSnooze={onSnooze}
              onReassign={onReassign}
            />
          ))}
          {more > 0 && (
            <div style={{ textAlign: 'center', font: "500 12px/1 'Instrument Sans',sans-serif", color: 'var(--ink3)', padding: 5 }}>
              + ещё {more} в этом треде
            </div>
          )}
        </div>
      )}
    </div>
  )
}
