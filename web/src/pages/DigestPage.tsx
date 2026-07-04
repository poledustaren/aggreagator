/**
 * Главная — «Морская сводка». Герой (балл шторма) + выбор ГРУППИРОВКИ и ФИЛЬТРА.
 * Группировки: Актуальность (важность+срочность), Сроки (по дедлайнам), Темы
 * (дерево тематик), Зоны (по Area), Процессы (по процессу-истории, важность H7).
 * Фильтр — по стихиям (важности). Карточки — StormCard (свайп готово/скрыть).
 */

import { useMemo, useState } from 'react'
import { useItems, usePatchItem } from '../hooks/useItems'
import { useAreas } from '../hooks/useAreas'
import { useProjects } from '../hooks/useProjects'
import { useProcesses } from '../hooks/useProcesses'
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
import { type Group, groupByActuality, groupByDeadline, groupByProcess } from '../lib/grouping'
import type { Area, Item, ItemsQuery } from '../types/api'

type Mode = 'actuality' | 'deadlines' | 'themes' | 'areas' | 'processes'
type Sev = 'all' | 'hurricane' | 'storm' | 'waves' | 'calm'

const MODE_KEY = 'aggregat.digest.mode'
const SORT_KEY = 'aggregat.digest.sort'
const SEV_KEY = 'aggregat.digest.sev'

const GROUPINGS: { value: Mode; label: string }[] = [
  { value: 'actuality', label: 'Актуальность' },
  { value: 'deadlines', label: 'Сроки' },
  { value: 'themes', label: 'Темы' },
  { value: 'areas', label: 'Зоны' },
  { value: 'processes', label: 'Процессы' },
]

const SEV_FILTERS: { key: Sev; label: string; color: string }[] = [
  { key: 'all', label: 'Всё', color: '#37c0d4' },
  { key: 'hurricane', label: 'Ураган', color: '#f2603f' },
  { key: 'storm', label: 'Шторм', color: '#7b6cf2' },
  { key: 'waves', label: 'Волны', color: '#3d86e0' },
  { key: 'calm', label: 'Спокойно', color: '#24b3c9' },
]

function matchSev(item: Item, key: Sev): boolean {
  if (key === 'all') return true
  const rank = weather(item.importance).rank
  if (key === 'calm') return rank <= 1
  return rank === { hurricane: 4, storm: 3, waves: 2 }[key]
}

function usePersisted<T extends string>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => (localStorage.getItem(key) as T) || fallback)
  const set = (v: T) => {
    localStorage.setItem(key, v)
    setValue(v)
  }
  return [value, set]
}

function Chip({ active, color, onClick, children }: { active: boolean; color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 999,
        cursor: 'pointer', border: 'none',
        background: active ? hexRgba(color, 0.16) : 'var(--surface)',
        color: active ? color : 'var(--ink2)',
        font: "600 12px/1 'Instrument Sans',sans-serif",
      }}
    >
      {children}
    </button>
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
  const [mode, setMode] = usePersisted<Mode>(MODE_KEY, 'actuality')
  const [sort, setSort] = usePersisted<ThemeSort>(SORT_KEY, 'importance')
  const [sev, setSev] = usePersisted<Sev>(SEV_KEY, 'all')

  const heroQuery = useMemo<ItemsQuery>(() => ({ status: 'inbox', limit: 200 }), [])
  const heroResult = useItems(heroQuery)
  const heroItems = useMemo(
    () => (heroResult.data?.pages.flatMap((p) => p.items) ?? []).filter((i) => i.status === 'inbox'),
    [heroResult.data],
  )
  const filtered = useMemo(() => heroItems.filter((i) => matchSev(i, sev)), [heroItems, sev])

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 16px 90px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 className="font-display" style={{ margin: 0, fontSize: 27, fontWeight: 700, color: 'var(--ink)' }}>Сводка</h1>
        <span className="font-mono" style={{ fontSize: 12, color: 'var(--ink3)' }}>важное сейчас</span>
      </div>

      <SeaHero items={heroItems} />

      {/* Управление: как группировать + (для плоских режимов) фильтр по стихиям. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span className="font-mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink3)' }}>Группировка</span>
          {GROUPINGS.map((g) => (
            <Chip key={g.value} active={mode === g.value} color="#37c0d4" onClick={() => setMode(g.value)}>{g.label}</Chip>
          ))}
        </div>
        {mode === 'themes' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span className="font-mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink3)' }}>Сортировка</span>
            <Chip active={sort === 'importance'} color="#3d86e0" onClick={() => setSort('importance')}>Важность</Chip>
            <Chip active={sort === 'recency'} color="#3d86e0" onClick={() => setSort('recency')}>Новизна</Chip>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span className="font-mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink3)' }}>Фильтр</span>
            {SEV_FILTERS.map((f) => {
              const count = heroItems.filter((i) => matchSev(i, f.key)).length
              if (count === 0 && f.key !== 'all' && sev !== f.key) return null
              return (
                <Chip key={f.key} active={sev === f.key} color={f.color} onClick={() => setSev(f.key)}>
                  {f.label}<span className="font-mono" style={{ fontSize: 11, opacity: 0.7 }}>{count}</span>
                </Chip>
              )
            })}
          </div>
        )}
      </div>

      {mode === 'themes' ? (
        <ThemesDigest sort={sort} />
      ) : (
        <FlatGrouped mode={mode} items={filtered} loading={heroResult.isLoading} error={heroResult.isError} empty={heroItems.length === 0} />
      )}
    </div>
  )
}

// ─────────────────── Плоские группировки (актуальность/сроки/зоны/процессы) ───────────────────

function FlatGrouped({ mode, items, loading, error, empty }: { mode: Mode; items: Item[]; loading: boolean; error: boolean; empty: boolean }) {
  const query = useMemo<ItemsQuery>(() => ({ status: 'inbox', limit: 200 }), [])
  const { areas, handlers } = useCardActions(query)
  // Процессы нужны только для режима группировки по процессам (карта id→важность/имя).
  const procResult = useProcesses({ limit: 200 })
  const processes = procResult.data?.pages.flatMap((p) => p.processes) ?? []

  const groups = useMemo<Group[]>(() => {
    if (mode === 'deadlines') return groupByDeadline(items)
    if (mode === 'areas') return groupByAreaGroups(items, areas)
    if (mode === 'processes') return groupByProcess(items, processes)
    return groupByActuality(items)
  }, [mode, items, areas, processes])

  if (loading) return <LoadingState label="Собираем сводку..." />
  if (error) return <ErrorState message="Не удалось загрузить сводку" />
  if (empty) return <EmptyState message="Всё разобрано 🎉 Ничего важного в очереди." />
  if (groups.length === 0) return <EmptyState message="Штиль — под фильтр ничего не попало." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {groups.map((group) => (
        <section key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: group.color, flex: 'none' }} />
            <h3 className="font-mono" style={{ margin: 0, fontSize: 11.5, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: group.color }}>
              {group.label}
            </h3>
            <span className="font-mono" style={{ fontSize: 11, color: 'var(--ink3)' }}>{group.items.length}</span>
            {group.hint && <span className="font-mono" style={{ fontSize: 10, color: 'var(--ink3)', opacity: 0.8 }}>· {group.hint}</span>}
          </div>
          {group.items.map((item) => (
            <StormCard key={item.id} {...handlers(item)} />
          ))}
        </section>
      ))}
    </div>
  )
}

// Группировка по зонам в общий вид Group (важнейшая зона — выше).
function groupByAreaGroups(items: Item[], areas: Area[]): Group[] {
  const byId = new Map<string, Item[]>()
  const NONE = '∅'
  for (const item of items) {
    const key = item.area_id ?? NONE
    ;(byId.get(key) ?? byId.set(key, []).get(key)!).push(item)
  }
  const groups: Group[] = []
  for (const [key, its] of byId) {
    const area = areas.find((a) => a.id === key) ?? null
    its.sort((a, b) => b.importance - a.importance)
    groups.push({
      key,
      label: area?.name ?? 'Без зоны',
      color: area ? areaColor(area.name, area.color) : '#8098a2',
      items: its,
    })
  }
  return groups.sort((a, b) => Math.max(...b.items.map((i) => i.importance), 0) - Math.max(...a.items.map((i) => i.importance), 0))
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
