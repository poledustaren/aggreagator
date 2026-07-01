/**
 * Модалка с деталями процесса: заголовок, статус, диапазон дат, список Item.
 * Используется на таймлайне (клик по полосе) и на экране списка процессов.
 */

import { useProcess } from '../../hooks/useProcesses'
import { LoadingState, ErrorState } from '../common/StateViews'
import { ProcessStatusBadge } from './ProcessStatusBadge'
import { ImportanceBadge } from '../common/ImportanceBadge'

interface ProcessDetailPanelProps {
  processId: string
  onClose: () => void
}

export function ProcessDetailPanel({ processId, onClose }: ProcessDetailPanelProps) {
  const { data: process, isLoading, isError, error, refetch } = useProcess(processId)

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-16"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-neutral-100">
            {process?.title ?? 'Процесс'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
          >
            ✕
          </button>
        </div>

        {isLoading && <LoadingState label="Загружаем процесс..." />}

        {isError && (
          <ErrorState
            message={error instanceof Error ? error.message : 'Не удалось загрузить процесс'}
            onRetry={() => refetch()}
          />
        )}

        {process && (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
              <ProcessStatusBadge status={process.status} />
              <span>начат {new Date(process.started_at).toLocaleString('ru-RU')}</span>
              <span>активность {new Date(process.last_activity_at).toLocaleString('ru-RU')}</span>
              {process.ended_at && <span>завершён {new Date(process.ended_at).toLocaleString('ru-RU')}</span>}
              <span>{process.item_count} элементов</span>
            </div>

            {process.summary && <p className="mt-3 text-sm text-neutral-300">{process.summary}</p>}

            <div className="mt-4 space-y-2">
              <h3 className="text-sm font-medium text-neutral-400">Элементы процесса</h3>
              {process.items.length === 0 && (
                <p className="text-sm text-neutral-500">В процессе пока нет элементов</p>
              )}
              {process.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-950 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-200">{item.title}</p>
                    {item.summary && <p className="mt-0.5 truncate text-xs text-neutral-500">{item.summary}</p>}
                  </div>
                  <ImportanceBadge value={item.importance} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
