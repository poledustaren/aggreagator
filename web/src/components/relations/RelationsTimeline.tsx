/**
 * Таймлайн окна для раздела «Связи»: те же процессы графа как диапазоны
 * start→end, сгруппированные ПО ТЕМАМ (а не по зонам, как на /timeline).
 * Императивная обёртка vis-timeline — тот же паттерн, что VisTimelineView
 * (создание в useEffect, destroy в cleanup), но с другой группировкой и
 * входными данными (GraphNode[] вместо ProcessTimelineEntry[]).
 */

import { useEffect, useRef } from 'react'
import { Timeline } from 'vis-timeline/standalone'
import type { DataItem, TimelineGroup, TimelineOptions } from 'vis-timeline/standalone'
import type { GraphNode } from '../../types/api'

const NO_THEME_GROUP = '__no_theme__'

interface RelationsTimelineProps {
  nodes: GraphNode[]
  themeColor: (theme: string | null) => string
  onSelect: (nodeId: string) => void
  highlightNodeId?: string | null
}

function classNameForStatus(status: GraphNode['status']): string {
  if (status === 'open') return 'proc-open'
  if (status === 'frozen') return 'proc-frozen'
  return 'proc-closed'
}

export function RelationsTimeline({ nodes, themeColor, onSelect, highlightNodeId }: RelationsTimelineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const timelineRef = useRef<Timeline | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const themeNames = Array.from(new Set(nodes.map((n) => n.theme).filter((t): t is string => t !== null)))
    const groups: TimelineGroup[] = [
      ...themeNames.map((theme) => ({
        id: theme,
        content: theme,
        style: `border-left: 3px solid ${themeColor(theme)};`,
      })),
      { id: NO_THEME_GROUP, content: 'Без темы' },
    ]

    const items: DataItem[] = nodes.map((n) => ({
      id: n.id,
      group: n.theme ?? NO_THEME_GROUP,
      content: n.title ?? '(без названия)',
      start: n.start,
      end: n.end, // граф всегда оконно-конечен — end заполнен
      className: classNameForStatus(n.status),
      title: `${n.title ?? '(без названия)'} — ${n.item_count} элементов`,
    }))

    const options: TimelineOptions = {
      stack: true,
      zoomable: true,
      moveable: true,
      horizontalScroll: true,
      zoomKey: 'ctrlKey',
      orientation: 'top',
      groupHeightMode: 'fitItems',
      margin: { item: 8, axis: 8 },
      tooltip: { followMouse: true, overflowMethod: 'flip' },
    }

    const timeline = new Timeline(containerRef.current, items, groups, options)
    timeline.on('select', (props: { items: string[] }) => {
      if (props.items.length > 0) onSelect(props.items[0])
    })
    timelineRef.current = timeline

    if (items.length > 0) timeline.fit()

    return () => {
      timeline.destroy()
      timelineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes])

  // Синхронизация выделения при клике на узел графа (без пересоздания таймлайна).
  useEffect(() => {
    const timeline = timelineRef.current
    if (!timeline) return
    if (highlightNodeId) {
      timeline.setSelection(highlightNodeId)
      timeline.focus(highlightNodeId)
    } else {
      timeline.setSelection([])
    }
  }, [highlightNodeId])

  return <div ref={containerRef} className="vis-timeline-dark rounded-lg border border-neutral-800 bg-neutral-900" />
}
