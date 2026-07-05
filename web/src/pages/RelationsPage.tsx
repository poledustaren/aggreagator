/**
 * Экран «Связи»: обзор связей по ТЕМАМ (пузыри тема↔тема, читаемо) с переключением
 * на детальный граф процессов. Клик по теме раскрывает её процессы в панели справа;
 * клик по процессу — детали. Ниже — таймлайн окна по темам.
 */

import { useMemo, useState } from 'react'
import { ApiRequestError } from '../api/client'
import { useProcessGraph } from '../hooks/useProcesses'
import { WindowPicker, defaultWindow, type TimeWindow } from '../components/common/WindowPicker'
import { RelationsGraphSvg } from '../components/relations/RelationsGraphSvg'
import { RelationsThemeGraph, type ThemeBubble, type ThemeLink } from '../components/relations/RelationsThemeGraph'
import { RelationsTimeline } from '../components/relations/RelationsTimeline'
import { RelationsLegend } from '../components/relations/RelationsLegend'
import { SelectionPanel, type Selection } from '../components/relations/SelectionPanel'
import { LoadingState, ErrorState, EmptyState } from '../components/common/StateViews'
import { hexRgba } from '../lib/weather'
import 'vis-timeline/styles/vis-timeline-graph2d.css'
import '../components/processes/vis-timeline-dark.css'
import type { GraphEdge, GraphNode } from '../types/api'

// Палитра тем — по кругу, детерминированно от порядка появления темы в data.themes.
const THEME_COLORS = ['#60a5fa', '#f59e0b', '#34d399', '#f472b6', '#a78bfa', '#fb923c', '#38bdf8', '#4ade80']
const NO_THEME_COLOR = '#525252' // neutral-600 — узлы без темы

const NONE = '__none__'
const MISC = '__misc__'
const MAX_BUBBLES = 16

type View = 'themes' | 'processes'

// Свёртка процессов в темы: крупные темы — отдельные пузыри, мелочь/одиночки — в
// один пузырь «Разрозненные». Плюс агрегированные связи тема↔тема.
function aggregate(nodes: GraphNode[], edges: GraphEdge[]) {
  const groups = new Map<string, GraphNode[]>()
  for (const n of nodes) {
    const k = n.theme || NONE
    const arr = groups.get(k)
    if (arr) arr.push(n)
    else groups.set(k, [n])
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)
  const big = sorted.filter(([, ns]) => ns.length >= 2).slice(0, MAX_BUBBLES)
  const bigKeys = new Set(big.map(([k]) => k))
  const bucketNodes = sorted.filter(([k]) => !bigKeys.has(k)).flatMap(([, ns]) => ns)

  const bubbles: ThemeBubble[] = big.map(([k, ns]) => ({
    key: k,
    name: k === NONE ? 'Без темы' : k,
    count: ns.length,
    maxImp: Math.max(...ns.map((n) => n.importance)),
    isBucket: false,
  }))
  const nodesByBubble = new Map<string, GraphNode[]>(big.map(([k, ns]) => [k, ns]))
  if (bucketNodes.length > 0) {
    bubbles.push({ key: MISC, name: 'Разрозненные', count: bucketNodes.length, maxImp: Math.max(0, ...bucketNodes.map((n) => n.importance)), isBucket: true })
    nodesByBubble.set(MISC, bucketNodes)
  }

  const bubbleOf = new Map<string, string>()
  for (const [k, ns] of nodesByBubble) for (const n of ns) bubbleOf.set(n.id, k)

  const lm = new Map<string, number>()
  for (const e of edges) {
    const a = bubbleOf.get(e.source)
    const b = bubbleOf.get(e.target)
    if (!a || !b || a === b) continue
    const key = a < b ? `${a}|${b}` : `${b}|${a}`
    lm.set(key, (lm.get(key) ?? 0) + 1)
  }
  const links: ThemeLink[] = [...lm.entries()].map(([key, count]) => {
    const [a, b] = key.split('|')
    return { a, b, count }
  })

  const nameByKey = new Map(bubbles.map((b) => [b.key, b.name]))
  return { bubbles, nodesByBubble, links, nameByKey }
}

export function RelationsPage() {
  // Не называем переменную window — затеняет глобальный window (DOM).
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(() => defaultWindow())
  const [view, setView] = useState<View>('themes')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedThemeKey, setSelectedThemeKey] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection>(null)

  const graphResult = useProcessGraph(timeWindow.from, timeWindow.to)
  const data = graphResult.data

  const themeColorMap = useMemo(() => {
    const map = new Map<string, string>()
    ;(data?.themes ?? []).forEach((t, idx) => map.set(t.name, THEME_COLORS[idx % THEME_COLORS.length]))
    return map
  }, [data?.themes])

  const themeColor = (theme: string | null): string => (theme ? (themeColorMap.get(theme) ?? NO_THEME_COLOR) : NO_THEME_COLOR)

  const nodeById = useMemo(() => {
    const map = new Map<string, GraphNode>()
    ;(data?.nodes ?? []).forEach((n) => map.set(n.id, n))
    return map
  }, [data?.nodes])

  const agg = useMemo(() => aggregate(data?.nodes ?? [], data?.edges ?? []), [data?.nodes, data?.edges])

  const resetSelection = () => {
    setSelectedNodeId(null)
    setSelectedThemeKey(null)
    setSelection(null)
  }

  const handleWindowChange = (next: TimeWindow) => {
    setTimeWindow(next)
    resetSelection()
  }

  const handleView = (v: View) => {
    setView(v)
    resetSelection()
  }

  const handleSelectNode = (nodeId: string) => {
    setSelectedThemeKey(null)
    setSelectedNodeId(nodeId)
    const node = nodeById.get(nodeId)
    if (node) setSelection({ kind: 'node', node })
  }

  const handleSelectEdge = (edge: GraphEdge) => {
    setSelectedNodeId(null)
    setSelectedThemeKey(null)
    setSelection({ kind: 'edge', edge, nodes: [nodeById.get(edge.source), nodeById.get(edge.target)] })
  }

  const handleSelectTheme = (key: string) => {
    setSelectedNodeId(null)
    setSelectedThemeKey(key)
    const nodes = agg.nodesByBubble.get(key) ?? []
    const connected = agg.links
      .filter((l) => l.a === key || l.b === key)
      .map((l) => ({ name: agg.nameByKey.get(l.a === key ? l.b : l.a) ?? '?', count: l.count }))
      .sort((a, b) => b.count - a.count)
    const bubble = agg.bubbles.find((b) => b.key === key)
    setSelection({ kind: 'theme', name: bubble?.name ?? key, isBucket: !!bubble?.isBucket, nodes, connected })
  }

  const is503 = graphResult.isError && graphResult.error instanceof ApiRequestError && graphResult.error.status === 503
  const isPaused = graphResult.fetchStatus === 'paused' && graphResult.isPending

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold" style={{ color: 'var(--ink)' }}>Связи</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--ink2)', maxWidth: 560 }}>
            {view === 'themes'
              ? 'Пузырь — тема: размер по числу процессов, цвет ядра — важность. Линии — связи тема↔тема (толще = больше связей). Клик по теме раскроет её процессы.'
              : 'Детальный граф: узел — процесс (цвет темы — halo, балл — важность). Наведите/выберите узел для подписи и деталей.'}
          </p>
        </div>
        <button
          onClick={() => graphResult.regenerate()}
          disabled={graphResult.regenerating || graphResult.isPending}
          className="font-mono shrink-0 rounded-lg px-3 py-2 text-xs disabled:opacity-50"
          style={{ background: 'var(--surface2)', color: 'var(--ink2)', border: 'none' }}
          title="Пересчитать граф заново (обход кэша)"
        >
          {graphResult.regenerating ? 'Считаем…' : '↻ Обновить'}
        </button>
      </div>

      <WindowPicker value={timeWindow} onChange={handleWindowChange} />

      {/* Переключатель обзора: темы (читаемо) / процессы (детально). */}
      <div style={{ display: 'flex', gap: 7 }}>
        {([['themes', 'Темы'], ['processes', 'Процессы']] as const).map(([v, label]) => {
          const active = view === v
          return (
            <button
              key={v}
              onClick={() => handleView(v)}
              style={{
                padding: '7px 15px', borderRadius: 999, cursor: 'pointer', border: 'none',
                background: active ? hexRgba('#37c0d4', 0.16) : 'var(--surface)',
                color: active ? 'var(--accent)' : 'var(--ink2)',
                font: "600 12px/1 'Instrument Sans',sans-serif",
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {graphResult.isPending && !isPaused && (
        <LoadingState label="Строим граф связей (первый раз — до минуты, дальше из кэша мгновенно)..." />
      )}

      {isPaused && (
        <ErrorState message="Нет соединения с сервером — запрос ждёт восстановления сети." onRetry={() => graphResult.refetch()} />
      )}

      {is503 && (
        <ErrorState
          message="Граф связей недоступен: LLM выключен на сервере (llm_provider=none)."
          onRetry={() => graphResult.refetch()}
        />
      )}

      {graphResult.isError && !is503 && (
        <ErrorState
          message={graphResult.error instanceof Error ? graphResult.error.message : 'Не удалось построить граф связей'}
          onRetry={() => graphResult.refetch()}
        />
      )}

      {!graphResult.isPending && !graphResult.isError && data && data.nodes.length === 0 && (
        <EmptyState message="В выбранном окне нет процессов" />
      )}

      {!graphResult.isPending && !graphResult.isError && data && data.nodes.length > 0 && (
        <>
          {data.truncated && (
            <div className="font-mono" style={{ borderRadius: 12, padding: '9px 13px', fontSize: 12, color: '#e0a95a', background: hexRgba('#e0a95a', 0.12) }}>
              В окне процессов больше лимита анализа — учтены {data.nodes.length} крупнейших (по числу сообщений).
              Сузьте окно, чтобы захватить остальные.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
            {view === 'themes' ? (
              <RelationsThemeGraph
                bubbles={agg.bubbles}
                links={agg.links}
                themeColor={themeColor}
                onSelect={handleSelectTheme}
                onDeselect={resetSelection}
                highlightKey={selectedThemeKey}
              />
            ) : (
              <RelationsGraphSvg
                nodes={data.nodes}
                edges={data.edges}
                onSelectNode={handleSelectNode}
                onSelectEdge={handleSelectEdge}
                onDeselect={resetSelection}
                highlightNodeId={selectedNodeId}
                themeColor={themeColor}
              />
            )}
            <div className="space-y-4">
              <SelectionPanel selection={selection} themeColor={themeColor} onSelectNode={handleSelectNode} />
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-medium" style={{ color: 'var(--ink2)' }}>Таймлайн окна (по темам)</h2>
            <RelationsTimeline
              nodes={data.nodes}
              themeColor={themeColor}
              onSelect={handleSelectNode}
              highlightNodeId={selectedNodeId}
            />
            <div className="mt-3">
              <RelationsLegend themes={data.themes} themeColor={themeColor} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
