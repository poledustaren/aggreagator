/**
 * Форма создания проекта внутри выбранной зоны.
 */

import { useState } from 'react'
import type { Area, ProjectInput } from '../../types/api'

export function ProjectForm({
  areas,
  onSubmit,
  submitting,
}: {
  areas: Area[]
  onSubmit: (input: ProjectInput) => void
  submitting: boolean
}) {
  const [name, setName] = useState('')
  const [areaId, setAreaId] = useState(areas[0]?.id ?? '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !areaId) return
    onSubmit({ name: name.trim(), area_id: areaId, active: true })
    setName('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <select
        value={areaId}
        onChange={(e) => setAreaId(e.target.value)}
        className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200"
      >
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Название нового проекта"
        className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200"
      />
      <button
        type="submit"
        disabled={submitting || !name.trim() || !areaId}
        className="rounded-md bg-emerald-600/20 px-3 py-1.5 text-sm font-medium text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-50"
      >
        Добавить
      </button>
    </form>
  )
}
