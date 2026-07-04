/**
 * Карточка процесса в списке (морская стилизация funufunu): полоса 6×40px цвета
 * важности слева, заголовок, summary, справа балл «напора фронта» + счётчик
 * событий. Рамка выбранной карточки — цвет важности.
 */

import type { Process } from '../../types/api'
import { weather } from '../../lib/weather'

interface ProcessCardProps {
  process: Process
  onOpen: (id: string) => void
  selected?: boolean
}

export function ProcessCard({ process, onOpen, selected }: ProcessCardProps) {
  const heat = process.importance
  const color = weather(heat).color

  return (
    <div
      onClick={() => onOpen(process.id)}
      style={{
        cursor: 'pointer', borderRadius: 16, background: 'var(--surface)', boxShadow: 'var(--shadow-card)',
        padding: '14px 15px', display: 'flex', alignItems: 'center', gap: 12,
        border: `1px solid ${selected ? color : 'transparent'}`,
      }}
    >
      <span style={{ width: 6, height: 40, borderRadius: 3, background: color, flex: 'none' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "600 14px/1.2 'Instrument Sans',sans-serif", color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {process.title ?? '(без названия)'}
        </div>
        {process.summary && (
          <div style={{ font: "400 12px/1.38 'Instrument Sans',sans-serif", color: 'var(--ink2)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {process.summary}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right', flex: 'none' }}>
        <div className="font-mono" style={{ fontSize: 19, fontWeight: 700, lineHeight: 1, color }}>{heat}</div>
        <div className="font-mono" style={{ fontSize: 10, fontWeight: 500, color: 'var(--ink3)', marginTop: 5 }}>{process.item_count} соб.</div>
      </div>
    </div>
  )
}
