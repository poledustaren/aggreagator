/**
 * Герой «Морская сводка» — балл шторма (среднее importance инбокса) + название
 * градации + мини-гистограмма из 5 стихий. Тёмное «небо» с дрейфующими облаками
 * и рябью в обеих темах. Всё считается из инбокса на клиенте.
 */
import { useMemo } from 'react'
import type { Item } from '../../types/api'
import { WEATHER_SCALE, weather } from '../../lib/weather'

export function SeaHero({ items }: { items: Item[] }) {
  const { score, scoreW, buckets, headline, sub } = useMemo(() => {
    const n = items.length
    const score = n ? Math.round(items.reduce((a, i) => a + i.importance, 0) / n) : 0
    const peak = n ? Math.max(...items.map((i) => i.importance)) : 0
    const counts = [0, 1, 2, 3, 4].map((r) => items.filter((i) => weather(i.importance).rank === r).length)
    const maxC = Math.max(1, ...counts)
    const buckets = counts.map((c, i) => ({
      count: c,
      color: WEATHER_SCALE[i].color,
      label: WEATHER_SCALE[i].label,
      h: Math.round((c / maxC) * 100) + '%',
    }))
    let headline = 'Спокойное море'
    let sub = 'Ничего критичного — можно разгребать в своём темпе.'
    if (peak >= 81) {
      headline = 'Штормовое предупреждение'
      sub = 'Есть ураганы — разберите их первыми, пока не снесло.'
    } else if (peak >= 61) {
      headline = 'Свежий ветер, местами шторм'
      sub = 'Несколько важных фронтов набирают силу — присмотритесь.'
    }
    return { score, scoreW: weather(score), buckets, headline, sub }
  }, [items])

  return (
    <div style={{ position: 'relative', borderRadius: 22, overflow: 'hidden', boxShadow: 'var(--shadow-card)', background: 'linear-gradient(162deg,#0c3c4d,#0a1d29 72%)' }}>
      {/* Дрейфующие облака + рябь. */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div className="anim-drift" style={{ position: 'absolute', top: '6%', left: '-12%', width: '64%', height: 48, background: 'radial-gradient(closest-side,rgba(185,222,232,.17),transparent)', filter: 'blur(7px)' }} />
        <div className="anim-drift2" style={{ position: 'absolute', top: '34%', right: '-14%', width: '58%', height: 44, background: 'radial-gradient(closest-side,rgba(140,190,230,.14),transparent)', filter: 'blur(8px)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '46%', background: 'linear-gradient(180deg,transparent,rgba(12,40,55,.4))' }} />
        <div className="anim-shimmer" style={{ position: 'absolute', left: 0, right: 0, bottom: '33%', height: 2, background: 'repeating-linear-gradient(90deg,#37c0d4,#37c0d4 3px,transparent 3px,transparent 9px)', opacity: 0.22 }} />
      </div>

      <div style={{ position: 'relative', padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div className="font-mono" style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(210,235,240,.72)', letterSpacing: '.06em' }}>
              МОРСКАЯ СВОДКА · ИНБОКС
            </div>
            <div className="font-display" style={{ marginTop: 10, fontSize: 16, fontWeight: 700, lineHeight: 1.18, color: '#eaf6f8' }}>
              {headline}
            </div>
            <div style={{ marginTop: 5, fontSize: 12, lineHeight: 1.42, color: 'rgba(200,225,232,.74)', maxWidth: 230 }}>
              {sub}
            </div>
          </div>
          <div style={{ flex: 'none', textAlign: 'right' }}>
            <div className="font-mono" style={{ fontSize: 9.5, fontWeight: 500, color: 'rgba(210,235,240,.62)' }}>БАЛЛ ШТОРМА</div>
            <div className="font-display" style={{ fontSize: 46, fontWeight: 700, lineHeight: 0.9, color: scoreW.color, marginTop: 5 }}>{score}</div>
            <div className="font-mono" style={{ fontSize: 11, fontWeight: 700, color: scoreW.color, marginTop: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>{scoreW.label}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 7, marginTop: 18 }}>
          {buckets.map((b) => (
            <div key={b.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ width: '100%', height: 36, display: 'flex', alignItems: 'flex-end' }}>
                <div style={{ width: '100%', background: b.color, borderRadius: '5px 5px 3px 3px', height: b.h, minHeight: 4, opacity: 0.92 }} />
              </div>
              <div className="font-mono" style={{ fontSize: 13, fontWeight: 700, color: '#eaf6f8' }}>{b.count}</div>
              <div style={{ fontSize: 9, fontWeight: 500, color: 'rgba(200,225,232,.62)' }}>{b.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
