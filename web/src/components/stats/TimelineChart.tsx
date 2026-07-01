/**
 * Лёгкий столбчатый график по бакетам времени (день/неделя/месяц) —
 * чистый CSS, без тяжёлых графических библиотек.
 */

import type { TimelineBucket } from '../../types/api'

function formatBucketLabel(iso: string, bucket: string): string {
  const date = new Date(iso)
  if (bucket === 'month') return date.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' })
  if (bucket === 'week') return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

export function TimelineChart({ buckets, bucket }: { buckets: TimelineBucket[]; bucket: string }) {
  if (buckets.length === 0) {
    return <p className="py-8 text-center text-sm text-neutral-500">Нет данных за период</p>
  }

  const max = Math.max(1, ...buckets.map((b) => b.count))

  return (
    <div className="flex h-40 items-end gap-1">
      {buckets.map((b) => (
        <div key={b.bucket_start} className="group relative flex flex-1 flex-col items-center justify-end">
          <div
            className="w-full min-w-[4px] rounded-t bg-blue-500/70 transition-colors group-hover:bg-blue-400"
            style={{ height: `${Math.max(2, (b.count / max) * 100)}%` }}
            title={`${formatBucketLabel(b.bucket_start, bucket)}: ${b.count}`}
          />
          <span className="mt-1 rotate-0 text-[10px] text-neutral-500">{formatBucketLabel(b.bucket_start, bucket)}</span>
        </div>
      ))}
    </div>
  )
}
