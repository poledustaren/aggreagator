/**
 * StormCard — карточка сообщения в морской стилизации funufunu (замена ItemCard).
 * Слева цветная полоса важности, оверлайн «ПОГОДА · время · дата», заголовок,
 * summary, справа балл + волна-спарклайн, чипы (источник/зона/действие) и кнопки
 * Готово / Отложить / Скрыть. Свайп: вправо — готово, влево — скрыть.
 *
 * Теперь на каждой карточке видно и относительное время, и точную дату/время —
 * сразу понятно, что свежее и актуальное.
 */
import { useRef, useState } from 'react'
import type { Area, Item, Project } from '../../types/api'
import { areaColor, hexRgba, wavePath, weather } from '../../lib/weather'
import { formatAbs, formatAgo } from '../../lib/datetime'
import { SnoozeMenu } from './SnoozeMenu'
import { ReassignMenu } from './ReassignMenu'

interface StormCardProps {
  item: Item
  areas: Area[]
  projects: Project[]
  onDone: (id: string) => void
  onDismiss: (id: string) => void
  onSnooze: (id: string, until: string) => void
  onReassign: (id: string, patch: { area_id?: string; project_id?: string }) => void
  pending?: boolean
}

const SWIPE_THRESHOLD = 100

export function StormCard({
  item,
  areas,
  projects,
  onDone,
  onDismiss,
  onSnooze,
  onReassign,
  pending,
}: StormCardProps) {
  const [showSnooze, setShowSnooze] = useState(false)
  const [showReassign, setShowReassign] = useState(false)

  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const lock = useRef<null | 'h' | 'v'>(null)

  const area = areas.find((a) => a.id === item.area_id)
  const w = weather(item.importance)
  const sev = w.color
  const ts = item.created_at

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    start.current = { x: e.clientX, y: e.clientY }
    lock.current = null
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return
    const dx = e.clientX - start.current.x
    const dy = e.clientY - start.current.y
    if (lock.current === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      lock.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
      if (lock.current === 'h') {
        setDragging(true)
        try {
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      }
    }
    if (lock.current === 'h') setDragX(dx)
  }

  const endDrag = () => {
    if (lock.current === 'h') {
      if (dragX <= -SWIPE_THRESHOLD) onDismiss(item.id)
      else if (dragX >= SWIPE_THRESHOLD) onDone(item.id)
    }
    setDragX(0)
    setDragging(false)
    start.current = null
    lock.current = null
  }

  return (
    <div className="relative select-none overflow-hidden" style={{ borderRadius: 18 }}>
      {/* Подсказки под карточкой при свайпе. */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-between px-5 font-mono text-xs font-semibold uppercase"
        style={{
          borderRadius: 18,
          background: dragX > 0 ? hexRgba('#3fbf8f', 0.22) : dragX < 0 ? hexRgba('#f2603f', 0.2) : 'transparent',
        }}
      >
        <span style={{ color: '#3fbf8f', opacity: dragX > 0 ? Math.min(1, dragX / SWIPE_THRESHOLD) : 0 }}>
          ✓ Готово
        </span>
        <span
          style={{ color: '#f2603f', opacity: dragX < 0 ? Math.min(1, -dragX / SWIPE_THRESHOLD) : 0 }}
        >
          Скрыть ✕
        </span>
      </div>

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          position: 'relative',
          display: 'flex',
          gap: 12,
          padding: '14px 15px 14px 16px',
          background: 'var(--surface)',
          borderRadius: 18,
          boxShadow: 'var(--shadow-card)',
          overflow: 'hidden',
          transform: `translateX(${dragX}px)`,
          transition: dragging ? 'none' : 'transform 0.2s ease-out',
          touchAction: 'pan-y',
          opacity: pending ? 0.5 : 1,
        }}
      >
        {/* Полоса важности. */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: sev }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Оверлайн: погода · относительное время · точная дата. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <span
                  className="font-mono"
                  style={{ fontSize: 10.5, fontWeight: 700, color: sev, letterSpacing: '.03em', textTransform: 'uppercase' }}
                >
                  {w.label}
                </span>
                <Dot />
                <span className="font-mono" style={{ fontSize: 10.5, color: 'var(--ink3)' }}>
                  {formatAgo(ts)}
                </span>
                <Dot />
                <span className="font-mono" style={{ fontSize: 10.5, color: 'var(--ink3)' }} title={new Date(ts).toLocaleString('ru-RU')}>
                  {formatAbs(ts)}
                </span>
              </div>
              <h4 style={{ margin: 0, font: "600 15px/1.25 'Instrument Sans',sans-serif", color: 'var(--ink)' }}>
                {item.title}
              </h4>
              {item.summary && (
                <p style={{ margin: '3px 0 0', font: "400 12.5px/1.42 'Instrument Sans',sans-serif", color: 'var(--ink2)' }}>
                  {item.summary}
                </p>
              )}
            </div>
            <div
              style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, width: 50, paddingTop: 2 }}
            >
              <div className="font-mono" style={{ fontSize: 21, fontWeight: 700, lineHeight: 1, color: sev }}>
                {item.importance}
              </div>
              <svg width="46" height="16" viewBox="0 0 46 16" style={{ display: 'block', overflow: 'visible' }}>
                <path d={wavePath(item.importance)} fill="none" stroke={sev} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
              </svg>
            </div>
          </div>

          {/* Чипы: источник(и), зона (клик — сменить), действие. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10 }}>
            {item.source_apps.map((app) => (
              <span
                key={app}
                style={{ display: 'inline-flex', alignItems: 'center', font: "500 11px/1 'Instrument Sans',sans-serif", color: 'var(--ink2)', background: 'var(--surface2)', padding: '4px 9px', borderRadius: 8 }}
              >
                {app}
              </span>
            ))}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowReassign((s) => !s)}
                disabled={pending}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', border: 'none',
                  font: "500 11px/1 'Instrument Sans',sans-serif", padding: '4px 9px', borderRadius: 8,
                  background: area ? hexRgba(areaColor(area.name, area.color), 0.14) : 'var(--surface2)',
                  color: area ? areaColor(area.name, area.color) : 'var(--ink3)',
                }}
                title="Сменить зону/проект"
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: area ? areaColor(area.name, area.color) : 'var(--ink3)' }} />
                {area?.name ?? 'Без зоны'}
              </button>
              {showReassign && (
                <ReassignMenu
                  areas={areas}
                  projects={projects}
                  currentAreaId={item.area_id}
                  currentProjectId={item.project_id}
                  onPick={(patch) => {
                    onReassign(item.id, patch)
                    setShowReassign(false)
                  }}
                  onClose={() => setShowReassign(false)}
                />
              )}
            </div>
            {item.suggested_action && (
              <span style={{ font: "600 11px/1.2 'Instrument Sans',sans-serif", color: 'var(--accent)' }}>
                → {item.suggested_action}
              </span>
            )}
          </div>

          {/* Действия. */}
          <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
            <button
              onClick={() => onDone(item.id)}
              disabled={pending}
              style={{ flex: 1, font: "600 12px/1 'Instrument Sans',sans-serif", color: '#07141c', background: 'var(--accent)', border: 'none', padding: 9, borderRadius: 10, cursor: 'pointer' }}
            >
              Готово
            </button>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowSnooze((s) => !s)}
                disabled={pending}
                style={{ font: "500 12px/1 'Instrument Sans',sans-serif", color: 'var(--ink2)', background: 'var(--surface2)', border: 'none', padding: '9px 13px', borderRadius: 10, cursor: 'pointer' }}
              >
                Отложить
              </button>
              {showSnooze && (
                <SnoozeMenu
                  onPick={(until) => {
                    onSnooze(item.id, until)
                    setShowSnooze(false)
                  }}
                  onClose={() => setShowSnooze(false)}
                />
              )}
            </div>
            <button
              onClick={() => onDismiss(item.id)}
              disabled={pending}
              style={{ font: "500 12px/1 'Instrument Sans',sans-serif", color: 'var(--ink3)', background: 'transparent', border: 'none', padding: '9px 13px', borderRadius: 10, cursor: 'pointer' }}
            >
              Скрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Dot() {
  return <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--ink3)', flex: 'none' }} />
}
