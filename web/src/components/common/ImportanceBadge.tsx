/**
 * Цветовая шкала важности 0-100: серый (низкая) → жёлтый → оранжевый → красный (критично).
 */

function importanceColor(value: number): string {
  if (value >= 80) return 'bg-red-500/20 text-red-300 border-red-500/40'
  if (value >= 60) return 'bg-orange-500/20 text-orange-300 border-orange-500/40'
  if (value >= 40) return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
  if (value >= 20) return 'bg-blue-500/20 text-blue-300 border-blue-500/40'
  return 'bg-neutral-700/40 text-neutral-400 border-neutral-600/40'
}

export function ImportanceBadge({ value }: { value: number }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${importanceColor(value)}`}
      title={`Важность: ${value}`}
    >
      {value}
    </span>
  )
}
