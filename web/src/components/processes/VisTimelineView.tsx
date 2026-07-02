/**
 * Обёртка над vis-timeline. vis-timeline императивен (не декларативный React-
 * компонент), поэтому создаём инстанс в useEffect через ref на div и чистим
 * его в cleanup при каждом изменении входных данных (entries/areas).
 */

import { useEffect, useRef, type MutableRefObject } from 'react'
import { Timeline } from 'vis-timeline/standalone'
import type { DataItem, TimelineGroup, TimelineOptions } from 'vis-timeline/standalone'
import type { Area, ProcessTimelineEntry } from '../../types/api'

interface VisTimelineViewProps {
  entries: ProcessTimelineEntry[]
  areas: Area[]
  onSelect: (processId: string) => void
  /** Императивный доступ к инстансу таймлайна для внешних кнопок зума (день/неделя/месяц). */
  timelineRef?: MutableRefObject<Timeline | null>
}

const NO_AREA_GROUP = '__no_area__'

// Палитра цветов по зоне — по кругу, детерминированно от индекса.
const AREA_COLORS = ['#60a5fa', '#f59e0b', '#34d399', '#f472b6', '#a78bfa', '#fb923c', '#38bdf8', '#4ade80']

function classNameForStatus(status: ProcessTimelineEntry['status']): string {
  if (status === 'open') return 'proc-open'
  if (status === 'frozen') return 'proc-frozen'
  return 'proc-closed'
}

export function VisTimelineView({ entries, areas, onSelect, timelineRef }: VisTimelineViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const groups: TimelineGroup[] = [
      ...areas.map((area, idx) => ({
        id: area.id,
        content: area.name,
        style: `border-left: 3px solid ${AREA_COLORS[idx % AREA_COLORS.length]};`,
      })),
      { id: NO_AREA_GROUP, content: 'Без зоны' },
    ]

    const items: DataItem[] = entries.map((entry) => ({
      id: entry.id,
      group: entry.area_id ?? NO_AREA_GROUP,
      content: entry.title ?? '(без названия)',
      start: entry.start,
      // Оконный режим (заданы from/to на сервере) отдаёт end ВСЕГДА заполненным —
      // последнее сообщение процесса в окне, процесс формально конечен для вида.
      // Без окна open по-прежнему может прийти с end=null → рисуем до «сейчас».
      end: entry.end ?? new Date().toISOString(),
      className: classNameForStatus(entry.status),
      title: `${entry.title ?? '(без названия)'} — ${entry.item_count} элементов`,
    }))

    const options: TimelineOptions = {
      stack: true,
      zoomable: true,
      moveable: true,
      horizontalScroll: true,
      zoomKey: 'ctrlKey',
      orientation: 'top',
      showCurrentTime: true,
      groupHeightMode: 'fitItems',
      margin: { item: 8, axis: 8 },
      tooltip: { followMouse: true, overflowMethod: 'flip' },
    }

    const timeline = new Timeline(containerRef.current, items, groups, options)
    timeline.on('select', (props: { items: string[] }) => {
      if (props.items.length > 0) {
        onSelect(props.items[0])
      }
    })

    if (timelineRef) timelineRef.current = timeline

    if (items.length > 0) {
      timeline.fit()
    }

    return () => {
      timeline.destroy()
      if (timelineRef) timelineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, areas])

  return <div ref={containerRef} className="vis-timeline-dark rounded-lg border border-neutral-800 bg-neutral-900" />
}
