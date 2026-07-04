/**
 * Главная — «Морская сводка». Герой (балл шторма) + два режима (в localStorage):
 *  - «Темы»: дерево тематик (persistent, ведётся LLM инкрементально), раскрываемое.
 *  - «Зоны»: inbox-элементы, сгруппированные по Area.
 * Карточки — StormCard (свайп: вправо готово, влево скрыть). Сортировка по
 * важности/новизне. Балл и стихии считаются из инбокса на клиенте.
 */

import { useMemo, useState } from 'react'
import { useItems, usePatchItem } from '../hooks/useItems'
import { useAreas } from '../hooks/useAreas'
import { useProjects } from '../hooks/useProjects'
import {
  useThemes,
  buildThemeTree,
  sortThemeTree,
  type ThemeTreeNode,
  type ThemeSort,
} from '../hooks/useThemes'
import { StormCard } from '../components/items/StormCard'
import { SeaHero } from '../components/digest/SeaHero'
import { LoadingState, ErrorState, EmptyState } from '../components/common/StateViews'
import { areaColor, hexRgba, weather } from '../lib/weather'
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

// Сегмент-переключатель в стиле funufunu (активный — заливка accent).
function ModeSeg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {options.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              font: "600 12px/1 'Instrument Sans',sans-serif",
              padding: '9px 18px',
              borderRadius: 11,
              border: 'none',
              cursor: 'pointer',
              background: active ? 'var(--accent)' : 'var(--surface)',
              color: active ? '#07141c' : 'var(--ink2)',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// Карточки/действия для StormCard, привязанные к конкретному query.
function useCardActions(query: ItemsQuery) {
  const areas = useAreas().data ?? []
  const projects = useProjects().data ?? []
  const patch = usePatchItem(query)
  const handlers = (item: Item) => ({
    item,
    areas,
    projects,
    pending: patch.isPending && patch.variables?.id === item.id,
    onDone: (id: string) => patch.mutate({ id, patch: { status: 'done' } }),
    onDismiss: (id: string) => patch.mutate({ id, patch: { status: 'dismissed' } }),
    onSnooze: (id: string, until: string) => patch.mutate({ id, patch: { status: 'snoozed', snoozed_until: until } }),
    onReassign: (id: string, p: { area_id?: string; project_id?: string }) => patch.mutate({ id, patch: p }),
  })
  return { areas, handlers }
}

export function DigestPage() {
  const [mode, setMode] = usePersisted<Mode>(MODE_KEY, 'themes')
  const [sort, setSort] = usePersisted<ThemeSort>(SORT_KEY, 'importance')

  // Общий срез инбокса для героя (балл шторма + стихии).
  const heroQuery = useMemo<ItemsQuery>(() => ({ status: 'inbox', limit: 200 }), [])
  const heroResult = useItems(heroQuery)
  const heroItems = useMemo(
    () => (heroResult.data?.pages.flatMap((p) => p.items) ?? []).filter((i) => i.status === 'inbox'),
    [heroResult.data],
  )

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 16px 90px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 className="font-display" style={{ margin: 0, fontSize: 27, fontWeight: 700, color: 'var(--ink)' }}>Сводка</h1>
        <span className="font-mono" style={{ fontSize: 12, color: 'var(--ink3)' }}>важное сейчас</span>
      </div>

      <SeaHero items={heroItems} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}>
        <ModeSeg
          value={mode}
          onChange={setMode}
          options={[
            { value: 'themes', label: 'Темы' },
            { value: 'areas', label: 'Зоны' },
          ]}
        />
        <ModeSeg
          value={sort}
          onChange={setSort}
          options={[
            { value: 'importance', label: 'Важность' },
            { value: 'recency', label: 'Новизна' },
          ]}
        />
      </div>

      {mode === 'themes' ? <ThemesDigest sort={sort} /> : <AreasDigest sort={sort} heroItems={heroItems} loading={heroResult.isLoading} error={heroResult.isError} />}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {withInbox.map((node, i) => (
        <ThemeNodeView key={node.id} node={node} sort={sort} level={0} defaultOpen={i === 0} />
      ))}
    </div>
  )
}

function ThemeNodeView({ node, sort, level, defaultOpen }: { node: ThemeTreeNode; sort: ThemeSort; level: number; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen && node.rollupInbox <= 8)
  const children = node.children.filter((c) => c.rollupInbox > 0)
  const w = weather(node.rollupMaxImportance)

  const body = (
    <div style={{ borderRadius: 18, overflow: 'hidden', background: 'var(--surface)', boxShadow: level === 0 ? 'var(--shadow-card)' : 'none' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ width: 9, height: 27, borderRadius: 4, background: w.color, flex: 'none' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "600 14px/1.2 'Instrument Sans',sans-serif", color: 'var(--ink)' }}>{node.name}</div>
          <div className="font-mono" style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>{node.rollupInbox} сообщ.</div>
        </div>
        <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, color: w.color, padding: '4px 9px', borderRadius: 999, background: hexRgba(w.color, 0.14) }}>{w.label}</span>
        <span className="font-mono" style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink2)', width: 26, textAlign: 'right' }}>{node.rollupMaxImportance}</span>
        <span style={{ color: 'var(--ink3)', fontSize: 12, width: 12, textAlign: 'center' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {children.map((c) => (
            <ThemeNodeView key={c.id} node={c} sort={sort} level={level + 1} />
          ))}
          {node.inbox_count > 0 && <ThemeItems themeId={node.id} />}
        </div>
      )}
    </div>
  )

  return level > 0 ? <div style={{ marginLeft: 4 }}>{body}</div> : body
}

// Сообщения конкретной темы (ленивая загрузка при раскрытии).
function ThemeItems({ themeId }: { themeId: string }) {
  const query = useMemo<ItemsQuery>(() => ({ theme_id: themeId, status: 'inbox', limit: 50 }), [themeId])
  const itemsResult = useItems(query)
  const { handlers } = useCardActions(query)
  const items = (itemsResult.data?.pages.flatMap((p) => p.items) ?? []).filter((i) => i.status === 'inbox')

  if (itemsResult.isLoading) return <LoadingState label="Загружаем..." />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((item) => (
        <StormCard key={item.id} {...handlers(item)} />
      ))}
    </div>
  )
}

// ─────────────────────────── Режим «Зоны» ───────────────────────────

interface AreaGroup {
  key: string
  area: Area | null
  items: Item[]
}

function groupByArea(items: Item[], areas: Area[], sort: ThemeSort): AreaGroup[] {
  const byId = new Map<string, AreaGroup>()
  const NONE = '∅'
  for (const item of items) {
    const key = item.area_id ?? NONE
    if (!byId.has(key)) byId.set(key, { key, area: areas.find((a) => a.id === item.area_id) ?? null, items: [] })
    byId.get(key)!.items.push(item)
  }
  const groups = [...byId.values()]
  for (const g of groups) {
    g.items.sort((a, b) =>
      sort === 'importance'
        ? b.importance - a.importance
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
  }
  const score = (g: AreaGroup) =>
    sort === 'importance'
      ? Math.max(...g.items.map((i) => i.importance), 0)
      : Math.max(...g.items.map((i) => new Date(i.created_at).getTime()), 0)
  return groups.sort((a, b) => score(b) - score(a))
}

function AreasDigest({ sort, heroItems, loading, error }: { sort: ThemeSort; heroItems: Item[]; loading: boolean; error: boolean }) {
  const query = useMemo<ItemsQuery>(() => ({ status: 'inbox', limit: 200 }), [])
  const { areas, handlers } = useCardActions(query)
  const groups = useMemo(() => groupByArea(heroItems, areas, sort), [heroItems, areas, sort])

  if (loading) return <LoadingState label="Собираем сводку..." />
  if (error) return <ErrorState message="Не удалось загрузить сводку" />
  if (heroItems.length === 0) return <EmptyState message="Всё разобрано 🎉 Ничего важного в очереди." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {groups.map((group) => {
        const color = group.area ? areaColor(group.area.name, group.area.color) : '#8098a2'
        return (
          <section key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
              <h3 className="font-mono" style={{ margin: 0, fontSize: 11.5, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color }}>
                {group.area?.name ?? 'Без зоны'}
              </h3>
              <span className="font-mono" style={{ fontSize: 11, color: 'var(--ink3)' }}>{group.items.length}</span>
            </div>
            {group.items.map((item) => (
              <StormCard key={item.id} {...handlers(item)} />
            ))}
          </section>
        )
      })}
    </div>
  )
}
