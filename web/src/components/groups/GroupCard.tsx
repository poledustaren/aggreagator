/**
 * Раскрывающийся тред (Group) со вложенными Item.
 */

import { useState } from 'react'
import type { Area, Group, Project } from '../../types/api'
import { ImportanceBadge } from '../common/ImportanceBadge'
import { ItemCard } from '../items/ItemCard'

interface GroupCardProps {
  group: Group
  areas: Area[]
  projects: Project[]
  onDone: (id: string) => void
  onDismiss: (id: string) => void
  onSnooze: (id: string, until: string) => void
  onReassign: (id: string, patch: { area_id?: string; project_id?: string }) => void
  pendingItemId?: string
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
}: GroupCardProps) {
  const [expanded, setExpanded] = useState(false)
  const area = areas.find((a) => a.id === group.area_id)
  const project = projects.find((p) => p.id === group.project_id)

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium text-neutral-100">{group.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
            <span>{group.item_count} сообщений</span>
            {area && <span className="rounded bg-neutral-800 px-1.5 py-0.5">{area.name}</span>}
            {project && <span className="rounded bg-neutral-800 px-1.5 py-0.5">{project.name}</span>}
            <span>обновлено {new Date(group.last_activity_at).toLocaleString('ru-RU')}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ImportanceBadge value={group.importance} />
          <span className="text-neutral-500">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-neutral-800 p-3">
          {group.items.map((item) => (
            <ItemCard
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
        </div>
      )}
    </div>
  )
}
