/**
 * Экран «Треды» — раскрывающиеся треды (Group) со вложенными StormCard.
 * Морская стилизация funufunu: контейнер 720px, заголовок-прогноз, пилюли-фильтр
 * по статусу, карточки-треды с иконкой «течение».
 */

import { useState } from 'react'
import { useGroups, usePatchItemInGroup } from '../hooks/useGroups'
import { useAreas } from '../hooks/useAreas'
import { useProjects } from '../hooks/useProjects'
import { useInfiniteScrollTrigger } from '../hooks/useInfiniteScrollTrigger'
import { GroupCard } from '../components/groups/GroupCard'
import { LoadingState, ErrorState, EmptyState } from '../components/common/StateViews'
import { hexRgba } from '../lib/weather'
import type { ItemStatus } from '../types/api'

const STATUS_OPTIONS: { value: ItemStatus | ''; label: string }[] = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'snoozed', label: 'Отложено' },
  { value: 'done', label: 'Сделано' },
  { value: 'dismissed', label: 'Отклонено' },
  { value: '', label: 'Все' },
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
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 16px 90px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 className="font-display" style={{ margin: 0, fontSize: 27, fontWeight: 700, color: 'var(--ink)' }}>Треды</h1>
        <span className="font-mono" style={{ fontSize: 12, color: 'var(--ink3)' }}>сгруппировано</span>
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

      {groupsResult.isLoading && <LoadingState label="Загружаем треды..." />}

      {groupsResult.isError && (
        <ErrorState
          message={groupsResult.error instanceof Error ? groupsResult.error.message : 'Не удалось загрузить треды'}
          onRetry={() => groupsResult.refetch()}
        />
      )}

      {!groupsResult.isLoading && !groupsResult.isError && groups.length === 0 && (
        <EmptyState message="Штиль — тредов нет." />
      )}

      {groups.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groups.map((group, i) => (
            <GroupCard
              key={group.id}
              group={group}
              areas={areas}
              projects={projects}
              defaultOpen={i === 0}
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
