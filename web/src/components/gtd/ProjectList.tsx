/**
 * Список проектов с переключением активности и удалением.
 */

import type { Area, Project } from '../../types/api'

export function ProjectList({
  projects,
  areas,
  onToggleActive,
  onDelete,
}: {
  projects: Project[]
  areas: Area[]
  onToggleActive: (project: Project) => void
  onDelete: (id: string) => void
}) {
  if (projects.length === 0) {
    return <p className="text-sm text-neutral-500">Проектов пока нет</p>
  }

  return (
    <ul className="space-y-1.5">
      {projects.map((project) => {
        const area = areas.find((a) => a.id === project.area_id)
        return (
          <li
            key={project.id}
            className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2"
          >
            <div className="flex items-center gap-2 text-sm">
              <span className={project.active ? 'text-neutral-200' : 'text-neutral-500 line-through'}>
                {project.name}
              </span>
              {area && <span className="text-xs text-neutral-500">({area.name})</span>}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onToggleActive(project)}
                className="text-xs text-neutral-500 hover:text-neutral-200"
              >
                {project.active ? 'Сделать неактивным' : 'Сделать активным'}
              </button>
              <button
                onClick={() => onDelete(project.id)}
                className="text-xs text-neutral-500 hover:text-red-400"
              >
                Удалить
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
