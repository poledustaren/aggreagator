/**
 * Карточка процесса в списке: заголовок, статус, зона/проект, диапазон дат.
 */

import type { Area, Process, Project } from '../../types/api'
import { ProcessStatusBadge } from './ProcessStatusBadge'

interface ProcessCardProps {
  process: Process
  areas: Area[]
  projects: Project[]
  onOpen: (id: string) => void
}

export function ProcessCard({ process, areas, projects, onOpen }: ProcessCardProps) {
  const area = areas.find((a) => a.id === process.area_id)
  const project = projects.find((p) => p.id === process.project_id)

  return (
    <button
      onClick={() => onOpen(process.id)}
      className="w-full rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-left transition-colors hover:bg-neutral-800/60"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 flex-1 truncate font-medium text-neutral-100">
          {process.title ?? '(без названия)'}
        </h3>
        <ProcessStatusBadge status={process.status} />
      </div>

      {process.summary && <p className="mt-1 truncate text-sm text-neutral-400">{process.summary}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
        {area && <span className="rounded bg-neutral-800 px-1.5 py-0.5">{area.name}</span>}
        {project && <span className="rounded bg-neutral-800 px-1.5 py-0.5">{project.name}</span>}
        <span>{process.item_count} элементов</span>
        <span>начат {new Date(process.started_at).toLocaleDateString('ru-RU')}</span>
        <span>активность {new Date(process.last_activity_at).toLocaleDateString('ru-RU')}</span>
        {process.ended_at && <span>завершён {new Date(process.ended_at).toLocaleDateString('ru-RU')}</span>}
      </div>
    </button>
  )
}
