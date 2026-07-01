/**
 * Карточка одного Item в ленте: заголовок, summary, бейджи, быстрые действия.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Area, Item, Project } from '../../types/api'
import { ImportanceBadge } from '../common/ImportanceBadge'
import { SnoozeMenu } from './SnoozeMenu'
import { ReassignMenu } from './ReassignMenu'

interface ItemCardProps {
  item: Item
  areas: Area[]
  projects: Project[]
  onDone: (id: string) => void
  onDismiss: (id: string) => void
  onSnooze: (id: string, until: string) => void
  onReassign: (id: string, patch: { area_id?: string; project_id?: string }) => void
  pending?: boolean
}

export function ItemCard({
  item,
  areas,
  projects,
  onDone,
  onDismiss,
  onSnooze,
  onReassign,
  pending,
}: ItemCardProps) {
  const [showSnooze, setShowSnooze] = useState(false)
  const [showReassign, setShowReassign] = useState(false)

  const area = areas.find((a) => a.id === item.area_id)
  const project = projects.find((p) => p.id === item.project_id)

  return (
    <div
      className={`rounded-lg border border-neutral-800 bg-neutral-900 p-4 transition-opacity ${pending ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-medium text-neutral-100">{item.title}</h3>
          </div>
          {item.summary && <p className="mt-1 text-sm text-neutral-400">{item.summary}</p>}
        </div>
        <ImportanceBadge value={item.importance} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
        {item.source_apps.map((app) => (
          <span key={app} className="rounded bg-neutral-800 px-1.5 py-0.5">
            {app}
          </span>
        ))}
        {area && (
          <span className="rounded bg-neutral-800 px-1.5 py-0.5" style={area.color ? { color: area.color } : undefined}>
            {area.name}
          </span>
        )}
        {project && <span className="rounded bg-neutral-800 px-1.5 py-0.5">{project.name}</span>}
        {item.process_id && (
          <Link
            to={`/timeline?process=${item.process_id}`}
            className="rounded bg-purple-500/20 px-1.5 py-0.5 text-purple-300 hover:bg-purple-500/30"
            title="Открыть процесс на таймлайне"
          >
            Процесс
          </Link>
        )}
        {item.tags.map((tag) => (
          <span key={tag} className="rounded bg-neutral-800/60 px-1.5 py-0.5 text-neutral-400">
            #{tag}
          </span>
        ))}
      </div>

      {item.suggested_action && (
        <p className="mt-2 text-sm text-emerald-400/90">→ {item.suggested_action}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => onDone(item.id)}
          disabled={pending}
          className="rounded-md bg-emerald-600/20 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-50"
        >
          Done
        </button>
        <div className="relative">
          <button
            onClick={() => setShowSnooze((s) => !s)}
            disabled={pending}
            className="rounded-md bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
          >
            Snooze
          </button>
          {showSnooze && (
            <SnoozeMenu
              onPick={(until) => {
                onSnooze(item.id, until)
                setShowSnooze(false)
              }}
              onClose={() => setShowSnooze(false)}
            />
          )}
        </div>
        <button
          onClick={() => onDismiss(item.id)}
          disabled={pending}
          className="rounded-md bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-400 hover:bg-neutral-700 disabled:opacity-50"
        >
          Dismiss
        </button>
        <div className="relative ml-auto">
          <button
            onClick={() => setShowReassign((s) => !s)}
            disabled={pending}
            className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          >
            Зона/проект
          </button>
          {showReassign && (
            <ReassignMenu
              areas={areas}
              projects={projects}
              currentAreaId={item.area_id}
              currentProjectId={item.project_id}
              onPick={(patch) => {
                onReassign(item.id, patch)
                setShowReassign(false)
              }}
              onClose={() => setShowReassign(false)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
