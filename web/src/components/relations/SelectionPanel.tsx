/**
 * Боковая панель выделения: показывает либо аргументацию ребра (relation +
 * reason + confidence), либо краткую инфо об узле (title, время в окне,
 * item_count, ссылка на таймлайн/процессы). Ничего не выбрано → подсказка.
 */

import { Link } from 'react-router-dom'
import type { GraphEdge, GraphNode } from '../../types/api'
import { ProcessStatusBadge } from '../processes/ProcessStatusBadge'

type Selection = { kind: 'node'; node: GraphNode } | { kind: 'edge'; edge: GraphEdge; nodes: [GraphNode?, GraphNode?] } | null

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU')
}

export function SelectionPanel({ selection }: { selection: Selection }) {
  if (!selection) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-500">
        Кликните по узлу — покажем детали процесса. Кликните по ребру — покажем аргументацию LLM.
      </div>
    )
  }

  if (selection.kind === 'node') {
    const { node } = selection
    return (
      <div className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-neutral-100">{node.title ?? '(без названия)'}</h3>
          <ProcessStatusBadge status={node.status} />
        </div>
        <p className="text-xs text-neutral-500">
          {fmt(node.start)} — {fmt(node.end)}
        </p>
        <p className="text-xs text-neutral-400">{node.item_count} сообщений в окне</p>
        {node.theme && <p className="text-xs text-neutral-400">Тема: {node.theme}</p>}
        <div className="flex gap-3 pt-1 text-xs">
          <Link to={`/timeline?process=${node.id}`} className="text-blue-400 hover:underline">
            Открыть на таймлайне
          </Link>
          <Link to="/processes" className="text-blue-400 hover:underline">
            Список процессов
          </Link>
        </div>
      </div>
    )
  }

  const { edge, nodes } = selection
  const [from, to] = nodes
  return (
    <div className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <h3 className="text-sm font-semibold text-neutral-100">
        {from?.title ?? '?'} → {to?.title ?? '?'}
      </h3>
      <p className="text-xs uppercase tracking-wide text-neutral-500">{edge.relation}</p>
      <p className="text-sm text-neutral-300">{edge.reason}</p>
      <p className="text-xs text-neutral-500">Уверенность: {Math.round(edge.confidence * 100)}%</p>
    </div>
  )
}

export type { Selection }
