/**
 * Экран «Процессы» (морская стилизация funufunu). Панель «Погодные фронты · 14
 * дней» — горизонтальные полосы-ганты (позиция = спан процесса в окне, цвет =
 * важность), ниже список процессов (полоса важности, заголовок, summary, балл,
 * счётчик). Клик по процессу открывает детальную панель.
 */

import { useMemo, useState } from 'react'
import { useProcesses } from '../hooks/useProcesses'
import { useInfiniteScrollTrigger } from '../hooks/useInfiniteScrollTrigger'
import { ProcessCard } from '../components/processes/ProcessCard'
import { ProcessDetailPanel } from '../components/processes/ProcessDetailPanel'
import { LoadingState, ErrorState, EmptyState } from '../components/common/StateViews'
import { PROCESS_STATUS, hexRgba, weather } from '../lib/weather'
import { formatAbsShort } from '../lib/datetime'
import type { Process, ProcessStatus } from '../types/api'

const STATUS_OPTIONS: { value: ProcessStatus | ''; label: string }[] = [
  { value: '', label: 'Все' },
  { value: 'open', label: 'Идёт' },
  { value: 'frozen', label: 'Заморожен' },
  { value: 'closed', label: 'Завершён' },
]

const WINDOW_DAYS = 14
const DAY_MS = 86_400_000

// Конец полосы процесса: завершён → ended_at, заморожен → last_activity_at,
// идёт → «сейчас» (фронт держится до текущего момента).
function processEnd(p: Process, now: number): number {
  if (p.ended_at) return new Date(p.ended_at).getTime()
  if (p.status === 'frozen') return new Date(p.last_activity_at).getTime()
  return now
}

// «Погодные фронты» — панель горизонтальных полос за 14 дней.
function FrontsPanel({
  processes,
  onOpen,
  selectedId,
}: {
  processes: Process[]
  onOpen: (id: string) => void
  selectedId: string | null
}) {
  const { bars, ticks, openCount } = useMemo(() => {
    const end = Date.now()
    const start = end - WINDOW_DAYS * DAY_MS
    const span = end - start

    const bars = processes
      .map((p) => {
        const s = Math.max(start, new Date(p.started_at).getTime())
        const e = Math.min(end, Math.max(s, processEnd(p, end)))
        return { p, s, e, raw: new Date(p.started_at).getTime() }
      })
      .filter((b) => processEnd(b.p, end) >= start && new Date(b.p.started_at).getTime() <= end)
      .sort((a, b) => a.raw - b.raw)
      .map(({ p, s, e }) => {
        const heat = p.importance
        const color = weather(heat).color
        const st = PROCESS_STATUS[p.status]
        const left = ((s - start) / span) * 100
        const width = Math.max(3, ((e - s) / span) * 100)
        return { p, color, st, left, width: Math.min(width, 100 - left) }
      })

    const ticks = Array.from({ length: 6 }, (_, i) => {
      const t = start + (span * i) / 5
      return i === 5 ? 'сег' : formatAbsShort(new Date(t).toISOString())
    })

    const openCount = processes.filter((p) => p.status === 'open').length
    return { bars, ticks, openCount }
  }, [processes])

  if (bars.length === 0) return null

  return (
    <div style={{ borderRadius: 18, background: 'var(--surface)', boxShadow: 'var(--shadow-card)', padding: '18px 18px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 }}>
        <div style={{ font: "600 13px/1 'Instrument Sans',sans-serif", color: 'var(--ink)' }}>Погодные фронты · 14 дней</div>
        <div className="font-mono" style={{ fontSize: 11, color: 'var(--ink3)' }}>{openCount} активны</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {bars.map(({ p, color, st, left, width }) => (
          <div key={p.id} onClick={() => onOpen(p.id)} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{ font: "600 12px/1 'Instrument Sans',sans-serif", color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.title ?? '(без названия)'}
              </span>
              <span className="font-mono" style={{ fontSize: 9, fontWeight: 600, color: st.color, padding: '2px 7px', borderRadius: 999, background: hexRgba(st.color, 0.16), flex: 'none' }}>
                {st.label}
              </span>
            </div>
            <div style={{ position: 'relative', height: 14, background: 'var(--surface2)', borderRadius: 7, overflow: 'hidden', outline: selectedId === p.id ? `1px solid ${color}` : 'none' }}>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${left}%`, width: `${width}%`, background: `linear-gradient(90deg,${color},${hexRgba(color, 0.5)})`, borderRadius: 7 }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 11 }}>
        {ticks.map((label, i) => (
          <span key={i} className="font-mono" style={{ fontSize: 9, fontWeight: 500, color: 'var(--ink3)' }}>{label}</span>
        ))}
      </div>
    </div>
  )
}

export function ProcessesPage() {
  const [status, setStatus] = useState<ProcessStatus | ''>('')
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null)

  const processesResult = useProcesses({ status: status || undefined, limit: 30 })

  const sentinelRef = useInfiniteScrollTrigger(
    () => processesResult.fetchNextPage(),
    processesResult.hasNextPage === true && !processesResult.isFetchingNextPage,
  )

  const processes = processesResult.data?.pages.flatMap((p) => p.processes) ?? []
  const sorted = useMemo(
    () => [...processes].sort((a, b) => b.importance - a.importance),
    [processes],
  )

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 16px 90px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 className="font-display" style={{ margin: 0, fontSize: 27, fontWeight: 700, color: 'var(--ink)' }}>Процессы</h1>
        <span className="font-mono" style={{ fontSize: 12, color: 'var(--ink3)' }}>фронты во времени</span>
      </div>

      {/* Пилюли-фильтр по статусу. */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {STATUS_OPTIONS.map((opt) => {
          const active = status === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => setStatus(opt.value)}
              style={{
                padding: '7px 13px', borderRadius: 999, cursor: 'pointer', border: 'none',
                background: active ? hexRgba('#37c0d4', 0.16) : 'var(--surface)',
                color: active ? 'var(--accent)' : 'var(--ink2)',
                font: "600 12px/1 'Instrument Sans',sans-serif",
              }}
            >
              {opt.label}
            </button>
          )
        })}
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
        <EmptyState message="Штиль — процессов нет." />
      )}

      {processes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FrontsPanel processes={processes} onOpen={setSelectedProcessId} selectedId={selectedProcessId} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sorted.map((process) => (
              <ProcessCard
                key={process.id}
                process={process}
                onOpen={setSelectedProcessId}
                selected={selectedProcessId === process.id}
              />
            ))}
          </div>
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
