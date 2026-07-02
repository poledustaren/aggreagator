/**
 * Главная — «Сводка важного»: только inbox-элементы, отсортированные сервером по
 * важности и сгруппированные по зонам (Area). Тезисно (заголовок + summary +
 * предложенное действие), со свайпом прямо на карточке: влево — «Пежня»,
 * вправо — «Готово». Смахнутые/выполненные исчезают из сводки сразу
 * (оптимистичный апдейт статуса + фильтр по inbox на клиенте).
 */

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useItems, usePatchItem } from '../hooks/useItems'
import { useAreas } from '../hooks/useAreas'
import { useProjects } from '../hooks/useProjects'
import { useInfiniteScrollTrigger } from '../hooks/useInfiniteScrollTrigger'
import { ItemCard } from '../components/items/ItemCard'
import { LoadingState, ErrorState, EmptyState } from '../components/common/StateViews'
import type { Area, Item, ItemsQuery } from '../types/api'

const QUERY: ItemsQuery = { status: 'inbox', limit: 50 }

interface AreaGroup {
  area: Area | null
  items: Item[]
}

// Группируем по зоне, сохраняя серверный порядок (важность убыв.). Зоны
// упорядочиваем по максимальной важности элемента внутри — важное сверху.
function groupByArea(items: Item[], areas: Area[]): AreaGroup[] {
  const byId = new Map<string, AreaGroup>()
  const NONE = '∅'
  for (const item of items) {
    const key = item.area_id ?? NONE
    if (!byId.has(key)) {
      byId.set(key, { area: areas.find((a) => a.id === item.area_id) ?? null, items: [] })
    }
    byId.get(key)!.items.push(item)
  }
  return [...byId.values()].sort(
    (a, b) => (b.items[0]?.importance ?? 0) - (a.items[0]?.importance ?? 0),
  )
}

export function DigestPage() {
  const query = useMemo(() => QUERY, [])
  const itemsResult = useItems(query)
  const areasResult = useAreas()
  const projectsResult = useProjects()
  const patchMutation = usePatchItem(query)

  const sentinelRef = useInfiniteScrollTrigger(
    () => itemsResult.fetchNextPage(),
    itemsResult.hasNextPage === true && !itemsResult.isFetchingNextPage,
  )

  const areas = areasResult.data ?? []
  const projects = projectsResult.data ?? []
  // Фильтр по inbox на клиенте: после свайпа оптимистичный апдейт меняет статус,
  // и карточка мгновенно уходит из сводки, не дожидаясь рефетча.
  const items = (itemsResult.data?.pages.flatMap((p) => p.items) ?? []).filter(
    (i) => i.status === 'inbox',
  )
  const groups = useMemo(() => groupByArea(items, areas), [items, areas])

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">Сводка важного</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            {items.length > 0
              ? `${items.length} в разборе · свайп вправо — готово, влево — пежня`
              : 'свайп вправо — готово, влево — пежня'}
          </p>
        </div>
        <Link to="/feed" className="shrink-0 text-sm text-neutral-400 hover:text-neutral-200">
          Вся лента →
        </Link>
      </div>

      {itemsResult.isLoading && <LoadingState label="Собираем сводку..." />}

      {itemsResult.isError && (
        <ErrorState
          message={
            itemsResult.error instanceof Error ? itemsResult.error.message : 'Не удалось загрузить сводку'
          }
          onRetry={() => itemsResult.refetch()}
        />
      )}

      {!itemsResult.isLoading && !itemsResult.isError && items.length === 0 && (
        <EmptyState message="Всё разобрано 🎉 Ничего важного в очереди." />
      )}

      {groups.map((group) => (
        <section key={group.area?.id ?? 'none'} className="space-y-2">
          <h2
            className="text-sm font-medium uppercase tracking-wide text-neutral-500"
            style={group.area?.color ? { color: group.area.color } : undefined}
          >
            {group.area?.name ?? 'Без зоны'}
            <span className="ml-2 text-neutral-600">{group.items.length}</span>
          </h2>
          <div className="space-y-3">
            {group.items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                areas={areas}
                projects={projects}
                pending={patchMutation.isPending && patchMutation.variables?.id === item.id}
                onDone={(id) => patchMutation.mutate({ id, patch: { status: 'done' } })}
                onDismiss={(id) => patchMutation.mutate({ id, patch: { status: 'dismissed' } })}
                onSnooze={(id, until) =>
                  patchMutation.mutate({ id, patch: { status: 'snoozed', snoozed_until: until } })
                }
                onReassign={(id, patch) => patchMutation.mutate({ id, patch })}
              />
            ))}
          </div>
        </section>
      ))}

      <div ref={sentinelRef} />
      {itemsResult.isFetchingNextPage && <LoadingState label="Догружаем..." />}
    </div>
  )
}
