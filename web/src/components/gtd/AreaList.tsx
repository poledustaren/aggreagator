/**
 * Список зон с удалением.
 */

import type { Area } from '../../types/api'

export function AreaList({ areas, onDelete }: { areas: Area[]; onDelete: (id: string) => void }) {
  if (areas.length === 0) {
    return <p className="text-sm text-neutral-500">Зон пока нет</p>
  }

  return (
    <ul className="space-y-1.5">
      {areas.map((area) => (
        <li
          key={area.id}
          className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2"
        >
          <span className="flex items-center gap-2 text-sm text-neutral-200">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: area.color || '#525252' }} />
            {area.name}
          </span>
          <button
            onClick={() => onDelete(area.id)}
            className="text-xs text-neutral-500 hover:text-red-400"
          >
            Удалить
          </button>
        </li>
      ))}
    </ul>
  )
}
