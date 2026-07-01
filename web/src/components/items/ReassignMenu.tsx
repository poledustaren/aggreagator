/**
 * Выпадающее меню переназначения зоны/проекта для Item.
 */

import type { Area, Project } from '../../types/api'

interface ReassignMenuProps {
  areas: Area[]
  projects: Project[]
  currentAreaId: string | null
  currentProjectId: string | null
  onPick: (patch: { area_id?: string; project_id?: string }) => void
  onClose: () => void
}

export function ReassignMenu({
  areas,
  projects,
  currentAreaId,
  currentProjectId,
  onPick,
  onClose,
}: ReassignMenuProps) {
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute right-0 z-20 mt-1 w-56 space-y-2 rounded-md border border-neutral-700 bg-neutral-800 p-2 shadow-lg">
        <label className="block text-[11px] uppercase tracking-wide text-neutral-500">Зона</label>
        <select
          defaultValue={currentAreaId ?? ''}
          onChange={(e) => e.target.value && onPick({ area_id: e.target.value })}
          className="w-full rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
        >
          <option value="">—</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <label className="block text-[11px] uppercase tracking-wide text-neutral-500">Проект</label>
        <select
          defaultValue={currentProjectId ?? ''}
          onChange={(e) => e.target.value && onPick({ project_id: e.target.value })}
          className="w-full rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
        >
          <option value="">—</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
    </>
  )
}
