/**
 * Экран «Связи»: пикер временного окна → граф процессов (vis-network) с
 * LLM-аргументацией рёбер + таймлайн окна снизу (сгруппирован по темам).
 * Выделение синхронизировано: клик по узлу графа подсвечивает полосу
 * на таймлайне и наоборот (через общий selectedNodeId).
 */

import { useMemo, useState } from 'react'
import { ApiRequestError } from '../api/client'
import { useProcessGraph } from '../hooks/useProcesses'
import { WindowPicker, defaultWindow, type TimeWindow } from '../components/common/WindowPicker'
import { RelationsGraph } from '../components/relations/RelationsGraph'
import { RelationsTimeline } from '../components/relations/RelationsTimeline'
import { RelationsLegend } from '../components/relations/RelationsLegend'
import { SelectionPanel, type Selection } from '../components/relations/SelectionPanel'
import { LoadingState, ErrorState, EmptyState } from '../components/common/StateViews'
import 'vis-timeline/styles/vis-timeline-graph2d.css'
import '../components/processes/vis-timeline-dark.css'
import type { GraphEdge, GraphNode } from '../types/api'

// Палитра тем — по кругу, детерминированно от порядка появления темы в data.themes.
const THEME_COLORS = ['#60a5fa', '#f59e0b', '#34d399', '#f472b6', '#a78bfa', '#fb923c', '#38bdf8', '#4ade80']
const NO_THEME_COLOR = '#525252' // neutral-600 — узлы без темы

export function RelationsPage() {
  // Не называем переменную window — затеняет глобальный window (DOM).
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(() => defaultWindow())
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection>(null)

  const graphResult = useProcessGraph(timeWindow.from, timeWindow.to)
  const data = graphResult.data

  // theme name → цвет, стабильно по индексу появления в data.themes.
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

  const handleWindowChange = (next: TimeWindow) => {
    setTimeWindow(next)
    setSelectedNodeId(null)
    setSelection(null)
  }

  const handleSelectNode = (nodeId: string) => {
    setSelectedNodeId(nodeId)
    const node = nodeById.get(nodeId)
    if (node) setSelection({ kind: 'node', node })
  }

  const handleSelectEdge = (edge: GraphEdge) => {
    setSelectedNodeId(null)
    setSelection({ kind: 'edge', edge, nodes: [nodeById.get(edge.source), nodeById.get(edge.target)] })
  }

  const handleDeselect = () => {
    setSelectedNodeId(null)
    setSelection(null)
  }

  const is503 = graphResult.isError && graphResult.error instanceof ApiRequestError && graphResult.error.status === 503
  // fetchStatus === 'paused': TanStack Query поставил запрос на паузу (сеть недоступна,
  // networkMode: 'online' по умолчанию) — данных ещё нет, но это не «ошибка» в смысле
  // ответа сервера. Показываем как отдельное сообщение, а не молчим (иначе белый экран).
  const isPaused = graphResult.fetchStatus === 'paused' && graphResult.isPending

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-neutral-100">Связи</h1>
        <p className="text-sm text-neutral-500">
          Граф процессов в выбранном окне: узлы — процессы, рёбра — связи с LLM-аргументацией.
        </p>
      </div>

      <WindowPicker value={timeWindow} onChange={handleWindowChange} />

      {graphResult.isPending && !isPaused && (
        <LoadingState label="Анализируем связи (LLM думает, это может занять до минуты)..." />
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
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
              В окне процессов больше лимита анализа — показаны 24 крупнейших (по числу сообщений).
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
            <RelationsGraph
              nodes={data.nodes}
              edges={data.edges}
              themeColor={themeColor}
              onSelectNode={handleSelectNode}
              onSelectEdge={handleSelectEdge}
              onDeselect={handleDeselect}
              highlightNodeId={selectedNodeId}
            />
            <div className="space-y-4">
              <SelectionPanel selection={selection} />
              <RelationsLegend themes={data.themes} themeColor={themeColor} />
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-medium text-neutral-400">Таймлайн окна (по темам)</h2>
            <RelationsTimeline
              nodes={data.nodes}
              themeColor={themeColor}
              onSelect={handleSelectNode}
              highlightNodeId={selectedNodeId}
            />
          </div>
        </>
      )}
    </div>
  )
}
