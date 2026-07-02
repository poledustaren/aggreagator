/**
 * Экран «Таймлайн процессов»: горизонтальная временная шкала на vis-timeline,
 * где каждая полоса — процесс (start→end), сгруппированный по зоне.
 *
 * Запрашиваем /processes/timeline С окном (from/to) — сервер в этом режиме
 * отдаёт процессы ОКОННО-КОНЕЧНЫМИ: end = последнее сообщение процесса В ОКНЕ
 * (даже для open — он не тянется до «сейчас», а формально завершается на виде).
 * Пикер окна — тот же компонент, что на /relations (WindowPicker), дефолт —
 * последние 7 дней. Смена окна перезапрашивает таймлайн.
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
import { WindowPicker, defaultWindow, type TimeWindow } from '../components/common/WindowPicker'
import { LoadingState, ErrorState, EmptyState } from '../components/common/StateViews'

export function TimelinePage() {
  // Переименовано в timeWindow (не window), чтобы не затенять глобальный window.
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(() => defaultWindow())
  const timelineResult = useProcessTimeline(timeWindow.from, timeWindow.to)
  const areasResult = useAreas()
  const [searchParams] = useSearchParams()
  const highlightProcessId = searchParams.get('process')
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(highlightProcessId)
  const timelineRef = useRef<Timeline | null>(null)

  const areas = areasResult.data ?? []
  const entries = timelineResult.data?.entries ?? []
  // fetchStatus === 'paused': запрос ждёт восстановления сети (см. RelationsPage —
  // тот же паттерн TanStack Query v5, где isPending остаётся true, а isLoading — false).
  const isPaused = timelineResult.fetchStatus === 'paused' && timelineResult.isPending

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

      <WindowPicker value={timeWindow} onChange={setTimeWindow} />

      {(timelineResult.isPending && !isPaused) || areasResult.isLoading ? (
        <LoadingState label="Загружаем таймлайн..." />
      ) : null}

      {isPaused && (
        <ErrorState message="Нет соединения с сервером — запрос ждёт восстановления сети." onRetry={() => timelineResult.refetch()} />
      )}

      {timelineResult.isError && (
        <ErrorState
          message={
            timelineResult.error instanceof Error ? timelineResult.error.message : 'Не удалось загрузить таймлайн'
          }
          onRetry={() => timelineResult.refetch()}
        />
      )}

      {!timelineResult.isPending &&
        !timelineResult.isError &&
        !areasResult.isLoading &&
        entries.length === 0 && <EmptyState message="Процессов пока нет" />}

      {!timelineResult.isPending && !timelineResult.isError && !areasResult.isLoading && entries.length > 0 && (
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
