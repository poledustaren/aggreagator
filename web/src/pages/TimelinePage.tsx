/**
 * Экран «Таймлайн процессов»: горизонтальная временная шкала на vis-timeline,
 * где каждая полоса — процесс (start→end), сгруппированный по зоне.
 * Открытые процессы рисуются до текущего момента, замороженные — пунктиром,
 * завершённые — сплошной заливкой.
 */

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Timeline } from 'vis-timeline/standalone'
import 'vis-timeline/styles/vis-timeline-graph2d.css'
import './../components/processes/vis-timeline-dark.css'
import { useProcessTimeline } from '../hooks/useProcesses'
import { useAreas } from '../hooks/useAreas'
import { VisTimelineView } from '../components/processes/VisTimelineView'
import { ScaleControls } from '../components/processes/ScaleControls'
import { ProcessDetailPanel } from '../components/processes/ProcessDetailPanel'
import { LoadingState, ErrorState, EmptyState } from '../components/common/StateViews'

export function TimelinePage() {
  const timelineResult = useProcessTimeline()
  const areasResult = useAreas()
  const [searchParams] = useSearchParams()
  const highlightProcessId = searchParams.get('process')
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(highlightProcessId)
  const timelineRef = useRef<Timeline | null>(null)

  const areas = areasResult.data ?? []
  const entries = timelineResult.data?.entries ?? []

  // Если пришли по ссылке ?process=<id> из карточки Item — сфокусируем и выделим полосу.
  // Зависим от самого ответа запроса (ссылка стабильна между рендерами), а не от
  // производного массива entries, который пересоздаётся на каждый рендер.
  useEffect(() => {
    if (!highlightProcessId || !timelineRef.current) return
    const exists = timelineResult.data?.entries.some((e) => e.id === highlightProcessId)
    if (!exists) return
    timelineRef.current.setSelection(highlightProcessId)
    timelineRef.current.focus(highlightProcessId)
  }, [highlightProcessId, timelineResult.data])

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-neutral-100">Таймлайн процессов</h1>
          <p className="text-sm text-neutral-500">
            Каждая полоса — процесс. Зелёная — идёт сейчас, пунктирная — заморожена, синяя — завершена.
          </p>
        </div>
        {entries.length > 0 && <ScaleControls timelineRef={timelineRef} />}
      </div>

      {(timelineResult.isLoading || areasResult.isLoading) && <LoadingState label="Загружаем таймлайн..." />}

      {timelineResult.isError && (
        <ErrorState
          message={
            timelineResult.error instanceof Error ? timelineResult.error.message : 'Не удалось загрузить таймлайн'
          }
          onRetry={() => timelineResult.refetch()}
        />
      )}

      {!timelineResult.isLoading &&
        !timelineResult.isError &&
        !areasResult.isLoading &&
        entries.length === 0 && <EmptyState message="Процессов пока нет" />}

      {!timelineResult.isLoading && !timelineResult.isError && !areasResult.isLoading && entries.length > 0 && (
        <VisTimelineView
          entries={entries}
          areas={areas}
          onSelect={setSelectedProcessId}
          timelineRef={timelineRef}
        />
      )}

      {selectedProcessId && (
        <ProcessDetailPanel processId={selectedProcessId} onClose={() => setSelectedProcessId(null)} />
      )}
    </div>
  )
}
