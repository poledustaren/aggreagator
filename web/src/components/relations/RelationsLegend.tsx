/**
 * Легенда: типы связей (цвет линии) + темы (цвет узла), назначенные LLM в текущем окне.
 */

import type { GraphTheme } from '../../types/api'

const RELATION_LEGEND: { relation: string; label: string; color: string }[] = [
  { relation: 'same_entity', label: 'та же сущность', color: '#f472b6' },
  { relation: 'causal', label: 'причина/следствие', color: '#f59e0b' },
  { relation: 'follow_up', label: 'продолжение', color: '#60a5fa' },
  { relation: 'same_project', label: 'тот же проект', color: '#34d399' },
  { relation: 'related', label: 'связано', color: '#a3a3a3' },
]

interface RelationsLegendProps {
  themes: GraphTheme[]
  themeColor: (theme: string | null) => string
}

export function RelationsLegend({ themes, themeColor }: RelationsLegendProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-xs">
      <div>
        <p className="mb-1.5 font-medium text-neutral-400">Типы связей</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {RELATION_LEGEND.map((r) => (
            <span key={r.relation} className="flex items-center gap-1.5 text-neutral-300">
              <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: r.color }} />
              {r.label}
            </span>
          ))}
        </div>
      </div>

      {themes.length > 0 && (
        <div>
          <p className="mb-1.5 font-medium text-neutral-400">Темы</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {themes.map((t) => (
              <span key={t.name} className="flex items-center gap-1.5 text-neutral-300">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: themeColor(t.name) }}
                />
                {t.name} ({t.process_ids.length})
              </span>
            ))}
            <span className="flex items-center gap-1.5 text-neutral-500">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: themeColor(null) }} />
              без темы
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
