/**
 * Экран групп/тредов: раскрывающиеся треды с вложенными Item.
 */

import { useState } from 'react'
import { useGroups, usePatchItemInGroup } from '../hooks/useGroups'
import { useAreas } from '../hooks/useAreas'
import { useProjects } from '../hooks/useProjects'
import { useInfiniteScrollTrigger } from '../hooks/useInfiniteScrollTrigger'
import { GroupCard } from '../components/groups/GroupCard'
import { LoadingState, ErrorState, EmptyState } from '../components/common/StateViews'
import type { ItemStatus } from '../types/api'

const STATUS_OPTIONS: { value: ItemStatus | ''; label: string }[] = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'snoozed', label: 'Отложено' },
  { value: 'done', label: 'Сделано' },
  { value: 'dismissed', label: 'Отклонено' },
  { value: '', label: 'Все статусы' },
]

export function GroupsPage() {
  const [status, setStatus] = useState<ItemStatus | ''>('inbox')
  const groupsResult = useGroups({ status: status || undefined, limit: 30 })
  const areasResult = useAreas()
  const projectsResult = useProjects()
  const patchMutation = usePatchItemInGroup()

  const sentinelRef = useInfiniteScrollTrigger(
    () => groupsResult.fetchNextPage(),
    groupsResult.hasNextPage === true && !groupsResult.isFetchingNextPage,
  )

  const groups = groupsResult.data?.pages.flatMap((p) => p.groups) ?? []
  const areas = areasResult.data ?? []
  const projects = projectsResult.data ?? []

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ItemStatus | '')}
          className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {groupsResult.isLoading && <LoadingState label="Загружаем треды..." />}

      {groupsResult.isError && (
        <ErrorState
          message={groupsResult.error instanceof Error ? groupsResult.error.message : 'Не удалось загрузить треды'}
          onRetry={() => groupsResult.refetch()}
        />
      )}

      {!groupsResult.isLoading && !groupsResult.isError && groups.length === 0 && (
        <EmptyState message="Треды не найдены" />
      )}

      {groups.length > 0 && (
        <div className="space-y-3">
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              areas={areas}
              projects={projects}
              pendingItemId={patchMutation.isPending ? patchMutation.variables?.id : undefined}
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
      {groupsResult.isFetchingNextPage && <LoadingState label="Догружаем..." />}
    </div>
  )
}
