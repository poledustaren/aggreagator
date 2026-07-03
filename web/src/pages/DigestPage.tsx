/**
 * Главная — «Сводка важного». Два режима (фиксируются в localStorage):
 *  - «Темы»: дерево тематик (persistent, ведётся LLM инкрементально), раскрываемое,
 *    с сообщениями внутри; сортировка по новизне/важности.
 *  - «Зоны»: inbox-элементы, сгруппированные по Area (ручная GTD-раскладка).
 * Везде свайп на карточке: вправо — «Готово», влево — «Пежня».
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useItems, usePatchItem } from '../hooks/useItems'
import { useAreas } from '../hooks/useAreas'
import { useProjects } from '../hooks/useProjects'
import { useInfiniteScrollTrigger } from '../hooks/useInfiniteScrollTrigger'
import {
  useThemes,
  buildThemeTree,
  sortThemeTree,
  type ThemeTreeNode,
  type ThemeSort,
} from '../hooks/useThemes'
import { ItemCard } from '../components/items/ItemCard'
import { ImportanceBadge } from '../components/common/ImportanceBadge'
import { LoadingState, ErrorState, EmptyState } from '../components/common/StateViews'
import type { Area, Item, ItemsQuery } from '../types/api'

type Mode = 'themes' | 'areas'

const MODE_KEY = 'aggregat.digest.mode'
const SORT_KEY = 'aggregat.digest.sort'

function usePersisted<T extends string>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => (localStorage.getItem(key) as T) || fallback)
  const set = (v: T) => {
    localStorage.setItem(key, v)
    setValue(v)
  }
  return [value, set]
}

// Небольшой сегмент-переключатель.
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-lg border border-neutral-800 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1 text-sm ${
            value === o.value ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function DigestPage() {
  const [mode, setMode] = usePersisted<Mode>(MODE_KEY, 'themes')
  const [sort, setSort] = usePersisted<ThemeSort>(SORT_KEY, 'importance')

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">Сводка важного</h1>
          <p className="mt-0.5 text-sm text-neutral-500">свайп вправо — готово, влево — пежня</p>
        </div>
        <Link to="/feed" className="shrink-0 text-sm text-neutral-400 hover:text-neutral-200">
          Вся лента →
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'themes', label: 'Темы' },
            { value: 'areas', label: 'Зоны' },
          ]}
        />
        <Segmented
          value={sort}
          onChange={setSort}
          options={[
            { value: 'importance', label: 'По важности' },
            { value: 'recency', label: 'По новизне' },
          ]}
        />
      </div>

      {mode === 'themes' ? <ThemesDigest sort={sort} /> : <AreasDigest sort={sort} />}
    </div>
  )
}

// ─────────────────────────── Режим «Темы» ───────────────────────────

function ThemesDigest({ sort }: { sort: ThemeSort }) {
  const themesResult = useThemes()
  const tree = useMemo(() => {
    const roots = buildThemeTree(themesResult.data?.themes ?? [])
    return sortThemeTree(roots, sort)
  }, [themesResult.data, sort])

  if (themesResult.isLoading) return <LoadingState label="Собираем темы..." />
  if (themesResult.isError) {
    return (
      <ErrorState
        message={themesResult.error instanceof Error ? themesResult.error.message : 'Не удалось загрузить темы'}
        onRetry={() => themesResult.refetch()}
      />
    )
  }
  const withInbox = tree.filter((t) => t.rollupInbox > 0)
  if (withInbox.length === 0) return <EmptyState message="Всё разобрано 🎉 Ничего важного в темах." />

  return (
    <div className="space-y-2">
      {withInbox.map((node) => (
        <ThemeNodeView key={node.id} node={node} sort={sort} level={0} />
      ))}
    </div>
  )
}

function ThemeNodeView({ node, sort, level }: { node: ThemeTreeNode; sort: ThemeSort; level: number }) {
  const [open, setOpen] = useState(level === 0 && node.rollupInbox <= 8)
  const children = node.children.filter((c) => c.rollupInbox > 0)

  return (
    <div className={level > 0 ? 'ml-3 border-l border-neutral-800 pl-3' : ''}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-neutral-900"
      >
        <span className="w-4 shrink-0 text-neutral-500">{open ? '▾' : '▸'}</span>
        <span className="min-w-0 flex-1 truncate font-medium text-neutral-100">{node.name}</span>
        <span className="shrink-0 rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
          {node.rollupInbox}
        </span>
        <ImportanceBadge value={node.rollupMaxImportance} />
      </button>

      {open && (
        <div className="mt-1 space-y-2">
          {children.map((c) => (
            <ThemeNodeView key={c.id} node={c} sort={sort} level={level + 1} />
          ))}
          {node.inbox_count > 0 && <ThemeItems themeId={node.id} />}
        </div>
      )}
    </div>
  )
}

// Сообщения конкретной темы (ленивая загрузка при раскрытии).
function ThemeItems({ themeId }: { themeId: string }) {
  const query = useMemo<ItemsQuery>(() => ({ theme_id: themeId, status: 'inbox', limit: 50 }), [themeId])
  const itemsResult = useItems(query)
  const areas = useAreas().data ?? []
  const projects = useProjects().data ?? []
  const patchMutation = usePatchItem(query)

  const items = (itemsResult.data?.pages.flatMap((p) => p.items) ?? []).filter((i) => i.status === 'inbox')

  if (itemsResult.isLoading) return <LoadingState label="Загружаем..." />
  return (
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
          onSnooze={(id, until) => patchMutation.mutate({ id, patch: { status: 'snoozed', snoozed_until: until } })}
          onReassign={(id, patch) => patchMutation.mutate({ id, patch })}
        />
      ))}
    </div>
  )
}

// ─────────────────────────── Режим «Зоны» ───────────────────────────

interface AreaGroup {
  area: Area | null
  items: Item[]
}

function groupByArea(items: Item[], areas: Area[], sort: ThemeSort): AreaGroup[] {
  const byId = new Map<string, AreaGroup>()
  const NONE = '∅'
  for (const item of items) {
    const key = item.area_id ?? NONE
    if (!byId.has(key)) byId.set(key, { area: areas.find((a) => a.id === item.area_id) ?? null, items: [] })
    byId.get(key)!.items.push(item)
  }
  const groups = [...byId.values()]
  const score = (g: AreaGroup) =>
    sort === 'importance'
      ? Math.max(...g.items.map((i) => i.importance), 0)
      : Math.max(...g.items.map((i) => new Date(i.created_at).getTime()), 0)
  return groups.sort((a, b) => score(b) - score(a))
}

function AreasDigest({ sort }: { sort: ThemeSort }) {
  const query = useMemo<ItemsQuery>(() => ({ status: 'inbox', limit: 50 }), [])
  const itemsResult = useItems(query)
  const areas = useAreas().data ?? []
  const projects = useProjects().data ?? []
  const patchMutation = usePatchItem(query)

  const sentinelRef = useInfiniteScrollTrigger(
    () => itemsResult.fetchNextPage(),
    itemsResult.hasNextPage === true && !itemsResult.isFetchingNextPage,
  )

  const items = (itemsResult.data?.pages.flatMap((p) => p.items) ?? []).filter((i) => i.status === 'inbox')
  const groups = useMemo(() => groupByArea(items, areas, sort), [items, areas, sort])

  if (itemsResult.isLoading) return <LoadingState label="Собираем сводку..." />
  if (itemsResult.isError) {
    return (
      <ErrorState
        message={itemsResult.error instanceof Error ? itemsResult.error.message : 'Не удалось загрузить сводку'}
        onRetry={() => itemsResult.refetch()}
      />
    )
  }
  if (items.length === 0) return <EmptyState message="Всё разобрано 🎉 Ничего важного в очереди." />

  return (
    <div className="space-y-5">
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
