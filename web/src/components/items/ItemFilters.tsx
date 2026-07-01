/**
 * Панель фильтров ленты: статус, зона, проект, тег, минимальная важность, дата "от".
 */

import type { Area, ItemStatus, Project } from '../../types/api'

export interface FiltersState {
  status: ItemStatus | ''
  area_id: string
  project_id: string
  tag: string
  importance_min: number
  from: string
}

interface ItemFiltersProps {
  value: FiltersState
  onChange: (value: FiltersState) => void
  areas: Area[]
  projects: Project[]
  tags: string[]
}

const STATUS_OPTIONS: { value: ItemStatus | ''; label: string }[] = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'snoozed', label: 'Отложено' },
  { value: 'done', label: 'Сделано' },
  { value: 'dismissed', label: 'Отклонено' },
  { value: '', label: 'Все статусы' },
]

export function ItemFilters({ value, onChange, areas, projects, tags }: ItemFiltersProps) {
  const set = <K extends keyof FiltersState>(key: K, v: FiltersState[K]) =>
    onChange({ ...value, [key]: v })

  const visibleProjects = value.area_id ? projects.filter((p) => p.area_id === value.area_id) : projects

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <select
        value={value.status}
        onChange={(e) => set('status', e.target.value as ItemStatus | '')}
        className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <select
        value={value.area_id}
        onChange={(e) => set('area_id', e.target.value)}
        className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200"
      >
        <option value="">Все зоны</option>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>

      <select
        value={value.project_id}
        onChange={(e) => set('project_id', e.target.value)}
        className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200"
      >
        <option value="">Все проекты</option>
        {visibleProjects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <select
        value={value.tag}
        onChange={(e) => set('tag', e.target.value)}
        className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200"
      >
        <option value="">Все теги</option>
        {tags.map((t) => (
          <option key={t} value={t}>
            #{t}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-1.5 text-sm text-neutral-400">
        Важность ≥
        <input
          type="number"
          min={0}
          max={100}
          value={value.importance_min}
          onChange={(e) => set('importance_min', Number(e.target.value))}
          className="w-16 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-neutral-200"
        />
      </label>

      <label className="flex items-center gap-1.5 text-sm text-neutral-400">
        От
        <input
          type="date"
          value={value.from}
          onChange={(e) => set('from', e.target.value)}
          className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-neutral-200"
        />
      </label>
    </div>
  )
}

export const DEFAULT_FILTERS: FiltersState = {
  status: 'inbox',
  area_id: '',
  project_id: '',
  tag: '',
  importance_min: 0,
  from: '',
}
