/**
 * Лента — все сообщения инбокса в морской стилизации. Фильтры-пилюли по стихиям
 * (Всё / Ураган / Шторм / Волны / Спокойно) со счётчиками + StormCard-лента,
 * отсортированная сервером по важности. Быстрые действия и свайп — в карточке.
 */

import { useMemo, useState } from 'react'
import { useItems, usePatchItem } from '../hooks/useItems'
import { useAreas } from '../hooks/useAreas'
import { useProjects } from '../hooks/useProjects'
import { useInfiniteScrollTrigger } from '../hooks/useInfiniteScrollTrigger'
import { StormCard } from '../components/items/StormCard'
import { LoadingState, ErrorState, EmptyState } from '../components/common/StateViews'
import { hexRgba, weather } from '../lib/weather'
import { AXIS_META, axisScore, type Axis } from '../lib/axes'
import type { Item, ItemsQuery } from '../types/api'

const AXES: Axis[] = ['importance', 'urgency', 'stakes', 'action']

// Фильтр по стихиям (rank погоды). 'calm' — Штиль+Рябь (0–40).
type SevFilter = 'all' | 'hurricane' | 'storm' | 'waves' | 'calm'

const FILTERS: { key: SevFilter; label: string; color: string }[] = [
  { key: 'all', label: 'Всё', color: '#37c0d4' },
  { key: 'hurricane', label: 'Ураган', color: '#f2603f' },
  { key: 'storm', label: 'Шторм', color: '#7b6cf2' },
  { key: 'waves', label: 'Волны', color: '#3d86e0' },
  { key: 'calm', label: 'Спокойно', color: '#24b3c9' },
]

function matchSev(item: Item, key: SevFilter): boolean {
  if (key === 'all') return true
  const rank = weather(item.importance).rank
  if (key === 'calm') return rank <= 1
  return rank === { hurricane: 4, storm: 3, waves: 2 }[key]
}

export function FeedPage() {
  const [sev, setSev] = useState<SevFilter>('all')
  const [axis, setAxis] = useState<Axis>('importance')
  const query = useMemo<ItemsQuery>(() => ({ status: 'inbox', limit: 50 }), [])

  const itemsResult = useItems(query)
  const areas = useAreas().data ?? []
  const projects = useProjects().data ?? []
  const patch = usePatchItem(query)

  const sentinelRef = useInfiniteScrollTrigger(
    () => itemsResult.fetchNextPage(),
    itemsResult.hasNextPage === true && !itemsResult.isFetchingNextPage,
  )

  const allItems = (itemsResult.data?.pages.flatMap((p) => p.items) ?? []).filter((i) => i.status === 'inbox')
  const items = useMemo(() => {
    const filtered = allItems.filter((i) => matchSev(i, sev))
    if (axis === 'importance') return filtered
    return [...filtered].sort((a, b) => axisScore(b, axis) - axisScore(a, axis) || b.importance - a.importance)
  }, [allItems, sev, axis])

  const handlers = (item: Item) => ({
    item,
    areas,
    projects,
    pending: patch.isPending && patch.variables?.id === item.id,
    onDone: (id: string) => patch.mutate({ id, patch: { status: 'done' as const } }),
    onDismiss: (id: string) => patch.mutate({ id, patch: { status: 'dismissed' as const } }),
    onSnooze: (id: string, until: string) => patch.mutate({ id, patch: { status: 'snoozed' as const, snoozed_until: until } }),
    onReassign: (id: string, p: { area_id?: string; project_id?: string }) => patch.mutate({ id, patch: p }),
  })

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 16px 90px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 className="font-display" style={{ margin: 0, fontSize: 27, fontWeight: 700, color: 'var(--ink)' }}>Лента</h1>
        <span className="font-mono" style={{ fontSize: 12, color: 'var(--ink3)' }}>все сообщения</span>
      </div>

      {/* Пилюли-стихии со счётчиками. */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => {
          const active = sev === f.key
          const count = allItems.filter((i) => matchSev(i, f.key)).length
          return (
            <button
              key={f.key}
              onClick={() => setSev(f.key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 999,
                cursor: 'pointer', border: 'none',
                background: active ? hexRgba(f.color, 0.16) : 'var(--surface)',
                color: active ? f.color : 'var(--ink2)',
                font: "600 12px/1 'Instrument Sans',sans-serif",
              }}
            >
              {f.label}
              <span className="font-mono" style={{ fontSize: 11, opacity: 0.7 }}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Сортировка по осям: важность / срок / ставки / действие. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        <span className="font-mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink3)' }}>Сортировка</span>
        {AXES.map((a) => {
          const active = axis === a
          const c = AXIS_META[a].color
          return (
            <button
              key={a}
              onClick={() => setAxis(a)}
              style={{
                padding: '6px 12px', borderRadius: 9, cursor: 'pointer', border: 'none',
                background: active ? hexRgba(c, 0.16) : 'var(--surface)',
                color: active ? c : 'var(--ink2)',
                font: "600 12px/1 'Instrument Sans',sans-serif",
              }}
            >
              {AXIS_META[a].label}
            </button>
          )
        })}
      </div>

      {itemsResult.isLoading && <LoadingState label="Загружаем ленту..." />}
      {itemsResult.isError && (
        <ErrorState
          message={itemsResult.error instanceof Error ? itemsResult.error.message : 'Не удалось загрузить ленту'}
          onRetry={() => itemsResult.refetch()}
        />
      )}
      {!itemsResult.isLoading && !itemsResult.isError && items.length === 0 && (
        <EmptyState message="Штиль — в этой категории пусто." />
      )}

      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {items.map((item) => (
            <StormCard key={item.id} {...handlers(item)} />
          ))}
        </div>
      )}

      <div ref={sentinelRef} />
      {itemsResult.isFetchingNextPage && <LoadingState label="Догружаем..." />}
    </div>
  )
}
