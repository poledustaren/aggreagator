/**
 * Горизонтальные CSS-бары для распределений (статус/важность) — без тяжёлых
 * графических библиотек, просто ширина в процентах от максимума.
 */

interface DistributionRow {
  label: string
  value: number
  colorClass: string
}

export function DistributionBars({ rows }: { rows: DistributionRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value))

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2">
          <span className="w-24 shrink-0 text-xs text-neutral-400">{row.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-800">
            <div
              className={`h-full rounded-full ${row.colorClass}`}
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-neutral-400">{row.value}</span>
        </div>
      ))}
    </div>
  )
}
