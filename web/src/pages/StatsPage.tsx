/**
 * Экран «Статистика»: overview-карточки, распределения по статусу/важности,
 * счётчики процессов, разбивки по зоне/источнику, график по времени.
 */

import { useState, type ReactNode } from 'react'
import { useStatsByArea, useStatsBySource, useStatsOverview, useStatsTimeline } from '../hooks/useStats'
import { StatCard } from '../components/stats/StatCard'
import { DistributionBars } from '../components/stats/DistributionBars'
import { BarListTable } from '../components/stats/BarListTable'
import { TimelineChart } from '../components/stats/TimelineChart'
import { LoadingState, ErrorState } from '../components/common/StateViews'
import type { StatsBucket } from '../types/api'

const BUCKET_OPTIONS: { value: StatsBucket; label: string }[] = [
  { value: 'day', label: 'День' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <h2 className="mb-3 text-sm font-medium text-neutral-300">{title}</h2>
      {children}
    </section>
  )
}

export function StatsPage() {
  const [bucket, setBucket] = useState<StatsBucket>('day')

  const overviewResult = useStatsOverview()
  const byAreaResult = useStatsByArea()
  const bySourceResult = useStatsBySource()
  const timelineResult = useStatsTimeline(bucket)

  const overview = overviewResult.data

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <h1 className="text-lg font-semibold text-neutral-100">Статистика</h1>

      {overviewResult.isLoading && <LoadingState label="Загружаем статистику..." />}

      {overviewResult.isError && (
        <ErrorState
          message={
            overviewResult.error instanceof Error ? overviewResult.error.message : 'Не удалось загрузить статистику'
          }
          onRetry={() => overviewResult.refetch()}
        />
      )}

      {overview && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Всего элементов" value={overview.total_items} />
            <StatCard label="За 7 дней" value={overview.items_last_7d} accent="text-blue-300" />
            <StatCard label="Процессы всего" value={overview.processes.total} />
            <StatCard label="Идут сейчас" value={overview.processes.open} accent="text-emerald-300" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Section title="По статусу">
              <DistributionBars
                rows={[
                  { label: 'Inbox', value: overview.by_status.inbox, colorClass: 'bg-blue-500' },
                  { label: 'Отложено', value: overview.by_status.snoozed, colorClass: 'bg-yellow-500' },
                  { label: 'Сделано', value: overview.by_status.done, colorClass: 'bg-emerald-500' },
                  { label: 'Отклонено', value: overview.by_status.dismissed, colorClass: 'bg-neutral-600' },
                ]}
              />
            </Section>

            <Section title="По важности">
              <DistributionBars
                rows={[
                  { label: 'Низкая (0-33)', value: overview.by_importance.low, colorClass: 'bg-neutral-500' },
                  { label: 'Средняя (34-66)', value: overview.by_importance.mid, colorClass: 'bg-yellow-500' },
                  { label: 'Высокая (67-100)', value: overview.by_importance.high, colorClass: 'bg-red-500' },
                ]}
              />
            </Section>
          </div>

          <Section title="Процессы">
            <DistributionBars
              rows={[
                { label: 'Идёт', value: overview.processes.open, colorClass: 'bg-emerald-500' },
                { label: 'Заморожен', value: overview.processes.frozen, colorClass: 'bg-neutral-500' },
                { label: 'Завершён', value: overview.processes.closed, colorClass: 'bg-blue-500' },
              ]}
            />
          </Section>
        </>
      )}

      <Section title="По зонам">
        {byAreaResult.isLoading && <LoadingState label="Загружаем..." />}
        {byAreaResult.isError && (
          <ErrorState
            message={byAreaResult.error instanceof Error ? byAreaResult.error.message : 'Не удалось загрузить'}
            onRetry={() => byAreaResult.refetch()}
          />
        )}
        {byAreaResult.data && (
          <BarListTable
            emptyMessage="Нет данных по зонам"
            rows={byAreaResult.data.map((s) => ({
              key: s.area_id ?? 'none',
              label: s.area_name ?? 'Без зоны',
              count: s.item_count,
              extra: `важн. ${s.avg_importance.toFixed(1)}`,
            }))}
          />
        )}
      </Section>

      <Section title="По источникам">
        {bySourceResult.isLoading && <LoadingState label="Загружаем..." />}
        {bySourceResult.isError && (
          <ErrorState
            message={bySourceResult.error instanceof Error ? bySourceResult.error.message : 'Не удалось загрузить'}
            onRetry={() => bySourceResult.refetch()}
          />
        )}
        {bySourceResult.data && (
          <BarListTable
            emptyMessage="Нет данных по источникам"
            rows={bySourceResult.data.map((s) => ({
              key: s.source_app,
              label: s.source_app,
              count: s.item_count,
            }))}
          />
        )}
      </Section>

      <Section title="Динамика по времени">
        <div className="mb-3 flex items-center gap-1.5">
          {BUCKET_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setBucket(opt.value)}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                bucket === opt.value
                  ? 'border-blue-500/60 bg-blue-500/20 text-blue-300'
                  : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {timelineResult.isLoading && <LoadingState label="Загружаем..." />}
        {timelineResult.isError && (
          <ErrorState
            message={timelineResult.error instanceof Error ? timelineResult.error.message : 'Не удалось загрузить'}
            onRetry={() => timelineResult.refetch()}
          />
        )}
        {timelineResult.data && <TimelineChart buckets={timelineResult.data.buckets} bucket={bucket} />}
      </Section>
    </div>
  )
}
