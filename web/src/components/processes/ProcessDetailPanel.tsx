/**
 * Модалка с деталями процесса (морская стилизация funufunu): статус, заголовок,
 * summary, балл «напора фронта» + счётчик событий, список Item как read-only
 * шторм-строки (погода · время · заголовок · summary · балл + волна).
 */

import { useProcess } from '../../hooks/useProcesses'
import { LoadingState, ErrorState } from '../common/StateViews'
import { PROCESS_STATUS, wavePath, weather } from '../../lib/weather'
import { formatAbs, formatAgo } from '../../lib/datetime'
import type { Item } from '../../types/api'

interface ProcessDetailPanelProps {
  processId: string
  onClose: () => void
}

function ItemRow({ item }: { item: Item }) {
  const w = weather(item.importance)
  const ts = item.created_at
  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 13px', background: 'var(--surface2)', borderRadius: 12, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: w.color }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span className="font-mono" style={{ fontSize: 10.5, fontWeight: 700, color: w.color, letterSpacing: '.03em', textTransform: 'uppercase' }}>{w.label}</span>
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--ink3)' }} />
          <span className="font-mono" style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{formatAgo(ts)}</span>
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--ink3)' }} />
          <span className="font-mono" style={{ fontSize: 10.5, color: 'var(--ink3)' }} title={new Date(ts).toLocaleString('ru-RU')}>{formatAbs(ts)}</span>
        </div>
        <div style={{ font: "600 14px/1.25 'Instrument Sans',sans-serif", color: 'var(--ink)' }}>{item.title}</div>
        {item.summary && (
          <div style={{ font: "400 12px/1.42 'Instrument Sans',sans-serif", color: 'var(--ink2)', marginTop: 3 }}>{item.summary}</div>
        )}
      </div>
      <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, width: 50, paddingTop: 2 }}>
        <div className="font-mono" style={{ fontSize: 19, fontWeight: 700, lineHeight: 1, color: w.color }}>{item.importance}</div>
        <svg width="46" height="16" viewBox="0 0 46 16" style={{ display: 'block', overflow: 'visible' }}>
          <path d={wavePath(item.importance)} fill="none" stroke={w.color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        </svg>
      </div>
    </div>
  )
}

export function ProcessDetailPanel({ processId, onClose }: ProcessDetailPanelProps) {
  const { data: process, isLoading, isError, error, refetch } = useProcess(processId)
  const heat = process ? process.importance : 0
  const color = weather(heat).color
  const st = process ? PROCESS_STATUS[process.status] : null

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', background: 'rgba(4,10,16,0.6)', padding: 16, paddingTop: 64 }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: 560, borderRadius: 18, background: 'var(--surface)', boxShadow: 'var(--shadow-card)', padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            {st && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                <span className="font-mono" style={{ fontSize: 10, fontWeight: 600, color: st.color, textTransform: 'uppercase', letterSpacing: '.04em' }}>{st.label}</span>
              </div>
            )}
            <h2 className="font-display" style={{ margin: 0, fontSize: 18, fontWeight: 700, lineHeight: 1.2, color: 'var(--ink)' }}>
              {process?.title ?? 'Процесс'}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ flex: 'none', border: 'none', background: 'var(--surface2)', color: 'var(--ink2)', borderRadius: 9, padding: '6px 10px', cursor: 'pointer', font: "500 13px/1 'Instrument Sans',sans-serif" }}
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
            {process.summary && (
              <p style={{ font: "400 12.5px/1.45 'Instrument Sans',sans-serif", color: 'var(--ink2)', margin: '9px 0 0' }}>{process.summary}</p>
            )}

            <div style={{ display: 'flex', gap: 22, marginTop: 14 }}>
              <div>
                <div className="font-mono" style={{ fontSize: 21, fontWeight: 700, lineHeight: 1, color }}>{heat}</div>
                <div className="font-mono" style={{ fontSize: 9, fontWeight: 500, color: 'var(--ink3)', marginTop: 4 }}>важность</div>
              </div>
              <div>
                <div className="font-mono" style={{ fontSize: 21, fontWeight: 700, lineHeight: 1, color: 'var(--ink)' }}>{process.item_count}</div>
                <div className="font-mono" style={{ fontSize: 9, fontWeight: 500, color: 'var(--ink3)', marginTop: 4 }}>событий</div>
              </div>
              <div>
                <div className="font-mono" style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.5 }}>{formatAbs(process.started_at)}</div>
                <div className="font-mono" style={{ fontSize: 9, fontWeight: 500, color: 'var(--ink3)', marginTop: 4 }}>начат</div>
              </div>
            </div>

            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="font-mono" style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>События процесса</div>
              {process.items.length === 0 && (
                <p style={{ font: "400 13px/1.4 'Instrument Sans',sans-serif", color: 'var(--ink3)' }}>В процессе пока нет событий</p>
              )}
              {process.items.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
