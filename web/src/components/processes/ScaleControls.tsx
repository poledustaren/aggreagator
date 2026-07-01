/**
 * Кнопки быстрого масштаба таймлайна: день/неделя/месяц/всё.
 * Устанавливают окно через timeline.setWindow вокруг текущего момента.
 */

import type { MutableRefObject } from 'react'
import type { Timeline } from 'vis-timeline/standalone'

type Scale = 'day' | 'week' | 'month' | 'fit'

const SCALE_MS: Record<Exclude<Scale, 'fit'>, number> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
}

const OPTIONS: { value: Scale; label: string }[] = [
  { value: 'day', label: 'День' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
  { value: 'fit', label: 'Всё' },
]

export function ScaleControls({ timelineRef }: { timelineRef: MutableRefObject<Timeline | null> }) {
  const apply = (scale: Scale) => {
    const timeline = timelineRef.current
    if (!timeline) return
    if (scale === 'fit') {
      timeline.fit()
      return
    }
    const now = Date.now()
    const half = SCALE_MS[scale] / 2
    timeline.setWindow(new Date(now - half), new Date(now + half))
  }

  return (
    <div className="flex items-center gap-1.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => apply(opt.value)}
          className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
