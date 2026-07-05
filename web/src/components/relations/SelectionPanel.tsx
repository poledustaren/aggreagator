/**
 * Боковая панель выделения (funufunu): либо аргументация ребра (relation + reason
 * + confidence), либо инфо об узле (title, статус, тема, время в окне, item_count,
 * ссылки). Ничего не выбрано → подсказка.
 */

import { Link } from 'react-router-dom'
import type { GraphEdge, GraphNode } from '../../types/api'
import { PROCESS_STATUS, RELATION_STYLE, hexRgba, weather } from '../../lib/weather'
import { formatAbs } from '../../lib/datetime'

type Selection =
  | { kind: 'node'; node: GraphNode }
  | { kind: 'edge'; edge: GraphEdge; nodes: [GraphNode?, GraphNode?] }
  | null

const card: React.CSSProperties = {
  borderRadius: 16, background: 'var(--surface)', boxShadow: 'var(--shadow-card)', padding: 16,
  display: 'flex', flexDirection: 'column', gap: 9,
}

function StatusPill({ status }: { status: GraphNode['status'] }) {
  const st = PROCESS_STATUS[status] ?? { label: status, color: '#65808c' }
  return (
    <span className="font-mono" style={{ fontSize: 10, fontWeight: 600, color: st.color, textTransform: 'uppercase', letterSpacing: '.04em', padding: '3px 9px', borderRadius: 999, background: hexRgba(st.color, 0.16), flex: 'none' }}>
      {st.label}
    </span>
  )
}

export function SelectionPanel({ selection, themeColor }: { selection: Selection; themeColor: (t: string | null) => string }) {
  if (!selection) {
    return (
      <div style={{ ...card, color: 'var(--ink3)', font: "400 13px/1.5 'Instrument Sans',sans-serif" }}>
        Кликните по циклону — покажем детали процесса. Кликните по линии — аргументацию LLM: почему процессы связаны.
      </div>
    )
  }

  if (selection.kind === 'node') {
    const { node } = selection
    const w = weather(node.importance)
    return (
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <h3 className="font-display" style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.25, color: 'var(--ink)' }}>
            {node.title ?? '(без названия)'}
          </h3>
          <StatusPill status={node.status} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div>
            <div className="font-mono" style={{ fontSize: 21, fontWeight: 700, lineHeight: 1, color: w.color }}>{node.importance}</div>
            <div className="font-mono" style={{ fontSize: 9, color: 'var(--ink3)', marginTop: 4 }}>важность · {w.label}</div>
          </div>
          <div>
            <div className="font-mono" style={{ fontSize: 21, fontWeight: 700, lineHeight: 1, color: 'var(--ink)' }}>{node.item_count}</div>
            <div className="font-mono" style={{ fontSize: 9, color: 'var(--ink3)', marginTop: 4 }}>событий в окне</div>
          </div>
        </div>
        {node.theme && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', font: "500 11px/1 'Instrument Sans',sans-serif", color: themeColor(node.theme), background: hexRgba(themeColor(node.theme), 0.14), padding: '4px 9px', borderRadius: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: themeColor(node.theme) }} />
            {node.theme}
          </span>
        )}
        <p className="font-mono" style={{ margin: 0, fontSize: 11, color: 'var(--ink3)' }}>
          {formatAbs(node.start)} — {formatAbs(node.end)}
        </p>
        <div style={{ display: 'flex', gap: 14, paddingTop: 2, font: "500 12px/1 'Instrument Sans',sans-serif" }}>
          <Link to={`/timeline?process=${node.id}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
            На таймлайне →
          </Link>
          <Link to="/processes" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
            К процессам →
          </Link>
        </div>
      </div>
    )
  }

  const { edge, nodes } = selection
  const [from, to] = nodes
  const st = RELATION_STYLE[edge.relation] ?? RELATION_STYLE.related
  return (
    <div style={card}>
      <span className="font-mono" style={{ alignSelf: 'flex-start', fontSize: 10, fontWeight: 700, color: st.color, textTransform: 'uppercase', letterSpacing: '.05em', padding: '3px 9px', borderRadius: 999, background: hexRgba(st.color, 0.16) }}>
        {st.label}
      </span>
      <h3 style={{ margin: 0, font: "600 14px/1.35 'Instrument Sans',sans-serif", color: 'var(--ink)' }}>
        {from?.title ?? '?'} <span style={{ color: st.color }}>→</span> {to?.title ?? '?'}
      </h3>
      <p style={{ margin: 0, font: "400 13px/1.5 'Instrument Sans',sans-serif", color: 'var(--ink2)' }}>{edge.reason}</p>
      <p className="font-mono" style={{ margin: 0, fontSize: 11, color: 'var(--ink3)' }}>Уверенность LLM: {Math.round(edge.confidence * 100)}%</p>
    </div>
  )
}

export type { Selection }
