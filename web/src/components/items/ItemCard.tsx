/**
 * Карточка одного Item в ленте: заголовок, summary, бейджи, быстрые действия.
 * Поддерживает свайп: влево — «Пежня» (dismiss), вправо — «Готово» (done).
 */

import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Area, Item, Project } from '../../types/api'
import { ImportanceBadge } from '../common/ImportanceBadge'
import { SnoozeMenu } from './SnoozeMenu'
import { ReassignMenu } from './ReassignMenu'

interface ItemCardProps {
  item: Item
  areas: Area[]
  projects: Project[]
  onDone: (id: string) => void
  onDismiss: (id: string) => void
  onSnooze: (id: string, until: string) => void
  onReassign: (id: string, patch: { area_id?: string; project_id?: string }) => void
  pending?: boolean
}

// Порог срабатывания свайпа в пикселях.
const SWIPE_THRESHOLD = 100

export function ItemCard({
  item,
  areas,
  projects,
  onDone,
  onDismiss,
  onSnooze,
  onReassign,
  pending,
}: ItemCardProps) {
  const [showSnooze, setShowSnooze] = useState(false)
  const [showReassign, setShowReassign] = useState(false)

  // Свайп: смещение по X и признак активного перетаскивания.
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const lock = useRef<null | 'h' | 'v'>(null)

  const area = areas.find((a) => a.id === item.area_id)
  const project = projects.find((p) => p.id === item.project_id)

  const onPointerDown = (e: React.PointerEvent) => {
    // Не перехватываем жест, начатый на кнопке/меню — там свои клики.
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

  const doneActive = dragX >= SWIPE_THRESHOLD
  const dismissActive = dragX <= -SWIPE_THRESHOLD

  return (
    <div className="relative select-none overflow-hidden rounded-lg">
      {/* Фон-подсказка под карточкой: слева «Готово», справа «Пежня». */}
      <div
        className={`pointer-events-none absolute inset-0 flex items-center justify-between rounded-lg px-5 text-sm font-semibold ${
          dragX > 0 ? 'bg-emerald-600/25' : dragX < 0 ? 'bg-red-600/25' : ''
        }`}
      >
        <span
          className={doneActive ? 'text-emerald-300' : 'text-emerald-400/70'}
          style={{ opacity: dragX > 0 ? Math.min(1, dragX / SWIPE_THRESHOLD) : 0 }}
        >
          ✓ Готово
        </span>
        <span
          className={dismissActive ? 'text-red-300' : 'text-red-400/70'}
          style={{ opacity: dragX < 0 ? Math.min(1, -dragX / SWIPE_THRESHOLD) : 0 }}
        >
          Пежня ✕
        </span>
      </div>

      {/* Передний план — сама карточка, перетаскивается по X. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: dragging ? 'none' : 'transform 0.2s ease-out',
          touchAction: 'pan-y',
        }}
        className={`relative rounded-lg border border-neutral-800 bg-neutral-900 p-4 ${pending ? 'opacity-50' : ''}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-medium text-neutral-100">{item.title}</h3>
            </div>
            {item.summary && <p className="mt-1 text-sm text-neutral-400">{item.summary}</p>}
          </div>
          <ImportanceBadge value={item.importance} />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
          {item.source_apps.map((app) => (
            <span key={app} className="rounded bg-neutral-800 px-1.5 py-0.5">
              {app}
            </span>
          ))}
          {area && (
            <span
              className="rounded bg-neutral-800 px-1.5 py-0.5"
              style={area.color ? { color: area.color } : undefined}
            >
              {area.name}
            </span>
          )}
          {project && <span className="rounded bg-neutral-800 px-1.5 py-0.5">{project.name}</span>}
          {item.process_id && (
            <Link
              to={`/timeline?process=${item.process_id}`}
              className="rounded bg-purple-500/20 px-1.5 py-0.5 text-purple-300 hover:bg-purple-500/30"
              title="Открыть процесс на таймлайне"
            >
              Процесс
            </Link>
          )}
          {item.tags.map((tag) => (
            <span key={tag} className="rounded bg-neutral-800/60 px-1.5 py-0.5 text-neutral-400">
              #{tag}
            </span>
          ))}
        </div>

        {item.suggested_action && (
          <p className="mt-2 text-sm text-emerald-400/90">→ {item.suggested_action}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => onDone(item.id)}
            disabled={pending}
            className="rounded-md bg-emerald-600/20 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-50"
          >
            Done
          </button>
          <div className="relative">
            <button
              onClick={() => setShowSnooze((s) => !s)}
              disabled={pending}
              className="rounded-md bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
            >
              Snooze
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
            className="rounded-md bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-400 hover:bg-neutral-700 disabled:opacity-50"
          >
            Dismiss
          </button>
          <div className="relative ml-auto">
            <button
              onClick={() => setShowReassign((s) => !s)}
              disabled={pending}
              className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
            >
              Зона/проект
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
        </div>
      </div>
    </div>
  )
}
