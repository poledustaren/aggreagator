/**
 * Таблица-бар для by-area / by-source: название + счётчик + опциональная
 * доп. метрика (avg_importance), с CSS-баром пропорционально максимуму.
 */

interface BarListRow {
  key: string
  label: string
  count: number
  extra?: string
}

export function BarListTable({ rows, emptyMessage }: { rows: BarListRow[]; emptyMessage: string }) {
  if (rows.length === 0) {
    return <p className="py-4 text-center text-sm text-neutral-500">{emptyMessage}</p>
  }

  const max = Math.max(1, ...rows.map((r) => r.count))

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.key} className="flex items-center gap-3">
          <span className="w-32 shrink-0 truncate text-sm text-neutral-300">{row.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-800">
            <div className="h-full rounded-full bg-blue-500/70" style={{ width: `${(row.count / max) * 100}%` }} />
          </div>
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-neutral-400">{row.count}</span>
          {row.extra && <span className="w-16 shrink-0 text-right text-xs tabular-nums text-neutral-500">{row.extra}</span>}
        </div>
      ))}
    </div>
  )
}
