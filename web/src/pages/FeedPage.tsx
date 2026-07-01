/**
 * Главный экран — лента "Важное": Item, отсортированные сервером по важности,
 * с фильтрами и быстрыми действиями прямо в карточке.
 */

import { useMemo, useState } from 'react'
import { useItems, usePatchItem } from '../hooks/useItems'
import { useAreas } from '../hooks/useAreas'
import { useProjects } from '../hooks/useProjects'
import { useTags } from '../hooks/useTags'
import { useInfiniteScrollTrigger } from '../hooks/useInfiniteScrollTrigger'
import { ItemCard } from '../components/items/ItemCard'
import { DEFAULT_FILTERS, ItemFilters, type FiltersState } from '../components/items/ItemFilters'
import { LoadingState, ErrorState, EmptyState } from '../components/common/StateViews'
import type { ItemsQuery } from '../types/api'

function toQuery(filters: FiltersState): ItemsQuery {
  return {
    status: filters.status || undefined,
    area_id: filters.area_id || undefined,
    project_id: filters.project_id || undefined,
    tag: filters.tag || undefined,
    importance_min: filters.importance_min || undefined,
    from: filters.from ? new Date(filters.from).toISOString() : undefined,
    limit: 50,
  }
}

export function FeedPage() {
  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS)
  const query = useMemo(() => toQuery(filters), [filters])

  const itemsResult = useItems(query)
  const areasResult = useAreas()
  const projectsResult = useProjects()
  const tagsResult = useTags()
  const patchMutation = usePatchItem(query)

  const sentinelRef = useInfiniteScrollTrigger(
    () => itemsResult.fetchNextPage(),
    itemsResult.hasNextPage === true && !itemsResult.isFetchingNextPage,
  )

  const items = itemsResult.data?.pages.flatMap((p) => p.items) ?? []
  const areas = areasResult.data ?? []
  const projects = projectsResult.data ?? []
  const tags = tagsResult.data ?? []

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <ItemFilters value={filters} onChange={setFilters} areas={areas} projects={projects} tags={tags} />

      {itemsResult.isLoading && <LoadingState label="Загружаем ленту..." />}

      {itemsResult.isError && (
        <ErrorState
          message={itemsResult.error instanceof Error ? itemsResult.error.message : 'Не удалось загрузить ленту'}
          onRetry={() => itemsResult.refetch()}
        />
      )}

      {!itemsResult.isLoading && !itemsResult.isError && items.length === 0 && (
        <EmptyState message="Ничего не найдено — попробуйте изменить фильтры" />
      )}

      {items.length > 0 && (
        <div className="space-y-3">
          {items.map((item) => (
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
      )}

      <div ref={sentinelRef} />
      {itemsResult.isFetchingNextPage && <LoadingState label="Догружаем..." />}
    </div>
  )
}
