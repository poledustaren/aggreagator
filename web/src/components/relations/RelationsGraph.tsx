/**
 * Обёртка над vis-network. Как и VisTimelineView, vis-network императивен,
 * поэтому создаём инстанс в useEffect через ref на div и уничтожаем в cleanup
 * при каждой смене входных данных (nodes/edges).
 *
 * Узлы = процессы: цвет по теме (themeColor), размер по item_count.
 * Рёбра = связи: цвет/толщина по confidence, подпись — тип связи.
 * Клик по узлу → onSelectNode(id). Клик по ребру → onSelectEdge(edge).
 */

import { useEffect, useRef } from 'react'
import { Network } from 'vis-network/standalone'
import type { Data, Edge as VisEdge, Node as VisNode, Options } from 'vis-network/standalone'
import type { GraphEdge, GraphNode } from '../../types/api'

interface RelationsGraphProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** Цвет темы узла (name темы → hex), для узлов без темы — нейтральный серый. */
  themeColor: (theme: string | null) => string
  onSelectNode: (nodeId: string) => void
  onSelectEdge: (edge: GraphEdge) => void
  onDeselect: () => void
  /** id узла, который нужно подсветить снаружи (синхронизация с таймлайном). */
  highlightNodeId?: string | null
}

const RELATION_LABELS: Record<string, string> = {
  same_entity: 'та же сущность',
  causal: 'причина/следствие',
  follow_up: 'продолжение',
  same_project: 'тот же проект',
  related: 'связано',
}

const RELATION_COLORS: Record<string, string> = {
  same_entity: '#f472b6',
  causal: '#f59e0b',
  follow_up: '#60a5fa',
  same_project: '#34d399',
  related: '#a3a3a3',
}

function relationLabel(relation: string): string {
  return RELATION_LABELS[relation] ?? relation
}

function relationColor(relation: string): string {
  return RELATION_COLORS[relation] ?? RELATION_COLORS.related
}

// Размер узла по числу сообщений в окне: от 16 до 42px, логарифмически
// (чтобы один процесс с сотней сообщений не «съедал» весь граф).
function nodeSize(itemCount: number): number {
  return Math.min(42, 16 + Math.log2(itemCount + 1) * 8)
}

export function RelationsGraph({
  nodes,
  edges,
  themeColor,
  onSelectNode,
  onSelectEdge,
  onDeselect,
  highlightNodeId,
}: RelationsGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const networkRef = useRef<Network | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const visNodes: VisNode[] = nodes.map((n) => ({
      id: n.id,
      label: n.title ?? '(без названия)',
      color: {
        background: themeColor(n.theme),
        border: n.status === 'open' ? '#10b981' : n.status === 'frozen' ? '#737373' : '#0ea5e9',
        highlight: { background: themeColor(n.theme), border: '#f5f5f5' },
      },
      size: nodeSize(n.item_count),
      font: { color: '#e5e5e5', size: 13 },
      shape: 'dot',
      title: `${n.title ?? '(без названия)'}\n${n.item_count} элементов${n.theme ? `\nТема: ${n.theme}` : ''}`,
    }))

    const visEdges: VisEdge[] = edges.map((e, idx) => ({
      id: idx,
      from: e.source,
      to: e.target,
      label: relationLabel(e.relation),
      color: { color: relationColor(e.relation), highlight: '#f5f5f5' },
      width: 1 + e.confidence * 4,
      font: { color: '#a3a3a3', size: 10, strokeWidth: 0, background: '#171717' },
      smooth: { enabled: true, type: 'continuous', roundness: 0.5 },
      arrows: { to: { enabled: e.relation === 'causal' || e.relation === 'follow_up', scaleFactor: 0.6 } },
    }))

    const data: Data = { nodes: visNodes, edges: visEdges }

    const options: Options = {
      autoResize: true,
      height: '520px',
      nodes: {
        borderWidth: 2,
        shadow: false,
      },
      edges: {
        selectionWidth: 2,
      },
      physics: {
        enabled: true,
        solver: 'forceAtlas2Based',
        forceAtlas2Based: { gravitationalConstant: -60, springLength: 120, springConstant: 0.08 },
        stabilization: { iterations: 150 },
      },
      interaction: {
        hover: true,
        tooltipDelay: 150,
        dragNodes: true,
        zoomView: true,
      },
    }

    const network = new Network(containerRef.current, data, options)
    networkRef.current = network

    network.on('click', (params: { nodes: string[]; edges: number[] }) => {
      if (params.nodes.length > 0) {
        onSelectNode(params.nodes[0])
        return
      }
      if (params.edges.length > 0) {
        const edge = edges[params.edges[0]]
        if (edge) onSelectEdge(edge)
        return
      }
      onDeselect()
    })

    return () => {
      network.destroy()
      networkRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges])

  // Подсветка узла снаружи (клик в таймлайне) — отдельный эффект, не пересоздаёт граф.
  useEffect(() => {
    const network = networkRef.current
    if (!network) return
    if (highlightNodeId) {
      network.selectNodes([highlightNodeId])
      network.focus(highlightNodeId, { scale: 1, animation: { duration: 300, easingFunction: 'easeInOutQuad' } })
    } else {
      network.unselectAll()
    }
  }, [highlightNodeId])

  return <div ref={containerRef} className="rounded-lg border border-neutral-800 bg-neutral-900" />
}
