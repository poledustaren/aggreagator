/**
 * Экран «Процессы»: список процессов с фильтром по статусу, бесконечный
 * скролл по cursor, клик по карточке открывает детальную панель с items.
 */

import { useState } from 'react'
import { useProcesses } from '../hooks/useProcesses'
import { useAreas } from '../hooks/useAreas'
import { useProjects } from '../hooks/useProjects'
import { useInfiniteScrollTrigger } from '../hooks/useInfiniteScrollTrigger'
import { ProcessCard } from '../components/processes/ProcessCard'
import { ProcessDetailPanel } from '../components/processes/ProcessDetailPanel'
import { LoadingState, ErrorState, EmptyState } from '../components/common/StateViews'
import type { ProcessStatus } from '../types/api'

const STATUS_OPTIONS: { value: ProcessStatus | ''; label: string }[] = [
  { value: '', label: 'Все статусы' },
  { value: 'open', label: 'Идёт' },
  { value: 'frozen', label: 'Заморожен' },
  { value: 'closed', label: 'Завершён' },
]

export function ProcessesPage() {
  const [status, setStatus] = useState<ProcessStatus | ''>('')
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null)

  const processesResult = useProcesses({ status: status || undefined, limit: 30 })
  const areasResult = useAreas()
  const projectsResult = useProjects()

  const sentinelRef = useInfiniteScrollTrigger(
    () => processesResult.fetchNextPage(),
    processesResult.hasNextPage === true && !processesResult.isFetchingNextPage,
  )

  const processes = processesResult.data?.pages.flatMap((p) => p.processes) ?? []
  const areas = areasResult.data ?? []
  const projects = projectsResult.data ?? []

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ProcessStatus | '')}
          className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {processesResult.isLoading && <LoadingState label="Загружаем процессы..." />}

      {processesResult.isError && (
        <ErrorState
          message={
            processesResult.error instanceof Error ? processesResult.error.message : 'Не удалось загрузить процессы'
          }
          onRetry={() => processesResult.refetch()}
        />
      )}

      {!processesResult.isLoading && !processesResult.isError && processes.length === 0 && (
        <EmptyState message="Процессы не найдены" />
      )}

      {processes.length > 0 && (
        <div className="space-y-3">
          {processes.map((process) => (
            <ProcessCard
              key={process.id}
              process={process}
              areas={areas}
              projects={projects}
              onOpen={setSelectedProcessId}
            />
          ))}
        </div>
      )}

      <div ref={sentinelRef} />
      {processesResult.isFetchingNextPage && <LoadingState label="Догружаем..." />}

      {selectedProcessId && (
        <ProcessDetailPanel processId={selectedProcessId} onClose={() => setSelectedProcessId(null)} />
      )}
    </div>
  )
}
